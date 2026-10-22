/*
 * Merge the theoretical schedule (data/schedule.json, from the STAR GTFS)
 * with the GTFS-RT TripUpdates feed. Pure functions, shared by the page and
 * by the Node tests.
 *
 * Status of each departure:
 *   live      - trip has a vehicle assigned in the RT feed: time is a real-time prediction
 *   scheduled - no vehicle tracked: time comes from the timetable (GTFS or RT copy of it)
 *   canceled  - trip CANCELED/DELETED, or this stop SKIPPED, in the RT feed
 */
(function (root) {
  'use strict';

  var TRIP_CANCELED = 3, TRIP_DELETED = 7, STOP_SKIPPED = 1, STOP_NO_DATA = 2;

  // Index the RT feed: tripId -> { tripUpdate, stu (update for our stop or null) }
  function indexFeed(feed, stopId) {
    var byTrip = {};
    if (!feed) return byTrip;
    feed.entities.forEach(function (e) {
      var tu = e.tripUpdate;
      if (e.isDeleted || !tu || !tu.trip || !tu.trip.tripId) return;
      var stu = null;
      for (var i = 0; i < tu.stopTimeUpdates.length; i++) {
        if (tu.stopTimeUpdates[i].stopId === stopId) { stu = tu.stopTimeUpdates[i]; break; }
      }
      byTrip[tu.trip.tripId] = { tu: tu, stu: stu };
    });
    return byTrip;
  }

  function eventTime(stu) {
    var ev = stu.departure && (stu.departure.time || stu.departure.delay !== undefined) ? stu.departure : stu.arrival;
    return ev || null;
  }

  /*
   * schedule: parsed schedule.json
   * feed:     decoded GTFS-RT feed, or null when unavailable / stale
   * nowSec:   current time, unix seconds
   * opts:     { perLine: 4, horizonSec: 6h, graceSec: 30 }
   * returns { C4: [dep...], C6: [dep...] } sorted chronologically
   */
  function buildBoard(schedule, feed, nowSec, opts) {
    opts = opts || {};
    var perLine = opts.perLine || 4;
    var horizon = nowSec + (opts.horizonSec || 6 * 3600);
    var grace = opts.graceSec === undefined ? 30 : opts.graceSec;
    var rt = indexFeed(feed, schedule.stop.id);
    var board = {};
    Object.keys(schedule.lines).forEach(function (k) { board[k] = []; });

    // Scan a window wide enough to catch late buses whose scheduled time is past.
    var from = nowSec - 3600;
    schedule.departures.forEach(function (d) {
      if (d.t < from || d.t > horizon || !board[d.line]) return;
      var dep = { trip: d.trip, line: d.line, scheduled: d.t, time: d.t, status: 'scheduled',
                  delay: null, vehicle: null, uncertainty: null };
      var hit = rt[d.trip];
      if (hit) {
        var tu = hit.tu, rel = tu.trip.scheduleRelationship;
        if (rel === TRIP_CANCELED || rel === TRIP_DELETED) {
          dep.status = 'canceled';
        } else if (hit.stu && hit.stu.scheduleRelationship === STOP_SKIPPED) {
          dep.status = 'canceled';
        } else if (hit.stu && hit.stu.scheduleRelationship !== STOP_NO_DATA) {
          var ev = eventTime(hit.stu);
          var t = ev && ev.time ? ev.time : (ev && ev.delay !== undefined ? d.t + ev.delay : null);
          if (t) {
            dep.time = t;
            if (tu.vehicle && tu.vehicle.id) {
              dep.status = 'live';
              dep.vehicle = tu.vehicle.label || tu.vehicle.id;
              dep.delay = t - d.t;
              dep.uncertainty = ev.uncertainty === undefined ? null : ev.uncertainty;
            }
          }
        } else if (!hit.stu && tu.vehicle && tu.vehicle.id && tu.stopTimeUpdates.length) {
          // Tracked trip whose remaining stops no longer include ours: it has passed.
          var first = tu.stopTimeUpdates[0], fev = eventTime(first);
          if (fev && fev.time && fev.time > d.t && d.t < nowSec) dep.passed = true;
        }
      }
      if (dep.passed) return;
      if (dep.status === 'canceled' ? dep.scheduled < nowSec - grace : dep.time < nowSec - grace) return;
      board[d.line].push(dep);
    });

    Object.keys(board).forEach(function (k) {
      board[k].sort(function (a, b) { return a.time - b.time || a.scheduled - b.scheduled; });
      board[k] = board[k].slice(0, perLine);
    });
    return board;
  }

  // "dans 3 min" style countdown, rounded down like STAR displays.
  function countdown(depSec, nowSec) {
    var s = depSec - nowSec;
    if (s < 30) return 'à quai';
    if (s < 90) return 'dans 1 min';
    var m = Math.floor(s / 60);
    if (m < 60) return 'dans ' + m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return 'dans ' + h + ' h' + (r ? ' ' + (r < 10 ? '0' : '') + r : '');
  }

  // Only report a delay when it is meaningful (>= 1 min either way).
  function delayLabel(delaySec) {
    if (delaySec === null || delaySec === undefined) return null;
    var m = Math.round(delaySec / 60);
    if (m === 0) return { text: "à l'heure", kind: 'ontime' };
    return m > 0 ? { text: '+' + m + ' min', kind: 'late' } : { text: '−' + (-m) + ' min', kind: 'early' };
  }

  var api = { buildBoard: buildBoard, countdown: countdown, delayLabel: delayLabel, indexFeed: indexFeed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Departures = api;
})(this);
