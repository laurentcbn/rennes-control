// Edge cases of the schedule/realtime merge. Usage: node tests/unit.js
const assert = require('assert');
const D = require('../assets/departures.js');
const schedule = {
  stop: { id: '7-1164' }, lines: { C4: {}, C6: {} },
  departures: [
    { trip: 'a', line: 'C4', t: 1000 }, { trip: 'b', line: 'C4', t: 1600 }, { trip: 'c', line: 'C4', t: 2200 },
    { trip: 'x', line: 'C6', t: 1200 }, { trip: 'y', line: 'C6', t: 1800 }, { trip: 'z', line: 'C6', t: 900 }
  ]
};
const tu = (tripId, opts, stu) => ({ tripUpdate: { trip: Object.assign({ tripId }, opts.trip), vehicle: opts.vehicle,
  stopTimeUpdates: stu ? [Object.assign({ stopId: '7-1164' }, stu)] : (opts.stus || []) } });
const now = 950;

// 1. No feed: everything theoretical, chronological, past departures dropped
let b = D.buildBoard(schedule, null, now);
assert.deepStrictEqual(b.C4.map(d => d.trip), ['a', 'b', 'c']);
assert.ok(b.C4.every(d => d.status === 'scheduled' && d.delay === null));
assert.deepStrictEqual(b.C6.map(d => d.trip), ['x', 'y']); // z left 50 s ago (> 30 s grace): dropped

// 2. Live trip with delay, cancelled trip, skipped stop, NO_DATA, untracked RT copy
const feed = { header: { timestamp: now }, entities: [
  tu('a', { vehicle: { id: '386' } }, { departure: { time: 1240, uncertainty: 120 } }),   // late 4 min
  tu('b', { trip: { scheduleRelationship: 3 } }),                                          // CANCELED
  tu('x', { vehicle: { id: '356' } }, { scheduleRelationship: 1 }),                        // SKIPPED
  tu('y', {}, { departure: { time: 1860 } }),                                              // no vehicle
  tu('c', { vehicle: { id: '9' } }, { scheduleRelationship: 2, departure: { time: 9999 } }) // NO_DATA
]};
b = D.buildBoard(schedule, feed, now);
const by = Object.fromEntries([...b.C4, ...b.C6].map(d => [d.trip, d]));
assert.strictEqual(by.a.status, 'live'); assert.strictEqual(by.a.delay, 240); assert.strictEqual(by.a.time, 1240);
assert.strictEqual(by.b.status, 'canceled');
assert.strictEqual(by.x.status, 'canceled');
assert.strictEqual(by.y.status, 'scheduled'); assert.strictEqual(by.y.delay, null);
assert.strictEqual(by.c.status, 'scheduled'); assert.strictEqual(by.c.time, 2200);
assert.deepStrictEqual(b.C4.map(d => d.trip), ['a', 'b', 'c']); // chronological; cancelled trip stays visible

// 3. A late bus whose scheduled time is already past stays on the board
b = D.buildBoard(schedule, { header: {}, entities: [tu('z', { vehicle: { id: '1' } }, { departure: { time: 1100 } })] }, now);
assert.strictEqual(b.C6[0].trip, 'z'); assert.strictEqual(b.C6[0].delay, 200);

// 4. Tracked trip that no longer lists our stop and is past schedule: it has gone
b = D.buildBoard(schedule, { header: {}, entities: [tu('z', { vehicle: { id: '1' }, stus: [{ stopId: '7-9999', departure: { time: 1300 } }] })] }, 925);
assert.ok(!b.C6.some(d => d.trip === 'z'));

// 5. Labels
assert.strictEqual(D.countdown(1000, 990), 'à quai');
assert.strictEqual(D.countdown(1000 + 180, 1000), 'dans 3 min');
assert.strictEqual(D.countdown(1000 + 3900, 1000), 'dans 1 h 05');
assert.deepStrictEqual(D.delayLabel(20), { text: "à l'heure", kind: 'ontime' });
assert.deepStrictEqual(D.delayLabel(-61), { text: '−1 min', kind: 'early' });
assert.strictEqual(D.delayLabel(null), null);
console.log('OK: unit tests passed');
