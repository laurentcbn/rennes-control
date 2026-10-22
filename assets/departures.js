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

  /*
   * Place the approaching buses on the shared track (stops upstream of ours).
   * Uses the VehiclePositions feed: the stop the bus is at or heading to, and its
   * GPS fix to interpolate between two stops. Only trips of our schedule (right
   * line, direction and destination) are kept; buses that have passed our stop
   * are dropped.
   * returns [{ line, vehicle, pos (0 .. track.length-1), atStop, far }]
   */
  function trackPositions(schedule, vpFeed, nowSec, maxAgeSec) {
    var out = [], track = schedule.tracks && (schedule.tracks.C4 || schedule.tracks.C6);
    if (!vpFeed || !track) return out;
    var trips = {};
    schedule.departures.forEach(function (d) { trips[d.trip] = d.line; });
    var index = {};
    track.forEach(function (s, i) { index[s.id] = i; });
    var last = track.length - 1;

    vpFeed.entities.forEach(function (e) {
      var v = e.vehicle;
      if (!v || !v.trip || !trips[v.trip.tripId]) return;
      if (v.timestamp && nowSec - v.timestamp > (maxAgeSec || 300)) return; // stale fix
      var line = trips[v.trip.tripId], i = index[v.stopId];
      var bus = { line: line, vehicle: (v.vehicle && (v.vehicle.label || v.vehicle.id)) || '?', trip: v.trip.tripId };
      if (i === undefined) return;           // elsewhere on the route (or already past us)
      if (v.currentStatus === 1) {           // STOPPED_AT
        bus.pos = i; bus.atStop = true;
      } else if (i === 0) {                  // heading to the first drawn stop: still further away
        bus.pos = 0; bus.far = true;
      } else {
        bus.pos = i - 1 + segmentFraction(track[i - 1], track[i], v.position);
      }
      if (bus.pos > last) bus.pos = last;
      out.push(bus);
    });
    out.sort(function (a, b) { return b.pos - a.pos; });
    return out;
  }

  // Fraction (0..1) of the way from stop a to stop b, projecting the GPS fix on the segment.
  function segmentFraction(a, b, p) {
    if (!p || !p.latitude) return 0.5;
    var k = Math.cos(a.lat * Math.PI / 180);
    var ax = a.lon * k, ay = a.lat, bx = b.lon * k, by = b.lat, px = p.longitude * k, py = p.latitude;
    var dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    if (!len) return 0.5;
    var t = ((px - ax) * dx + (py - ay) * dy) / len;
    return Math.max(0.05, Math.min(0.95, t));
  }

  /*
   * Keep the STAR alerts that matter at Pont de Châteaudun.
   *   major: strike / demonstration / no or reduced service on the whole network or on C4/C6
   *          (also announced ones starting within 36 h)
   *   local: other active alerts on C4/C6 touching our stop or the stops just before it
   * Alerts about stops elsewhere on the lines are left out.
   * returns { major: [item], local: [item], movedStops: { stopId: true } }
   * item = { id, lines: ['C4'], title, text, until, upcoming, stops: [names] }
   */
  var STRIKE = 4, DEMONSTRATION = 5, NO_SERVICE = 1, REDUCED_SERVICE = 2;

  function text(t) {
    if (!t || !t.translations || !t.translations.length) return '';
    var fr = t.translations.filter(function (x) { return !x.language || x.language === 'fr'; })[0] || t.translations[0];
    return (fr.text || '').replace(/\u00a0/g, ' ').trim();
  }

  function relevantAlerts(schedule, feed, nowSec) {
    var out = { major: [], local: [], movedStops: {} };
    if (!feed || !schedule.tracks) return out;
    var routeLine = {}, track = schedule.tracks.C4 || [], stopName = {};
    Object.keys(schedule.lines).forEach(function (k) { routeLine[schedule.lines[k].route_id] = k; });
    track.forEach(function (st) { stopName[st.id] = st.name; });
    var seen = {};

    feed.entities.forEach(function (e) {
      var a = e.alert;
      if (!a) return;
      var active = !a.activePeriods.length || a.activePeriods.some(function (p) {
        return (p.start || 0) <= nowSec && (!p.end || nowSec < p.end);
      });
      var startsSoon = !active && a.activePeriods.some(function (p) { return p.start > nowSec && p.start - nowSec < 36 * 3600; });
      var lines = {}, stops = {}, network = false, lineWide = false, local = false;
      a.informedEntities.forEach(function (x) {
        var line = x.routeId ? routeLine[x.routeId] : null;
        if (!x.routeId && !x.stopId) network = true;
        if (line) lines[line] = true;
        if (line && !x.stopId) lineWide = true;
        if (x.stopId && stopName[x.stopId] && (line || !x.routeId)) { local = true; stops[x.stopId] = true; }
      });
      var ours = network || lineWide || local || Object.keys(lines).length > 0;
      var major = (a.cause === STRIKE || a.cause === DEMONSTRATION || a.effect === NO_SERVICE || a.effect === REDUCED_SERVICE) && ours;
      if (!(major && (active || startsSoon)) && !(active && (network || lineWide || local))) return;

      var until = null, from = null;
      a.activePeriods.forEach(function (p) {
        if (p.end && (!until || p.end > until)) until = p.end;
        if (p.start > nowSec && (!from || p.start < from)) from = p.start;
      });
      var desc = text(a.descriptionText).split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
      var item = {
        id: e.id, title: text(a.headerText) || 'Info trafic',
        lines: Object.keys(lines).filter(function (k) { return lines[k]; }).sort(),
        stops: track.filter(function (st) { return stops[st.id]; }).map(function (st) { return st.name; }),
        text: desc.filter(function (l) { return !/^(jusqu|du |à partir|a partir)/i.test(l); })[0] || desc[0] || '',
        until: until, upcoming: !active, from: from, network: network, strike: a.cause === STRIKE
      };
      var key = item.title + '|' + item.stops.join(',') + '|' + until;
      if (seen[key]) { // same notice published for C4 and C6
        item.lines.forEach(function (l) { if (seen[key].lines.indexOf(l) === -1) seen[key].lines.push(l); });
        seen[key].lines.sort();
        return;
      }
      seen[key] = item;
      if (major) out.major.push(item);
      else { out.local.push(item); if (active) Object.keys(stops).forEach(function (id) { out.movedStops[id] = true; }); }
    });
    return out;
  }

  var api = { buildBoard: buildBoard, trackPositions: trackPositions, relevantAlerts: relevantAlerts, countdown: countdown, delayLabel: delayLabel, indexFeed: indexFeed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Departures = api;
})(this);
