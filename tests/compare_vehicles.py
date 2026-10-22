"""Compare the JS decoder with Google's reference bindings on a real VehiclePosition feed."""
import json, subprocess, sys
from google.transit import gtfs_realtime_pb2 as g
path = sys.argv[1]
f = g.FeedMessage(); f.ParseFromString(open(path, 'rb').read())
ref = [[e.vehicle.trip.trip_id, e.vehicle.trip.route_id, e.vehicle.trip.direction_id, e.vehicle.vehicle.id,
        round(e.vehicle.position.latitude, 5), round(e.vehicle.position.longitude, 5), e.vehicle.stop_id,
        e.vehicle.current_status, e.vehicle.timestamp] for e in f.entity if e.HasField('vehicle')]
js = json.loads(subprocess.check_output(['node', '-e', '''
const G = require("./assets/gtfsrt.js"), f = G.decodeFeed(require("fs").readFileSync(process.argv[1]));
const r = x => Math.round(x * 1e5) / 1e5;
console.log(JSON.stringify(f.entities.filter(e => e.vehicle).map(e => { const v = e.vehicle;
  return [v.trip.tripId || "", v.trip.routeId || "", v.trip.directionId || 0, v.vehicle.id, r(v.position.latitude), r(v.position.longitude),
          v.stopId || "", v.currentStatus, v.timestamp]; })));''', path]))
assert js == ref, ('MISMATCH', js[:2], ref[:2])
print(f'OK: vehicle positions identical to reference ({len(ref)} vehicles)')
