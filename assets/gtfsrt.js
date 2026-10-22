/*
 * Minimal GTFS-Realtime (Protobuf) decoder for TripUpdate feeds.
 * Decodes only the fields Rennes Control needs; unknown fields are skipped.
 * Spec: https://gtfs.org/realtime/reference/  (gtfs-realtime.proto v2.0)
 * ES2017, no dependency: runs in Safari 12+ (iPad Air 2) and Node.
 */
(function (root) {
  'use strict';

  var TWO32 = 4294967296;

  function Reader(buf) {
    this.buf = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    this.pos = 0;
  }

  // Varint as a JS number. Values up to 2^53 are exact (timestamps fit).
  // Negative int32/int64 (10-byte two's complement) are returned as negatives.
  Reader.prototype.varint = function () {
    var b = this.buf, lo = 0, hi = 0, shift = 0, byte;
    do {
      if (this.pos >= b.length) throw new Error('truncated varint');
      byte = b[this.pos++];
      if (shift < 28) lo += (byte & 0x7f) * Math.pow(2, shift);
      else if (shift === 28) { lo += (byte & 0x0f) * Math.pow(2, 28); hi += (byte & 0x7f) >>> 4; }
      else hi += (byte & 0x7f) * Math.pow(2, shift - 32);
      shift += 7;
    } while (byte & 0x80);
    if (hi >= 0x80000000) return (hi - TWO32) * TWO32 + lo; // two's complement
    return hi * TWO32 + lo;
  };

  Reader.prototype.bytes = function () {
    var len = this.varint(), start = this.pos;
    this.pos += len;
    if (this.pos > this.buf.length) throw new Error('truncated field');
    return this.buf.subarray(start, this.pos);
  };

  Reader.prototype.float32 = function () {
    if (this.pos + 4 > this.buf.length) throw new Error('truncated float');
    var v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4).getFloat32(0, true);
    this.pos += 4;
    return v;
  };

  Reader.prototype.skip = function (wire) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.bytes();
    else if (wire === 5) this.pos += 4;
    else throw new Error('unsupported wire type ' + wire);
  };

  var utf8 = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  function str(bytes) {
    if (utf8) return utf8.decode(bytes);
    return Buffer.from(bytes).toString('utf8');
  }

  // Generic message walker: handlers[fieldNumber](reader, wireType, obj)
  function decode(bytes, handlers, obj) {
    var r = new Reader(bytes);
    while (r.pos < r.buf.length) {
      var key = r.varint(), field = Math.floor(key / 8), wire = key & 7;
      var h = handlers[field];
      if (h) h(r, wire, obj); else r.skip(wire);
    }
    return obj;
  }

  function signed32(v) { return v > 0x7fffffff && v < TWO32 ? v - TWO32 : v; }

  var StopTimeEvent = {
    1: function (r, w, o) { o.delay = signed32(r.varint()); },
    2: function (r, w, o) { o.time = r.varint(); },
    3: function (r, w, o) { o.uncertainty = r.varint(); }
  };
  var StopTimeUpdate = {
    1: function (r, w, o) { o.stopSequence = r.varint(); },
    2: function (r, w, o) { o.arrival = decode(r.bytes(), StopTimeEvent, {}); },
    3: function (r, w, o) { o.departure = decode(r.bytes(), StopTimeEvent, {}); },
    4: function (r, w, o) { o.stopId = str(r.bytes()); },
    5: function (r, w, o) { o.scheduleRelationship = r.varint(); }
  };
  var TripDescriptor = {
    1: function (r, w, o) { o.tripId = str(r.bytes()); },
    2: function (r, w, o) { o.startTime = str(r.bytes()); },
    3: function (r, w, o) { o.startDate = str(r.bytes()); },
    4: function (r, w, o) { o.scheduleRelationship = r.varint(); },
    5: function (r, w, o) { o.routeId = str(r.bytes()); },
    6: function (r, w, o) { o.directionId = r.varint(); }
  };
  var VehicleDescriptor = {
    1: function (r, w, o) { o.id = str(r.bytes()); },
    2: function (r, w, o) { o.label = str(r.bytes()); }
  };
  var TripUpdate = {
    1: function (r, w, o) { o.trip = decode(r.bytes(), TripDescriptor, {}); },
    2: function (r, w, o) { o.stopTimeUpdates.push(decode(r.bytes(), StopTimeUpdate, {})); },
    3: function (r, w, o) { o.vehicle = decode(r.bytes(), VehicleDescriptor, {}); },
    4: function (r, w, o) { o.timestamp = r.varint(); },
    5: function (r, w, o) { o.delay = signed32(r.varint()); }
  };
  function float(r, w) { return w === 5 ? r.float32() : r.varint(); }
  var Position = {
    1: function (r, w, o) { o.latitude = float(r, w); },
    2: function (r, w, o) { o.longitude = float(r, w); },
    3: function (r, w, o) { o.bearing = float(r, w); },
    5: function (r, w, o) { o.speed = float(r, w); }
  };
  var VehiclePosition = {
    1: function (r, w, o) { o.trip = decode(r.bytes(), TripDescriptor, {}); },
    2: function (r, w, o) { o.position = decode(r.bytes(), Position, {}); },
    3: function (r, w, o) { o.currentStopSequence = r.varint(); },
    4: function (r, w, o) { o.currentStatus = r.varint(); },
    5: function (r, w, o) { o.timestamp = r.varint(); },
    7: function (r, w, o) { o.stopId = str(r.bytes()); },
    8: function (r, w, o) { o.vehicle = decode(r.bytes(), VehicleDescriptor, {}); }
  };
  var FeedEntity = {
    1: function (r, w, o) { o.id = str(r.bytes()); },
    2: function (r, w, o) { o.isDeleted = !!r.varint(); },
    3: function (r, w, o) { o.tripUpdate = decode(r.bytes(), TripUpdate, { stopTimeUpdates: [] }); },
    4: function (r, w, o) { o.vehicle = decode(r.bytes(), VehiclePosition, { currentStatus: 2 }); }
  };
  var FeedHeader = {
    1: function (r, w, o) { o.version = str(r.bytes()); },
    2: function (r, w, o) { o.incrementality = r.varint(); },
    3: function (r, w, o) { o.timestamp = r.varint(); }
  };
  var FeedMessage = {
    1: function (r, w, o) { o.header = decode(r.bytes(), FeedHeader, {}); },
    2: function (r, w, o) { o.entities.push(decode(r.bytes(), FeedEntity, {})); }
  };

  function decodeFeed(buffer) {
    var feed = decode(new Uint8Array(buffer), FeedMessage, { header: null, entities: [] });
    if (!feed.header || !feed.header.version) throw new Error('not a GTFS-RT feed (missing header)');
    return feed;
  }

  var api = {
    decodeFeed: decodeFeed,
    TRIP: { SCHEDULED: 0, ADDED: 1, UNSCHEDULED: 2, CANCELED: 3, REPLACEMENT: 5, DUPLICATED: 6, DELETED: 7 },
    STOP: { SCHEDULED: 0, SKIPPED: 1, NO_DATA: 2, UNSCHEDULED: 3 },
    VEHICLE: { INCOMING_AT: 0, STOPPED_AT: 1, IN_TRANSIT_TO: 2 }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GtfsRt = api;
})(this);
