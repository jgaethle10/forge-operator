#!/usr/bin/env python3
"""Verify the mobile NOAA preview against the original SHA-pinned 300-row export.

No spatial inference. Fail when a displayed point does not agree with a
sampled-and-rounded row from the actual NOAA 1Hz processed navigation product.
"""
import argparse
import json
from pathlib import Path

EXPECTED_SHA="b83df8dd9ae8ebeee7e23c5b1d8a2550b192137bbe7f1e394e551ee4124dda61"


def sampled_rows(full):
    if full.get("schema")!="evercraft.subsea.raw_track_clip.v1":
        raise ValueError("Unexpected full source schema")
    if full.get("status")!="PROVISIONAL_NOAA_PROCESSED_1HZ_PRODUCT":
        raise ValueError("Full data lacks processed-track classification")
    if full.get("source_archive_sha256")!=EXPECTED_SHA:
        raise ValueError("Original source archive SHA mismatch")
    if not full.get("upstream_interpolation_and_padding") or not full.get("source_rows_are_not_independent_raw_sensor_fixes"):
        raise ValueError("Missing upstream processing provenance in full source")
    points=full.get("points")
    if not isinstance(points,list) or len(points)!=300 or full.get("source_rows_in_clip")!=300:
        raise ValueError("Full NOAA clip must contain 300 source records")
    for i,p in enumerate(points):
        if p.get("elapsed_s")!=i or p.get("epoch_s_observed")!=1692988200+i:
            raise ValueError("Full source record timestamp missing or out of order")
    indexes=list(range(0,300,5))
    indexes.append(299)
    expected=[]
    for i in indexes:
        p=points[i]
        def rounded(key,digits):
            value=p.get(key)
            return None if value is None else round(float(value),digits)
        expected.append([
            i,rounded("lat_dd_observed",9),rounded("lon_dd_observed",9),
            rounded("depth_source_signed",3)
        ])
    return expected


def validate(full,display):
    expected=sampled_rows(full)
    if display.get("schema")!="evercraft.subsea.raw_track_preview_5s.v1":
        raise ValueError("Unexpected mobile preview schema")
    if display.get("source_archive_sha256")!=EXPECTED_SHA:
        raise ValueError("Mobile sample not tied to the pinned NOAA source")
    if display.get("status")!="PROVISIONAL_PROCESSED_TRACK_DISPLAY":
        raise ValueError("Mobile sample does not identify source as processed")
    lineage=display.get("processing_lineage") or {}
    if (lineage.get("source_processing_applied_before_evercraft") is not True
            or lineage.get("independent_fix_at_each_second") is not False
            or lineage.get("evercraft_added_interpolation") is not False
            or lineage.get("raw_sensor_positions") is not False
            or "noaa_55994_DS1.pdf" not in lineage.get("source_plan","")):
        raise ValueError("Mobile sample processing chain is incomplete")
    if display.get("original_window_count")!=300 or display.get("preview_sample_count")!=61:
        raise ValueError("Mobile preview count mismatch")
    rows=display.get("points")
    if not isinstance(rows,list) or len(rows)!=61:
        raise ValueError("Mobile preview has wrong number of points")
    for i,(actual,source) in enumerate(zip(rows,expected)):
        if not isinstance(actual,list) or len(actual)!=4:
            raise ValueError("Malformed display point")
        if actual[0]!=source[0]:
            raise ValueError(f"Timestamp mismatch at displayed row {i}")
        for j in range(1,4):
            if actual[j]!=source[j] or type(actual[j]) is bool:
                raise ValueError(f"NOAA source value mismatch at row {i}, column {j}")
    return {"status":"PREVIEW_MATCHES_NOAA_1HZ_PROCESSED_PRODUCT",
            "source_archive_sha256":EXPECTED_SHA,
            "compared_rows":61,
            "source_window_rows":300,
            "upstream_interpolation_exists":True,
            "no_independent_fix_claim":True,
            "certified_position":False,
            "video_frame_sync":False}


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--full",required=True)
    p.add_argument("--display",required=True)
    p.add_argument("--receipt",required=True)
    args=p.parse_args()
    full=json.loads(Path(args.full).read_text(encoding="utf-8"))
    display=json.loads(Path(args.display).read_text(encoding="utf-8"))
    evidence=validate(full,display)
    target=Path(args.receipt)
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(evidence,indent=2)+"\n",encoding="utf-8")
    print(evidence["status"],evidence["compared_rows"],"source rows compared")
    return 0


if __name__=="__main__":
    raise SystemExit(main())
