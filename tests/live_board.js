// Fetch the real GTFS-RT feed, merge it with data/schedule.json and print the board.
// Usage: node tests/live_board.js [feed.pb]
const fs = require('fs');
const G = require('../assets/gtfsrt.js');
const D = require('../assets/departures.js');
const FEED = 'https://proxy.transport.data.gouv.fr/resource/star-rennes-integration-gtfs-rt-trip-update';

(async () => {
  const schedule = JSON.parse(fs.readFileSync(__dirname + '/../data/schedule.json', 'utf8'));
  let buf;
  if (process.argv[2]) buf = fs.readFileSync(process.argv[2]);
  else {
    const r = await fetch(FEED);
    if (!r.ok) throw new Error('feed HTTP ' + r.status + ' (flux indisponible, pas une erreur de code)');
    buf = Buffer.from(await r.arrayBuffer());
  }
  const feed = G.decodeFeed(buf);
  const now = Math.floor(Date.now() / 1000);
  const fmt = t => new Date(t * 1000).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' });
  console.log('now', fmt(now), '| feed header', fmt(feed.header.timestamp), '| entities', feed.entities.length);
  const board = D.buildBoard(schedule, feed, now, { perLine: 5 });
  let live = 0;
  for (const line of Object.keys(board)) {
    console.log(`\n${line} → ${schedule.lines[line].destination}`);
    if (!board[line].length) console.log('  (aucun départ)');
    for (const d of board[line]) {
      if (d.status === 'live') live++;
      const dl = D.delayLabel(d.delay);
      console.log(`  ${fmt(d.time)}  ${D.countdown(d.time, now).padEnd(13)} ${d.status.padEnd(9)} sched ${fmt(d.scheduled)}` +
        (dl ? `  ${dl.text}` : '') + (d.vehicle ? `  bus ${d.vehicle}` : '') + `  ${d.trip}`);
    }
  }
  // Cross-check: every RT trip we used really is C4/C6 direction 0 serving stop 7-1164.
  const idx = D.indexFeed(feed, schedule.stop.id);
  const routes = { C4: '7-0004', C6: '7-0006' };
  for (const line of Object.keys(board)) for (const d of board[line]) {
    const hit = idx[d.trip];
    if (hit && (hit.tu.trip.routeId !== routes[line] || (hit.tu.trip.directionId || 0) !== 0))
      throw new Error('route/direction mismatch for ' + d.trip);
  }
  console.log(`\nOK: ${live} live departures, route/direction checks passed`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
