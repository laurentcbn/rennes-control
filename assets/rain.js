/*
 * "Will it rain within the hour, and for how long?" from Open-Meteo's 15-minute
 * precipitation forecast. Times are local ISO strings ("YYYY-MM-DDTHH:MM").
 * Pure function, tested in tests/rain.js.
 */
(function (root) {
  'use strict';

  var WET = 0.1; // mm per 15 min

  function toMin(iso) {
    return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), +iso.slice(11, 13), +iso.slice(14, 16)) / 60000;
  }
  function dur(m) {
    if (m < 60) return '~' + Math.max(15, Math.round(m / 5) * 5) + ' min';
    var h = Math.floor(m / 60), r = Math.round((m % 60) / 15) * 15;
    return '~' + h + ' h' + (r ? (r === 60 ? '' : ' ' + r) : '');
  }

  // returns { now: bool, inMin: number|null, forMin: number|null, text }
  function rainOutlook(m15, currentTime) {
    if (!m15 || !m15.time || !m15.precipitation || !currentTime) return null;
    var now = toMin(currentTime), slots = [];
    for (var i = 0; i < m15.time.length; i++) {
      var start = toMin(m15.time[i]), p = m15.precipitation[i];
      if (start + 15 <= now || p === null || p === undefined) continue;
      slots.push({ start: start, wet: p >= WET });
    }
    if (!slots.length) return null;
    var horizon = slots[slots.length - 1].start + 15;

    function dryAfter(k) { // first dry slot from index k
      for (var j = k; j < slots.length; j++) if (!slots[j].wet) return slots[j].start;
      return null;
    }

    if (slots[0].wet) {
      var end = dryAfter(0);
      var left = end === null ? null : Math.max(15, end - now);
      return { now: true, inMin: 0, forMin: left,
        text: left === null ? 'Il pleut · pour au moins ' + dur(horizon - now).slice(1) : 'Il pleut · encore ' + dur(left) };
    }
    for (var k = 0; k < slots.length; k++) {
      if (slots[k].start - now > 60) break;
      if (slots[k].wet) {
        var inMin = Math.max(0, slots[k].start - now), stop = dryAfter(k);
        var len = stop === null ? null : stop - slots[k].start;
        return { now: false, inMin: inMin, forMin: len,
          text: 'Pluie dans ' + (inMin < 5 ? 'quelques minutes' : Math.round(inMin / 5) * 5 + ' min') +
            (len === null ? ' · pour un moment' : ' · pendant ' + dur(len)) };
      }
    }
    return { now: false, inMin: null, forMin: null, text: 'Pas de pluie dans l’heure' };
  }

  var api = { rainOutlook: rainOutlook };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Rain = api;
})(this);
