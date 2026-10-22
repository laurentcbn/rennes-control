// Which STAR alerts are shown, and how the butler reacts. Usage: node tests/alerts.js
const assert = require('assert');
const D = require('../assets/departures.js'), B = require('../assets/butler.js');
const s = require('../data/schedule.json');
const now = 2000000000, t = s.tracks.C4;
const tr = x => ({ translations: [{ text: x, language: 'fr' }] });
const alert = (id, cause, ents, periods, header, desc) => ({ id, alert: { cause, effect: 8, informedEntities: ents,
  activePeriods: periods || [], headerText: tr(header || 'Travaux'), descriptionText: tr(desc || '') } });
const feed = { header: {}, entities: [
  alert('works-c4', 10, [{ routeId: '7-0004', stopId: t[0].id }, { routeId: '7-0004', stopId: t[1].id }], [{ start: now - 10, end: now + 86400 }]),
  alert('works-c6', 10, [{ routeId: '7-0006', stopId: t[0].id }, { routeId: '7-0006', stopId: t[1].id }], [{ start: now - 10, end: now + 86400 }]),
  alert('far-away', 10, [{ routeId: '7-0006', stopId: '7-2050' }], []),                      // stop elsewhere: hidden
  alert('other-line', 4, [{ routeId: '7-0001' }], []),                                       // strike on metro a only: hidden
  alert('expired', 10, [{ routeId: '7-0004' }], [{ start: now - 900, end: now - 10 }]),        // over: hidden
  alert('strike', 4, [{ agencyId: '1' }], [{ start: now + 3600 * 20, end: now + 3600 * 40 }], 'Grève', 'Mouvement social.\nService réduit.')
]};
const r = D.relevantAlerts(s, feed, now);
assert.strictEqual(r.local.length, 1, JSON.stringify(r.local));
assert.deepStrictEqual(r.local[0].lines, ['C4', 'C6']);
assert.deepStrictEqual(r.local[0].stops, [t[0].name, t[1].name]);
assert.ok(r.movedStops[t[0].id] && r.movedStops[t[1].id]);
assert.strictEqual(r.major.length, 1); assert.ok(r.major[0].upcoming); assert.strictEqual(r.major[0].text, 'Mouvement social.');
const board = { C4: [{ line: 'C4', time: now + 300, scheduled: now + 300, status: 'scheduled', delay: null }], C6: [] };
assert.strictEqual(B.butlerLine(board, null, now, 14, r), 'Une grève est annoncée. On s’organise ?');
const during = D.relevantAlerts(s, feed, now + 3600 * 21);
assert.ok(!during.major[0].upcoming);
assert.strictEqual(B.butlerLine(board, null, now + 3600 * 21, 14, during), 'Grève sur le réseau. Le vélo, peut-être ?');
console.log('OK: alerts tests passed');
