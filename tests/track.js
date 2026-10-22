// Placement of buses on the live track, with the real stop coordinates. Usage: node tests/track.js
const assert = require('assert');
const D = require('../assets/departures.js');
const s = require('../data/schedule.json');
const t = s.tracks.C4, trip = l => s.departures.find(d => d.line === l).trip;
const mid = (a, b) => ({ latitude: (a.lat + b.lat) / 2, longitude: (a.lon + b.lon) / 2 });
const vp = (tripId, stopId, status, position, ts = 1000) => ({ vehicle: { trip: { tripId }, vehicle: { id: '42' }, stopId, currentStatus: status, position, timestamp: ts } });
const feed = { header: { timestamp: 1000 }, entities: [
  vp(trip('C4'), t[3].id, 2, mid(t[2], t[3])),  // C4 halfway between stops 2 and 3
  vp(trip('C6'), t[6].id, 1, { latitude: t[6].lat, longitude: t[6].lon }),  // C6 at our stop
  vp(trip('C6'), t[0].id, 2, null),             // heading to the first drawn stop: far
  vp('unknown-trip', t[4].id, 1, null),         // not one of ours (other line / République short trip)
  vp(trip('C4'), '7-9999', 2, null),            // elsewhere on the route
  vp(trip('C4'), t[5].id, 1, null, 1),          // stale GPS fix
  vp(trip('C6'), t[4].id, 2, { latitude: 48.0523, longitude: -1.6873 }) // GPS 7 km away from the announced segment: ignored
]};
const r = D.trackPositions(s, feed, 1010);
assert.strictEqual(r.length, 3);
assert.deepStrictEqual(r.map(b => b.line), ['C6', 'C4', 'C6']);
assert.strictEqual(r[0].pos, 6); assert.ok(r[0].atStop);
assert.ok(Math.abs(r[1].pos - 2.5) < 0.01, r[1].pos);
assert.ok(r[2].far && r[2].pos === 0);
assert.deepStrictEqual(D.trackPositions(s, null, 0), []);

// Temporary stop (unknown id) but GPS on the drawn stretch, between stops 3 and 4
const tmp = D.trackPositions(s, { header: {}, entities: [vp(trip('C4'), '7-TEMP', 2, mid(t[3], t[4]))] }, 1010);
assert.strictEqual(tmp.length, 1); assert.ok(Math.abs(tmp[0].pos - 3.5) < 0.05, tmp[0].pos);
// Unknown stop and GPS elsewhere in town: not drawn
assert.strictEqual(D.trackPositions(s, { header: {}, entities: [vp(trip('C4'), '7-TEMP', 2, { latitude: 48.13, longitude: -1.70 })] }, 1010).length, 0);
console.log('OK: track placement tests passed');
