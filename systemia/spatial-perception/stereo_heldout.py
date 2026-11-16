#!/usr/bin/env python3
"""Evercraft V9: independent checkerboard held-out stereo epipolar evaluation.

Measures vertical alignment error in rectified camera images NOT used for
calibration. Requires locally authorized separate simultaneous stereo pairs.
Provisional engineering gate only. Does not verify camera timing, physical
baseline, absolute depth, authenticity, source consent or safety authority.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import statistics
import sys

from offline_stereo import sha256_file, write_private_json
from stereo_fieldkit import (
    CALIBRATION_SCHEMA, chessboard_corners, error, integer, number,
    read_json, relative_image, validated_calibration, vision_modules,
)

HELDOUT_SCHEMA = "evercraft.spatial-perception.heldout-checkerboards.v1"
RECEIPT_SCHEMA = "evercraft.spatial-perception.heldout-epipolar.v1"
MIN_HELDOUT = 3
MAX_HELDOUT = 40


def heldout_manifest(data, calibration, base):
    if data.get("schema") != HELDOUT_SCHEMA or data.get("sourceRights") != "authorized_local_use":
        error("heldout_manifest_rights_or_schema")
    if data.get("rigId") != calibration.get("rigId"):
        error("heldout_rig_mismatch")
    board = data.get("checkerboard")
    original = calibration.get("checkerboard")
    if not isinstance(board, dict) or not isinstance(original, dict):
        error("heldout_missing_checkerboard")
    cols = integer(board.get("columns"), 5, 16, "heldout_columns")
    rows = integer(board.get("rows"), 4, 12, "heldout_rows")
    square = number(board.get("squareSizeM"), .002, .2, "heldout_square")
    if (cols != original.get("columns") or rows != original.get("rows") or
        abs(square - number(original.get("squareSizeM"), .002, .2, "calibration_square")) > 1e-9):
        error("heldout_checkerboard_mismatch")
    pairs = data.get("pairs")
    if not isinstance(pairs, list) or not MIN_HELDOUT <= len(pairs) <= MAX_HELDOUT:
        error("heldout_pair_count")
    training = calibration.get("pairSources")
    if not isinstance(training, list) or len(training) < 10:
        error("missing_training_provenance")
    training_hashes = set()
    for pair in training:
        if not isinstance(pair, dict):
            error("invalid_training_provenance")
        for side in ("leftSha256", "rightSha256"):
            value = pair.get(side)
            if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
                error("invalid_training_hash")
            training_hashes.add(value)
    checked, seen_paths, seen_hashes = [], set(), set()
    for pair in pairs:
        if not isinstance(pair, dict):
            error("heldout_invalid_pair")
        left = relative_image(base, pair.get("left"))
        right = relative_image(base, pair.get("right"))
        if left == right or left in seen_paths or right in seen_paths:
            error("heldout_duplicate_paths")
        seen_paths.update((left, right))
        left_hash, right_hash = sha256_file(left), sha256_file(right)
        if (left_hash in training_hashes or right_hash in training_hashes or
            left_hash == right_hash):
            error("heldout_reuses_calibration_images")
        if left_hash in seen_hashes or right_hash in seen_hashes:
            error("heldout_duplicate_image_bytes")
        seen_hashes.update((left_hash, right_hash))
        checked.append((left, right, left_hash, right_hash))
    return (cols, rows), checked


def finite_summary(values):
    ordered = sorted(float(v) for v in values)
    if not ordered or any(not math.isfinite(v) or v < 0 for v in ordered):
        error("invalid_epipolar_samples")
    idx = .95 * (len(ordered)-1)
    low = int(idx)
    high = min(low+1, len(ordered)-1)
    p95 = ordered[low] + (ordered[high] - ordered[low]) * (idx-low)
    return {
        "samples": len(ordered),
        "meanAbsVerticalPx": round(statistics.mean(ordered), 5),
        "medianAbsVerticalPx": round(statistics.median(ordered), 5),
        "p95AbsVerticalPx": round(p95, 5),
        "maxAbsVerticalPx": round(ordered[-1], 5),
    }


def evaluate(calibration_path, heldout_path, output_path, *,
             authorized_source=False, independent_holdout_attested=False,
             max_p95_px=1.5):
    if not authorized_source or not independent_holdout_attested:
        error("heldout_rights_and_independence_attestation_required")
    number(max_p95_px, .1, 5, "epipolar_p95_gate")
    if (any(not p.is_file() or p.is_symlink() for p in (calibration_path, heldout_path)) or
        output_path.exists() or output_path.is_symlink() or
        output_path.resolve() in {calibration_path.resolve(), heldout_path.resolve()}):
        error("heldout_missing_or_unsafe_path")
    calibration = read_json(calibration_path)
    cv2, np = vision_modules()
    (width,height),m = validated_calibration(calibration, np)
    if calibration.get("schema") != CALIBRATION_SCHEMA:
        error("invalid_calibration")
    manifest = read_json(heldout_path)
    shape, pairs = heldout_manifest(manifest, calibration, heldout_path.parent)
    calib_hash = sha256_file(calibration_path)
    manifest_hash = sha256_file(heldout_path)
    rows, all_errors = [], []
    for left,right,left_hash,right_hash in pairs:
        l = cv2.imread(str(left),cv2.IMREAD_GRAYSCALE)
        r = cv2.imread(str(right),cv2.IMREAD_GRAYSCALE)
        if l is None or r is None or l.shape != (height,width) or r.shape != (height,width):
            error("heldout_image_dimensions_or_decode")
        corners_l = chessboard_corners(l, shape, cv2)
        corners_r = chessboard_corners(r, shape, cv2)
        if corners_l is None or corners_r is None:
            error("heldout_checkerboard_not_detected")
        un_l = cv2.undistortPoints(corners_l,m["K1"],m["D1"],R=m["R1"],P=m["P1"])
        un_r = cv2.undistortPoints(corners_r,m["K2"],m["D2"],R=m["R2"],P=m["P2"])
        if un_l.shape != un_r.shape or un_l.shape[0] != shape[0]*shape[1]:
            error("heldout_corner_shape_mismatch")
        abs_v = np.abs(un_l[:,0,1]-un_r[:,0,1])
        stats = finite_summary(abs_v.tolist())
        all_errors.extend(abs_v.tolist())
        rows.append({
            "leftSha256":left_hash, "rightSha256":right_hash,
            "leftFile":left.relative_to(heldout_path.parent).as_posix(),
            "rightFile":right.relative_to(heldout_path.parent).as_posix(),
            "cornerCount":len(abs_v), "verticalResidualPx":stats,
        })
    if (sha256_file(calibration_path)!=calib_hash or sha256_file(heldout_path)!=manifest_hash or
        any(sha256_file(left)!=lh or sha256_file(right)!=rh for left,right,lh,rh in pairs)):
        error("heldout_sources_changed_during_check")
    metrics = finite_summary(all_errors)
    passed = metrics["p95AbsVerticalPx"] <= max_p95_px
    report = {
        "schema":RECEIPT_SCHEMA,
        "rigId":calibration["rigId"],
        "calibrationFileSha256":calib_hash,
        "holdoutManifestSha256":manifest_hash,
        "calibrationSourceManifestSha256":calibration["sourceManifestSha256"],
        "trainingImageCount":len(calibration["pairSources"])*2,
        "holdoutImageCount":len(pairs)*2,
        "trainingBytesReused":False,
        "checkerboard":manifest["checkerboard"],
        "imageWidth":width,"imageHeight":height,
        "gateThresholdP95VerticalPx":max_p95_px,
        "verticalEpipolarResidualPx":metrics,
        "perPair":rows,
        "heldoutAlignmentGatePassed":passed,
        "gateStatus":"provisional_heldout_epipolar_pass" if passed else "heldout_epipolar_failed_review_required",
        "timestampSynchronizationVerified":False,
        "physicalBaselineVerified":False,
        "referenceIndependenceExternallyVerified":False,
        "absoluteDepthAccuracyCertified":False,
        "safetyCriticalApproved":False,
        "georegistered":False,
        "worldPersistenceAuthorized":False,
    }
    # The failed receipt is intentionally retained for engineering diagnosis,
    # but CLI exits 3 on a failed alignment gate.
    write_private_json(output_path,report)
    return {
        "output":str(output_path),
        "heldoutPairs":len(pairs),
        "p95VerticalPx":metrics["p95AbsVerticalPx"],
        "heldoutAlignmentGatePassed":passed,
        "absoluteDepthAccuracyCertified":False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--calibration",required=True,type=Path)
    parser.add_argument("--heldout",required=True,type=Path)
    parser.add_argument("--output",required=True,type=Path)
    parser.add_argument("--max-p95-px",type=float,default=1.5)
    parser.add_argument("--authorized-source",action="store_true")
    parser.add_argument("--independent-holdout-attested",action="store_true")
    args = parser.parse_args()
    try:
        result = evaluate(args.calibration,args.heldout,args.output,
            authorized_source=args.authorized_source,
            independent_holdout_attested=args.independent_holdout_attested,
            max_p95_px=args.max_p95_px)
        print(json.dumps(result))
        if not result["heldoutAlignmentGatePassed"]:
            sys.exit(3)
    except (ValueError,RuntimeError,OSError,json.JSONDecodeError) as exc:
        print("spatial_heldout_error: "+str(exc), file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
