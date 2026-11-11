#!/usr/bin/env python3
"""Bounded, read-only acquisition audit for two NOAA EX2306 Dive 02 source files.

Outputs a metadata receipt, NEVER a reconstructed route. Original files stay in
runner memory, not in source control or workflow artifacts. No ZIP extraction.
"""
import argparse
import collections
import csv
import datetime as dt
import hashlib
import io
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

MISSION = "EX2306_DIVE02"
SOURCES = (
    ("track_kml", "https://oer.hpc.msstate.edu/okeanos/ex2306/EX2306_DIVE02_Path.kml", "kml", 500_000),
    ("rov_ancillary", "https://oer.hpc.msstate.edu/okeanos/ex2306/ex2306-DIVE02-ancillary-data.zip", "zip", 24_000_000),
)
ALLOWED_HOST = "oer.hpc.msstate.edu"
MAX_ZIP_ENTRIES = 3000
MAX_UNCOMPRESSED = 200_000_000


def trusted_url(url):
    parsed = urllib.parse.urlsplit(url)
    return (parsed.scheme == "https" and parsed.hostname == ALLOWED_HOST
            and parsed.username is None and parsed.password is None
            and parsed.port in (None, 443))


class GuardedRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not trusted_url(newurl):
            raise ValueError("Blocked redirect outside allowed NOAA archival source")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def retrieve(url, limit_bytes, opener=None):
    if not trusted_url(url):
        raise ValueError("Untrusted archive URL")
    opener = opener or urllib.request.build_opener(GuardedRedirect())
    req = urllib.request.Request(url, headers={"User-Agent": "Evercraft-Subsea-EvidenceAudit/1.0",
                                             "Accept": "application/zip,application/vnd.google-earth.kml+xml,*/*"})
    with opener.open(req, timeout=25) as response:
        final_url = response.geturl()
        if not trusted_url(final_url):
            raise ValueError("Archive response originated outside allowed host")
        chunks, length = [], 0
        digest = hashlib.sha256()
        while True:
            chunk = response.read(65536)
            if not chunk:
                break
            length += len(chunk)
            if length > limit_bytes:
                raise ValueError("Archive exceeds configured acquisition limit")
            chunks.append(chunk)
            digest.update(chunk)
        return b"".join(chunks), {
            "http_status": getattr(response, "status", None),
            "final_url": final_url,
            "content_type": response.headers.get("Content-Type", ""),
            "bytes": length,
            "sha256": digest.hexdigest(),
        }


def local_tag(tag):
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def inspect_kml(data):
    if len(data) > 500_000 or b"<!DOCTYPE" in data.upper():
        raise ValueError("KML exceeds limit or contains a DTD")
    root = ET.fromstring(data)
    if local_tag(root.tag) != "kml":
        raise ValueError("Source is not a KML root")
    counts = collections.Counter(local_tag(e.tag) for e in root.iter())
    when = [(e.text or "").strip() for e in root.iter() if local_tag(e.tag) == "when"]
    coords = [(e.text or "").strip() for e in root.iter() if local_tag(e.tag) == "coordinates"]
    gxcoord = sum(1 for e in root.iter() if e.tag.endswith("}coord"))
    sample = []
    for value in when[:2] + when[-2:]:
        if re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z", value):
            sample.append(value)
    return {
        "kml_placemarks": counts["Placemark"],
        "kml_tracks": counts["Track"],
        "kml_linestrings": counts["LineString"],
        "kml_when_count": len(when),
        "kml_gxcoord_count": gxcoord,
        "kml_coordinates_elements": len(coords),
        "kml_coordinates_tokens_estimate": sum(len(c.replace("\n", " ").split()) for c in coords),
        "observed_timestamp_examples_utc": list(dict.fromkeys(sample)),
        "horizontal_coordinate_crs": "KML convention WGS84; source interpretation requires verification",
        "vertical_datum": "UNKNOWN",
        "position_instrument_and_accuracy": "UNKNOWN",
        "time_to_video_offset": "UNKNOWN",
        "eligible_for_3d_replay": False,
    }


def safe_archive_path(path):
    path = path.replace("\\", "/")
    return (not path.startswith("/") and ".." not in path.split("/")
            and not re.match(r"^[a-zA-Z]:", path) and "\x00" not in path)


def inspect_zip(data):
    results, hints, total = [], [], 0
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        files = archive.infolist()
        if len(files) > MAX_ZIP_ENTRIES:
            raise ValueError("Too many ZIP members")
        for item in files:
            if not safe_archive_path(item.filename):
                raise ValueError("ZIP contains unsafe member path")
            if item.flag_bits & 1:
                raise ValueError("ZIP contains an encrypted member")
            total += item.file_size
            if total > MAX_UNCOMPRESSED:
                raise ValueError("ZIP expansion exceeds safety cap")
            if len(results) < 80:
                results.append({
                    "name": item.filename[:220], "bytes": item.file_size,
                    "compressed_bytes": item.compress_size,
                    "format_hint": Path(item.filename).suffix.lower()
                })
        for item in files:
            if len(hints) >= 8:
                break
            if item.is_dir() or item.file_size > 10_000_000:
                continue
            if Path(item.filename).suffix.lower() not in (".csv", ".tsv", ".txt", ".log", ".dat", ".asc"):
                continue
            with archive.open(item) as stream:
                raw = stream.read(4096)
            # Schema hints only, no row values or inferred sensor measurements.
            line = raw.decode("utf-8", errors="replace").splitlines()
            header = line[0].strip()[:250] if line else ""
            fields = [w.lower() for w in re.split(r"[,\t;| ]+", header) if w]
            keys = ("utc", "timestamp", "date", "time", "depth", "lat", "lon",
                    "usbl", "dvl", "pressure", "heading", "altitude")
            matches = [key for key in keys if any(key in f for f in fields)]
            hints.append({"member": item.filename[:220], "header_field_hints": matches,
                          "line_count_in_first_4kb": len(line)})
        # The published 1Hz CSV is the next candidate. Observe its *actual*
        # columns/rows without converting positions or assuming UTC validity.
        track = next((i for i in files
                      if i.filename.lower().endswith("_rovtrack1hz.csv")
                      and 0 < i.file_size <= 5_000_000), None)
        track_observation = None
        if track:
            with archive.open(track) as stream:
                raw = stream.read(5_000_001)
            if len(raw) > 5_000_000:
                raise ValueError("1Hz track exceeds bounded CSV sample limit")
            reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig", errors="replace")))
            names = reader.fieldnames or []
            if len(names) > 120:
                raise ValueError("Too many CSV columns")
            def summarize(row):
                return {str(k)[:95]: str(v or "")[:120]
                        for k, v in list(row.items())[:65]}
            first = []
            last = None
            rows = 0
            for row in reader:
                rows += 1
                if rows > 100_000:
                    raise ValueError("Too many rows in 1Hz preview")
                if rows <= 2:
                    first.append(summarize(row))
                last = summarize(row)
            track_observation = {
                "member": track.filename[:220],
                "column_names_observed": [n[:100] for n in names],
                "row_count_observed": rows,
                "first_two_rows_observed": first,
                "last_row_observed": last,
                "time_reference": "UNVERIFIED",
                "position_source": "UNVERIFIED",
                "depth_datum": "UNVERIFIED",
                "video_frame_alignment": "UNVERIFIED",
                "can_render_real_replay": False,
            }
    return {
        "member_count": len(files), "total_declared_uncompressed_bytes": total,
        "member_inventory_first_80": results, "header_hints_first_8": hints,
        "rov_track_1hz_observation": track_observation,
        "files_extracted": False, "schema_verified": False,
        "coordinates_verified": False, "eligible_for_3d_replay": False,
    }


def run(out_path):
    receipt = {
        "schema": "evercraft.subsea.noaa_byte_audit.v1",
        "mission_id": MISSION,
        "generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source": "NOAA Ocean Exploration / Mississippi State archive",
        "source_record": "https://www.ncei.noaa.gov/waf/okeanos-rov-cruises/ex2306/",
        "purpose": "read-only source-byte audit; not a dive reconstruction",
        "status": "SOURCE_ACCESS_INCOMPLETE",
        "entries": [],
        "real_dive_route_ready": False,
        "video_alignment_verified": False,
        "terrain_or_infrastructure_verified": False,
    }
    for source_id, url, kind, max_bytes in SOURCES:
        entry = {"id": source_id, "uri": url, "format": kind,
                 "status": "BLOCKED", "qualified_for_replay": False}
        try:
            data, metadata = retrieve(url, max_bytes)
            if not data:
                raise ValueError("Empty source")
            entry["transport"] = metadata
            entry["inspection"] = inspect_kml(data) if kind == "kml" else inspect_zip(data)
            entry["status"] = "BYTES_AUDITED_SCHEMA_UNVERIFIED"
        except Exception as error:
            entry["blocker"] = type(error).__name__ + ": " + str(error)[:240]
        receipt["entries"].append(entry)
    if all(entry["status"] == "BYTES_AUDITED_SCHEMA_UNVERIFIED" for entry in receipt["entries"]):
        receipt["status"] = "BYTE_AUDIT_COMPLETE_SCHEMA_UNVERIFIED"
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("NOAA_EX2306_SOURCE_AUDIT " + receipt["status"])
    for entry in receipt["entries"]:
        print(entry["id"] + ": " + entry["status"] +
              (" (" + entry["blocker"] + ")" if "blocker" in entry else
               " sha256=" + entry["transport"]["sha256"]))
    print("Source receipt: " + str(out_path))
    return 0 if receipt["status"] == "BYTE_AUDIT_COMPLETE_SCHEMA_UNVERIFIED" else 2


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="Path for sanitized machine-readable receipt")
    args = parser.parse_args()
    return run(args.out)


if __name__ == "__main__":
    sys.exit(main())
