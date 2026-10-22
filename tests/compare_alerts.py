"""Compare the JS decoder with Google's reference bindings on a real Alerts feed."""
import json, subprocess, sys
from google.transit import gtfs_realtime_pb2 as g
path = sys.argv[1]
f = g.FeedMessage(); f.ParseFromString(open(path, 'rb').read())
tr = lambda ts: [[t.text, t.language] for t in ts.translation]
ref = [[e.id, e.alert.cause, e.alert.effect, [[p.start, p.end] for p in e.alert.active_period],
        [[x.agency_id, x.route_id, x.stop_id] for x in e.alert.informed_entity],
        tr(e.alert.header_text), tr(e.alert.description_text)] for e in f.entity if e.HasField('alert')]
js = json.loads(subprocess.check_output(['node', '-e', '''
const G = require("./assets/gtfsrt.js"), f = G.decodeFeed(require("fs").readFileSync(process.argv[1]));
const tr = t => t ? t.translations.map(x => [x.text || "", x.language || ""]) : [];
console.log(JSON.stringify(f.entities.filter(e => e.alert).map(e => { const a = e.alert;
  return [e.id, a.cause, a.effect, a.activePeriods.map(p => [p.start || 0, p.end || 0]),
          a.informedEntities.map(x => [x.agencyId || "", x.routeId || "", x.stopId || ""]), tr(a.headerText), tr(a.descriptionText)]; })));''', path]))
assert js == ref, 'MISMATCH'
print(f'OK: alerts identical to reference ({len(ref)} alerts)')
