#!/usr/bin/env python3
"""Evercraft local stereo field-evaluation: compare derived depth to independent camera-axis Z targets.

This tool NEVER certifies accuracy, verifies calibration authenticity, or
promotes detections into mapping, forensics, safety controls, or World Engine.
Requires source-video/model/calibration files locally for byte-integrity checks.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import statistics
import sys

from offline_stereo import sha256_file, write_private_json

OBS_SCHEMA = "evercraft.spatial-perception.offline-import.v1"
TARGET_SCHEMA = "evercraft.spatial-perception.field-targets.v1"
REPORT_SCHEMA = "evercraft.spatial-perception.field-evaluation.v1"
MAX_JSON_BYTES = 10_000_000
METHODS = {"laser_camera_axis", "tape_camera_axis", "surveyed_camera_axis", "synthetic_known_disparity"}


def reject(message):
    raise ValueError("spatial_field_" + message)


def finite(value, low, high, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        reject("invalid_" + name)
    if not low <= value <= high:
        reject("invalid_" + name)
    return float(value)


def text_id(value, name, length=128):
    if not isinstance(value, str) or not value or len(value) > length:
        reject("invalid_" + name)
    return value


def digest(value, name):
    if not isinstance(value, str) or len(value) != 64 or any(ch not in "0123456789abcdef" for ch in value):
        reject("invalid_" + name)
    return value


def local_json(path):
    if not path.is_file() or path.is_symlink() or path.stat().st_size > MAX_JSON_BYTES:
        reject("invalid_local_json")
    def no_constants(value):
        reject("nonfinite_json")
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=no_constants)


def box(raw, width, height, name):
    if not isinstance(raw, dict):
        reject("invalid_" + name)
    x = finite(raw.get("x"), 0, width, name + "_x")
    y = finite(raw.get("y"), 0, height, name + "_y")
    w = finite(raw.get("width"), 0.01, width, name + "_width")
    h = finite(raw.get("height"), 0.01, height, name + "_height")
    if x + w > width + 1e-6 or y + h > height + 1e-6:
        reject("out_of_bounds_" + name)
    return (x, y, x + w, y + h)


def intersection_over_union(a, b):
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x1-x0) * max(0, y1-y0)
    union = (a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-inter
    return inter/union if union > 0 else 0


def validate_inputs(observations, target_spec):
    if not isinstance(observations, dict) or observations.get("schema") != OBS_SCHEMA:
        reject("wrong_observation_schema")
    if not isinstance(target_spec, dict) or target_spec.get("schema") != TARGET_SCHEMA:
        reject("wrong_target_schema")
    source = digest(observations.get("sourceSha256"), "observation_source_digest")
    model = digest(observations.get("modelSha256"), "observation_model_digest")
    if digest(target_spec.get("sourceSha256"), "target_source_digest") != source:
        reject("target_source_mismatch")
    if digest(target_spec.get("modelSha256"), "target_model_digest") != model:
        reject("target_model_mismatch")
    digest(target_spec.get("calibrationEvidenceSha256"), "calibration_digest")
    camera = observations.get("calibration")
    if not isinstance(camera, dict):
        reject("missing_calibration")
    fx = finite(camera.get("fxPx"), 1, 10000, "focal_length")
    baseline = finite(camera.get("baselineM"), 0.001, 10, "baseline")
    supplied = target_spec.get("claimedCalibration")
    if not isinstance(supplied, dict):
        reject("missing_target_calibration")
    if abs(finite(supplied.get("fxPx"), 1, 10000, "target_fx") - fx) > 1e-5:
        reject("calibration_focal_mismatch")
    if abs(finite(supplied.get("baselineM"), 0.001, 10, "target_baseline") - baseline) > 1e-7:
        reject("calibration_baseline_mismatch")
    text_id(target_spec.get("rigId"), "rig_id")
    raw_frames = observations.get("frames")
    if not isinstance(raw_frames, list) or not 1 <= len(raw_frames) <= 400:
        reject("invalid_frames")
    frames = {}
    previous_ts = None
    for f in raw_frames:
        if not isinstance(f, dict):
            reject("invalid_frame")
        fid = text_id(f.get("frameId"), "frame_id")
        if fid in frames:
            reject("duplicate_frame")
        ts = finite(f.get("timestampMs"), 0, 1e15, "frame_time")
        if previous_ts is not None and ts <= previous_ts:
            reject("nonmonotonic_timestamps")
        previous_ts = ts
        w = finite(f.get("width"), 16, 4096, "image_width")
        h = finite(f.get("height"), 12, 4096, "image_height")
        if not w.is_integer() or not h.is_integer():
            reject("noninteger_dimensions")
        observations_in_frame = f.get("observations")
        if not isinstance(observations_in_frame, list) or len(observations_in_frame) > 200:
            reject("invalid_frame_observations")
        ids = set()
        for o in observations_in_frame:
            if not isinstance(o, dict) or o.get("schema") != "evercraft.spatial-perception.observation.v0":
                reject("wrong_detection_schema")
            oid = text_id(o.get("id"), "observation_id", 160)
            if oid in ids:
                reject("duplicate_detection")
            ids.add(oid)
            if o.get("frameId") != fid or o.get("timestampMs") != ts:
                reject("detection_frame_mismatch")
            if o.get("sourceSha256") != source:
                reject("detection_source_mismatch")
            if o.get("georegistered") is True or o.get("safetyCriticalApproved") is True:
                reject("authority_escalation")
            text_id(o.get("label"), "detection_label", 80)
            box(o.get("box"), w, h, "detection_box")
            finite(o.get("detectorConfidence"), 0, 1, "detection_confidence")
            z = o.get("depthEstimateM")
            if z is not None:
                finite(z, 0.001, 10000, "observed_depth")
                pos = o.get("cameraPositionM")
                if not isinstance(pos, dict) or abs(finite(pos.get("z"), 0.001, 10000, "position_depth") - z) > 0.002:
                    reject("inconsistent_camera_depth")
            elif o.get("cameraPositionM") is not None:
                reject("unsupported_camera_position")
        frames[fid] = f
    refs = target_spec.get("targets")
    if not isinstance(refs, list) or not 1 <= len(refs) <= 500:
        reject("invalid_reference_targets")
    seen = set()
    for t in refs:
        if not isinstance(t, dict):
            reject("invalid_reference_target")
        rid = text_id(t.get("id"), "target_id")
        if rid in seen:
            reject("duplicate_target")
        seen.add(rid)
        fid = text_id(t.get("frameId"), "target_frame_id")
        if fid not in frames:
            reject("target_frame_missing")
        f = frames[fid]
        text_id(t.get("label"), "target_label", 80)
        box(t.get("box"), f["width"], f["height"], "target_box")
        finite(t.get("referenceCameraAxisDepthM"), 0.01, 10000, "reference_depth")
        finite(t.get("referenceUncertaintyM"), 0, 1000, "reference_uncertainty")
        if t.get("measurementMethod") not in METHODS:
            reject("invalid_reference_method")
    return frames, source, model


def evaluate(observations, targets, *, min_iou=0.5, ambiguity_margin=0.08):
    finite(min_iou, 0.1, 1, "minimum_iou")
    finite(ambiguity_margin, 0, 1, "ambiguity_margin")
    frames, source, model = validate_inputs(observations, targets)
    outcomes = []
    used = set()
    for t in targets["targets"]:
        f = frames[t["frameId"]]
        target_box = box(t["box"], f["width"], f["height"], "target_box")
        choices = []
        for o in f["observations"]:
            if o["label"] != t["label"]:
                continue
            score = intersection_over_union(target_box, box(o["box"], f["width"], f["height"], "detection_box"))
            if score >= min_iou:
                choices.append((score, o["id"], o))
        choices.sort(key=lambda v: (-v[0], v[1]))
        outcome = {
            "targetId": t["id"], "frameId": t["frameId"], "label": t["label"],
            "referenceCameraAxisDepthM": t["referenceCameraAxisDepthM"],
            "referenceUncertaintyM": t["referenceUncertaintyM"],
            "measurementMethod": t["measurementMethod"],
            "matchedObservationId": None, "intersectionOverUnion": None,
            "estimatedCameraAxisDepthM": None,
            "absoluteErrorM": None, "relativeErrorPct": None,
            "result": "no_corresponding_detection"
        }
        if choices:
            if len(choices) > 1 and choices[0][0] - choices[1][0] <= ambiguity_margin:
                outcome["result"] = "ambiguous_detection"
            elif (t["frameId"], choices[0][1]) in used:
                outcome["result"] = "duplicate_detection_match"
            else:
                score, oid, o = choices[0]
                used.add((t["frameId"], oid))
                outcome["matchedObservationId"] = oid
                outcome["intersectionOverUnion"] = round(score, 4)
                z = o.get("depthEstimateM")
                if z is None:
                    outcome["result"] = "no_depth_estimate"
                else:
                    err = abs(z - t["referenceCameraAxisDepthM"])
                    outcome["estimatedCameraAxisDepthM"] = z
                    outcome["absoluteErrorM"] = round(err, 4)
                    outcome["relativeErrorPct"] = round(100 * err / t["referenceCameraAxisDepthM"], 3)
                    outcome["result"] = "evaluated_uncertified"
        outcomes.append(outcome)
    errors = [o["absoluteErrorM"] for o in outcomes if o["absoluteErrorM"] is not None]
    count = len(errors)
    return {
        "schema": REPORT_SCHEMA,
        "provenance": {
            "sourceSha256": source,
            "modelSha256": model,
            "calibrationEvidenceSha256": targets["calibrationEvidenceSha256"],
            "rigId": targets["rigId"],
            "byteIntegrityCheckedLocally": False,
            "calibrationAuthenticityVerified": False,
            "referenceIndependenceVerified": False
        },
        "referenceEvidenceClass": ("synthetic_fixture" if any(t["measurementMethod"] == "synthetic_known_disparity" for t in targets["targets"]) else "operator_attested_measurements_unverified"),
        "measurementAxis": "left_camera_optical_z_meters",
        "summary": {
            "referenceTargets": len(outcomes),
            "evaluatedTargets": count,
            "coveragePct": round(100 * count / len(outcomes), 2),
            "noDetection": sum(o["result"] == "no_corresponding_detection" for o in outcomes),
            "ambiguousDetections": sum(o["result"] == "ambiguous_detection" for o in outcomes),
            "noDepth": sum(o["result"] == "no_depth_estimate" for o in outcomes),
            "meanAbsoluteErrorM": round(statistics.mean(errors), 4) if errors else None,
            "rootMeanSquareErrorM": round(math.sqrt(sum(e*e for e in errors)/count), 4) if errors else None,
            "medianAbsoluteErrorM": round(statistics.median(errors), 4) if errors else None,
            "maximumAbsoluteErrorM": round(max(errors), 4) if errors else None
        },
        "targets": outcomes,
        "status": "operator_supplied_reference_comparison_not_certified",
        "humanReviewRequired": True,
        "fieldAccuracyCertified": False,
        "safetyCriticalApproved": False,
        "georegistered": False,
        "worldPersistenceAuthorized": False
    }


def run(args):
    paths = [args.observations, args.targets, args.source_video, args.model, args.calibration_evidence]
    if any(not p.is_file() or p.is_symlink() for p in paths) or args.output.is_symlink():
        reject("missing_or_symlinked_input")
    if args.output.resolve() in {p.resolve() for p in paths}:
        reject("output_overwrites_input")
    if not args.authorized_source or not args.independent_references_attested:
        reject("explicit_source_rights_and_reference_attestation_required")
    obs, targets = local_json(args.observations), local_json(args.targets)
    report = evaluate(obs, targets, min_iou=args.min_iou)
    provenance = report["provenance"]
    if sha256_file(args.source_video) != provenance["sourceSha256"]:
        reject("local_source_sha_mismatch")
    if sha256_file(args.model) != provenance["modelSha256"]:
        reject("local_model_sha_mismatch")
    if sha256_file(args.calibration_evidence) != provenance["calibrationEvidenceSha256"]:
        reject("local_calibration_evidence_sha_mismatch")
    # Rehash after building the report so local file changes fail before output.
    if (sha256_file(args.source_video) != provenance["sourceSha256"] or
        sha256_file(args.model) != provenance["modelSha256"] or
        sha256_file(args.calibration_evidence) != provenance["calibrationEvidenceSha256"]):
        reject("input_changed_during_evaluation")
    provenance["byteIntegrityCheckedLocally"] = True
    report["evidence"] = {
        "localObservationJsonSha256": sha256_file(args.observations),
        "localTargetJsonSha256": sha256_file(args.targets),
        "physicalCalibrationVerified": False,
        "independentMeasurementsExternallyVerified": False
    }
    write_private_json(args.output, report)
    return {"output": str(args.output), "referenceTargets": report["summary"]["referenceTargets"],
            "evaluatedTargets": report["summary"]["evaluatedTargets"],
            "meanAbsoluteErrorM": report["summary"]["meanAbsoluteErrorM"],
            "fieldAccuracyCertified": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--observations", type=Path, required=True)
    parser.add_argument("--targets", type=Path, required=True)
    parser.add_argument("--source-video", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--calibration-evidence", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--min-iou", type=float, default=0.5)
    parser.add_argument("--authorized-source", action="store_true")
    parser.add_argument("--independent-references-attested", action="store_true")
    args = parser.parse_args()
    try:
        print(json.dumps(run(args)))
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print("spatial_field_error: " + str(exc), file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
