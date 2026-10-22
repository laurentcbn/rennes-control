#!/usr/bin/env python3
"""Extract the theoretical (GTFS) departures of C4 and C6 at Pont de Châteaudun.

Downloads the official STAR GTFS (or reads a local zip / directory), keeps only
departures at stop 7-1164 (Pont de Châteaudun, quai direction Saint-Grégoire /
Aéroport) for the trips headed to the requested destinations, and writes
data/schedule.json with absolute UTC timestamps.

Times are converted with Europe/Paris rules following the GTFS convention
("noon minus 12h" of the service day), so DST changes are handled.

Usage:
    python3 tools/build_schedule.py                 # download the official GTFS
    python3 tools/build_schedule.py --gtfs path.zip # use a local zip or folder
Only the Python standard library is required.
"""
import argparse
import csv
import datetime as dt
import io
import json
import os
import sys
import urllib.request
import zipfile
from zoneinfo import ZoneInfo

GTFS_URL = "https://eu.ftp.opendatasoft.com/star/gtfs/GTFS_STAR_BUS_METRO_EN_COURS.zip"
TZ = ZoneInfo("Europe/Paris")

STOP_ID = "7-1164"  # Pont de Châteaudun, quai sens 0 (vers Saint-Grégoire / Aéroport)
LINES = {
    # route_id: (label, direction_id, accepted trip_headsign values, display destination)
    "7-0004": ("C4", "0", {"Grand Quartier"}, "Saint-Grégoire · Grand Quartier"),
    "7-0006": ("C6", "0", {"Aéroport", "Saint-Jacques Aéroport"}, "Saint-Jacques-de-la-Lande · Aéroport"),
}


class Gtfs:
    def __init__(self, source):
        if os.path.isdir(source):
            self._open = lambda name: open(os.path.join(source, name), encoding="utf-8-sig", newline="")
        else:
            if source.startswith("http"):
                req = urllib.request.Request(source, headers={"User-Agent": "rennes-control"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    data = r.read()
            else:
                with open(source, "rb") as f:
                    data = f.read()
            z = zipfile.ZipFile(io.BytesIO(data))
            self._open = lambda name: io.TextIOWrapper(z.open(name), encoding="utf-8-sig", newline="")

    def rows(self, name):
        try:
            with self._open(name) as f:
                yield from csv.DictReader(f)
        except (FileNotFoundError, KeyError):
            return


def parse_date(s):
    return dt.date(int(s[:4]), int(s[4:6]), int(s[6:]))


def service_dates(g):
    """Map service_id -> set of dates, from calendar.txt and calendar_dates.txt."""
    days = {}
    keys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    for r in g.rows("calendar.txt"):
        d, end = parse_date(r["start_date"]), parse_date(r["end_date"])
        s = days.setdefault(r["service_id"], set())
        while d <= end:
            if r[keys[d.weekday()]] == "1":
                s.add(d)
            d += dt.timedelta(days=1)
    for r in g.rows("calendar_dates.txt"):
        s = days.setdefault(r["service_id"], set())
        d = parse_date(r["date"])
        if r["exception_type"] == "1":
            s.add(d)
        elif r["exception_type"] == "2":
            s.discard(d)
    return days


def gtfs_time(service_day, hms):
    """GTFS time is relative to noon minus 12h of the service day (DST safe)."""
    h, m, s = (int(x) for x in hms.split(":"))
    noon = dt.datetime(service_day.year, service_day.month, service_day.day, 12, tzinfo=TZ)
    base = (noon.astimezone(dt.timezone.utc) - dt.timedelta(hours=12))
    return base + dt.timedelta(hours=h, minutes=m, seconds=s)


def build(source):
    g = Gtfs(source)
    feed_info = next(g.rows("feed_info.txt"), {})
    stop = next((r for r in g.rows("stops.txt") if r["stop_id"] == STOP_ID), None)
    if not stop:
        sys.exit(f"stop {STOP_ID} not found in GTFS")
    routes = {r["route_id"]: r for r in g.rows("routes.txt") if r["route_id"] in LINES}
    if set(routes) != set(LINES):
        sys.exit(f"missing routes in GTFS: {set(LINES) - set(routes)}")

    trips = {}
    for r in g.rows("trips.txt"):
        line = LINES.get(r["route_id"])
        if line and r["direction_id"] == line[1] and r["trip_headsign"] in line[2]:
            trips[r["trip_id"]] = r
    days = service_dates(g)

    deps = []
    for r in g.rows("stop_times.txt"):
        t = trips.get(r["trip_id"])
        if not t or r["stop_id"] != STOP_ID or r.get("pickup_type") == "1":
            continue
        label = LINES[t["route_id"]][0]
        for day in days.get(t["service_id"], ()):
            ts = gtfs_time(day, r["departure_time"] or r["arrival_time"])
            deps.append({"trip": t["trip_id"], "line": label, "t": int(ts.timestamp())})
    deps.sort(key=lambda d: (d["t"], d["line"]))

    return {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": GTFS_URL,
        "feed_version": feed_info.get("feed_version"),
        "feed_start": feed_info.get("feed_start_date"),
        "feed_end": feed_info.get("feed_end_date"),
        "timezone": "Europe/Paris",
        "stop": {"id": STOP_ID, "code": stop["stop_code"], "name": stop["stop_name"],
                 "lat": float(stop["stop_lat"]), "lon": float(stop["stop_lon"])},
        "lines": {
            v[0]: {"route_id": rid, "direction_id": int(v[1]), "destination": v[3],
                   "color": "#" + routes[rid]["route_color"], "text_color": "#" + routes[rid]["route_text_color"],
                   "long_name": routes[rid]["route_long_name"]}
            for rid, v in LINES.items()
        },
        "departures": deps,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gtfs", default=GTFS_URL, help="GTFS zip URL, zip file or extracted folder")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data", "schedule.json"))
    a = ap.parse_args()
    data = build(a.gtfs)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    counts = {k: sum(1 for d in data["departures"] if d["line"] == k) for k in data["lines"]}
    print(f"wrote {a.out}: {len(data['departures'])} departures {counts}, feed {data['feed_version']}")


if __name__ == "__main__":
    main()
