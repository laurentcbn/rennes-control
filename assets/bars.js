/*
 * Opening status of the bars listed in data/bars.json, in Europe/Paris time.
 * A range closing at or before its opening time (e.g. 18:00-01:00) ends the next day.
 * Pure function, tested in tests/bars.js.
 */
(function (root) {
  'use strict';

  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var LABEL = { mon: 'lundi', tue: 'mardi', wed: 'mercredi', thu: 'jeudi', fri: 'vendredi', sat: 'samedi', sun: 'dimanche' };

  function minutes(hhmm) { var p = hhmm.split(':'); return +p[0] * 60 + +p[1]; }
  function hLabel(hhmm) { var p = hhmm.split(':'); return +p[0] + 'h' + (p[1] !== '00' ? p[1] : ''); }

  // dayIndex: 0 = monday; minuteOfDay: 0..1439 (local Paris time)
  function barStatus(bar, dayIndex, minuteOfDay) {
    var today = DAYS[dayIndex], yesterday = DAYS[(dayIndex + 6) % 7];
    var ranges = function (d) { return (bar.hours && bar.hours[d]) || []; };

    // still open from last night?
    var late = ranges(yesterday).filter(function (r) { return minutes(r[1]) <= minutes(r[0]) && minuteOfDay < minutes(r[1]); })[0];
    if (late) return open(late[1], minutes(late[1]) - minuteOfDay);

    var cur = ranges(today).filter(function (r) {
      var a = minutes(r[0]), b = minutes(r[1]);
      return minuteOfDay >= a && (b <= a || minuteOfDay < b);
    })[0];
    if (cur) {
      var end = minutes(cur[1]), left = end <= minutes(cur[0]) ? 1440 - minuteOfDay + end : end - minuteOfDay;
      return open(cur[1], left);
    }

    var later = ranges(today).filter(function (r) { return minutes(r[0]) > minuteOfDay; })
      .sort(function (a, b) { return minutes(a[0]) - minutes(b[0]); })[0];
    if (later) return { open: false, text: 'ouvre à ' + hLabel(later[0]), soon: minutes(later[0]) - minuteOfDay <= 60 };
    for (var i = 1; i <= 7; i++) {
      var d = DAYS[(dayIndex + i) % 7], r = ranges(d)[0];
      if (r) return { open: false, text: (i === 1 ? 'ouvre demain ' : 'ouvre ' + LABEL[d] + ' ') + hLabel(r[0]) };
    }
    return { open: false, text: 'fermé' };
  }

  function open(until, left) {
    return { open: true, closingSoon: left <= 45, text: (left <= 45 ? 'ferme bientôt · ' : 'ouvert · jusqu’à ') + hLabel(until) };
  }

  var api = { barStatus: barStatus, DAYS: DAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Bars = api;
})(this);
