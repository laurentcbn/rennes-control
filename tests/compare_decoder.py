"""Compare the JS decoder with Google's reference bindings on a real feed file."""
import json, subprocess, sys
from google.transit import gtfs_realtime_pb2 as g
path = sys.argv[1]
f = g.FeedMessage(); f.ParseFromString(open(path, 'rb').read())
ref = {'ts': f.header.timestamp, 'n': len(f.entity), 'rows': []}
for e in f.entity:
    tu = e.trip_update
    for s in tu.stop_time_update:
        ref['rows'].append([tu.trip.trip_id, tu.trip.route_id, tu.trip.direction_id, tu.trip.schedule_relationship,
            tu.vehicle.id, s.stop_id, s.schedule_relationship, s.departure.time, s.arrival.time, s.departure.delay, s.departure.uncertainty])
js = json.loads(subprocess.check_output(['node', 'tests/compare_decoder.js', path]))
assert js == ref, 'MISMATCH'
print(f"OK: JS decoder identical to reference ({ref['n']} entities, {len(ref['rows'])} stop updates)")
