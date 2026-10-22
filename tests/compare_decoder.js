// Usage: node tests/compare_decoder.js feed.pb  -> prints a JSON digest of the feed
const fs = require('fs');
const G = require('../assets/gtfsrt.js');
const feed = G.decodeFeed(fs.readFileSync(process.argv[2]));
const out = { ts: feed.header.timestamp, n: feed.entities.length, rows: [] };
for (const e of feed.entities) {
  const tu = e.tripUpdate; if (!tu) continue;
  for (const s of tu.stopTimeUpdates) {
    const d = s.departure || {}, a = s.arrival || {};
    out.rows.push([tu.trip.tripId, tu.trip.routeId || '', tu.trip.directionId || 0, tu.trip.scheduleRelationship || 0,
      (tu.vehicle && tu.vehicle.id) || '', s.stopId, s.scheduleRelationship || 0, d.time || 0, a.time || 0, d.delay || 0, d.uncertainty || 0]);
  }
}
console.log(JSON.stringify(out));
