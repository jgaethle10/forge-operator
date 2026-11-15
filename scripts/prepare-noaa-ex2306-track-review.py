#!/usr/bin/env python3
"""Prepare a source-grounded, NON-NAVIGATIONAL 2D evidence preview.

Reads original NOAA EX2306 DIVE02 ROV 1Hz telemetry with a pinned archive SHA.
Produces raw observed values only, never an inferred/smoothed/certified 3D route.
"""
import argparse
import csv
import datetime as dt
import hashlib
import importlib.util
import io
import json
import math
import sys
import zipfile
from pathlib import Path

AUDIT_PATH = Path(__file__).with_name("audit-noaa-subsea-sources.py")
_spec = importlib.util.spec_from_file_location("evercraft_subsea_noaa_audit", AUDIT_PATH)
audit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit)

ARCHIVE_SHA256 = "b83df8dd9ae8ebeee7e23c5b1d8a2550b192137bbe7f1e394e551ee4124dda61"
CSV_SUFFIX = "ex2306_dive02_rovtrack1hz.csv"
CLIP_START = 1692988200
CLIP_END = 1692988499
COLUMNS = ("UNIXTIME", "DEPTH", "LAT_DD", "LON_DD")
SCHEMA = "evercraft.subsea.raw_track_clip.v1"


def numeric(value):
    try:
        if value is None or not str(value).strip():
            return None
        n = float(value)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None


def extract_track(archive_bytes):
    """Read one known 1Hz member into memory without extracting any ZIP file."""
    sha = hashlib.sha256(archive_bytes).hexdigest()
    if sha != ARCHIVE_SHA256:
        raise ValueError("Original NOAA ancillary SHA256 mismatch; refuse untrusted input")
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as z:
        members = z.infolist()
        if len(members) > audit.MAX_ZIP_ENTRIES:
            raise ValueError("Too many archive entries")
        if any(not audit.safe_archive_path(i.filename) or i.flag_bits & 1 for i in members):
            raise ValueError("Unsafe ZIP member")
        if sum(i.file_size for i in members) > audit.MAX_UNCOMPRESSED:
            raise ValueError("ZIP expansion limit exceeded")
        tracks = [i for i in members if i.filename.lower().endswith(CSV_SUFFIX)]
        if len(tracks) != 1 or not 0 < tracks[0].file_size <= 5_000_000:
            raise ValueError("Expected one bounded ROV 1Hz track file")
        with z.open(tracks[0]) as stream:
            data = stream.read(5_000_001)
        if len(data) > 5_000_000:
            raise ValueError("ROV track CSV exceeds limit")
    return data.decode("utf-8-sig", errors="strict"), tracks[0].filename


def make_preview(csv_text, member, start=CLIP_START, end=CLIP_END, source_sha=ARCHIVE_SHA256):
    if end < start or end - start > 900:
        raise ValueError("Invalid or oversized clip window")
    reader = csv.DictReader(io.StringIO(csv_text))
    if reader.fieldnames is None or any(k not in reader.fieldnames for k in COLUMNS):
        raise ValueError("Missing required original ROV column")
    observations = {}
    scanned = 0
    for raw in reader:
        scanned += 1
        if scanned > 100_000:
            raise ValueError("Too many source rows")
        t = numeric(raw.get("UNIXTIME"))
        if t is None or abs(t - round(t)) > 0.001:
            continue
        second = int(round(t))
        if not start <= second <= end:
            continue
        if second in observations:
            raise ValueError("Duplicate second within clip")
        depth = numeric(raw.get("DEPTH"))
        lat = numeric(raw.get("LAT_DD"))
        lon = numeric(raw.get("LON_DD"))
        # Invalid or partial geographic fixes remain unavailable, not extrapolated.
        if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            lat = lon = None
        observations[second] = {
            "elapsed_s": second - start,
            "epoch_s_observed": second,
            "depth_source_signed": depth,
            "lat_dd_observed": lat,
            "lon_dd_observed": lon,
            "position_available": lat is not None,
        }
    # Explicitly preserve absent seconds as null observations.
    points = [observations.get(t) or {
        "elapsed_s": t - start,
        "epoch_s_observed": t,
        "depth_source_signed": None,
        "lat_dd_observed": None,
        "lon_dd_observed": None,
        "position_available": False,
    } for t in range(start, end+1)]
    source_rows = len(observations)
    coordinates = sum(1 for p in points if p["position_available"])
    depth_rows = sum(1 for p in points if p["depth_source_signed"] is not None)
    return {
        "schema": SCHEMA,
        "status": "PROVISIONAL_RAW_OBSERVATIONS_ONLY",
        "mission_id": "EX2306_DIVE02",
        "title": "NOAA Kodiak Seep · 1Hz ROV observations",
        "source_credit": "NOAA Ocean Exploration",
        "source_record": "https://www.ncei.noaa.gov/waf/okeanos-rov-cruises/ex2306/",
        "source_archive_sha256": source_sha,
        "source_member": member,
        "clip_start_utc": dt.datetime.fromtimestamp(start, dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "clip_end_utc_inclusive": dt.datetime.fromtimestamp(end, dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "source_rows_in_clip": source_rows,
        "seconds_in_window": end-start+1,
        "depth_rows": depth_rows,
        "position_rows": coordinates,
        "coordinate_system": "LAT_DD / LON_DD in source file; positioning method, datum and uncertainty UNVERIFIED",
        "depth_reference": "Source-signed DEPTH values; physical sign convention and vertical datum UNVERIFIED",
        "video_alignment": "TIME-WINDOW-OVERLAP-ONLY; camera frame sync UNVERIFIED",
        "forbidden_uses": ["navigation", "dive_clearance", "hazard_avoidance", "surveyed_3d_reconstruction"],
        "certified_underwater_position": False,
        "surveyed_site_geometry": False,
        "points": points,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    args = p.parse_args()
    data, metadata = audit.retrieve(audit.SOURCES[1][1], audit.SOURCES[1][3])
    csv_text, filename = extract_track(data)
    preview = make_preview(csv_text, filename, source_sha=metadata["sha256"])
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(preview, separators=(",", ":"), ensure_ascii=False)+"\n",encoding="utf-8")
    print("NOAA_TRACK_PREVIEW_READY", preview["source_rows_in_clip"], "source rows /",
          preview["position_rows"], "position readings /",
          preview["depth_rows"], "depth readings")
    print("Unverified geodesy, depth datum and camera synchronization. NO 3D RECONSTRUCTION.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
