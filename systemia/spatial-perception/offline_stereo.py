#!/usr/bin/env python3
"""Evercraft offline, permissioned stereo + YOLOv8 ONNX frame importer.

This script ONLY accepts locally owned/authorized, already RECTIFIED stereo
side-by-side video (left | right). It does not download models, rectify cameras,
compute trustworthy forensic measurements, or identify people.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import tempfile

MAX_FRAMES = 400
MAX_OBJECTS = 50
FRAME_SCHEMA = "evercraft.spatial-perception.observation.v0"
FORMAT = "yolov8_onnx_no_nms"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(part)
    return digest.hexdigest()


def number(value, minimum, maximum, field):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("invalid_" + field)
    if not minimum <= value <= maximum:
        raise ValueError("invalid_" + field)
    return value


def load_manifest(path: Path) -> dict:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise ValueError("invalid_model_manifest")
    labels = manifest.get("labels")
    if not isinstance(labels, list) or not 1 <= len(labels) <= 200 or not all(
        isinstance(x, str) and x.strip() and len(x) <= 80 for x in labels
    ) or len(set(labels)) != len(labels):
        raise ValueError("invalid_model_labels")
    if manifest.get("format") != FORMAT:
        raise ValueError("unsupported_model_format")
    size = manifest.get("inputSize")
    if not isinstance(size, int) or isinstance(size, bool) or not 160 <= size <= 1280 or size % 32:
        raise ValueError("invalid_model_input_size")
    checksum = manifest.get("sha256")
    if not isinstance(checksum, str) or len(checksum) != 64 or any(c not in "0123456789abcdef" for c in checksum):
        raise ValueError("invalid_model_checksum")
    if manifest.get("rights") != "authorized_local_use":
        raise ValueError("model_rights_not_confirmed")
    return manifest


def overlap_ratio(a, b):
    x1 = max(a[0], b[0])
    y1 = max(a[1], b[1])
    x2 = min(a[2], b[2])
    y2 = min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    total = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / total if total > 0 else 0


def nms(detections, threshold=0.5, limit=MAX_OBJECTS):
    """Per-class NMS, deterministic ties. Rows: label ID, confidence, xyxy."""
    number(threshold, 0, 1, "nms_threshold")
    retained = []
    for detection in sorted(detections, key=lambda d: (-d[1], d[0], *d[2])):
        if all(detection[0] != prev[0] or overlap_ratio(detection[2], prev[2]) < threshold
               for prev in retained):
            retained.append(detection)
            if len(retained) >= limit:
                break
    return retained


def observation(frame_id, timestamp_ms, index, label, score, box, disparity, fx, baseline,
                video_digest, width, height):
    x, y, w, h = box
    if w <= 0 or h <= 0 or x < 0 or y < 0 or x + w > width or y + h > height:
        raise ValueError("invalid_detection_box")
    number(score, 0, 1, "detector_confidence")
    z = None if disparity is None or not math.isfinite(disparity) or disparity <= 1 else round(fx * baseline / disparity, 3)
    pos = None if z is None else {
        "x": round((x + w / 2 - (width - 1) / 2) * z / fx, 3),
        "y": round(((height - 1) / 2 - y - h / 2) * z / fx, 3),
        "z": z,
    }
    return {
        "schema": FRAME_SCHEMA,
        "id": frame_id + ":" + str(index),
        "frameId": frame_id, "timestampMs": timestamp_ms,
        "label": label, "detectorConfidence": round(float(score), 4),
        "box": {"x": round(x, 2), "y": round(y, 2),
                "width": round(w, 2), "height": round(h, 2)},
        "depthEstimateM": z,
        "depthStatus": "estimated_not_verified" if z is not None else "unknown",
        "cameraPositionM": pos, "coordinateFrame": "camera_relative",
        "sourceSha256": video_digest,
        "georegistered": False, "safetyCriticalApproved": False,
    }


def make_letterbox(frame, size, cv2, np):
    """YOLOv8 square letterbox preserving original aspect ratio."""
    height, width = frame.shape[:2]
    scale = min(size / width, size / height)
    resized_w, resized_h = round(width * scale), round(height * scale)
    resized = cv2.resize(frame, (resized_w, resized_h), interpolation=cv2.INTER_LINEAR)
    pad_x = (size - resized_w) // 2
    pad_y = (size - resized_h) // 2
    canvas = np.full((size, size, 3), 114, dtype=np.uint8)
    canvas[pad_y:pad_y + resized_h, pad_x:pad_x + resized_w] = resized
    rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)
    tensor = np.ascontiguousarray(rgb.transpose(2, 0, 1)[None], dtype=np.float32) / 255.0
    return tensor, scale, pad_x, pad_y


def decode_yolov8(output, labels, width, height, scale, pad_x, pad_y, threshold, np):
    """Unfused YOLOv8 output only: [1,4+classes,N] or [1,N,4+classes]."""
    arr = np.asarray(output)
    channels = 4 + len(labels)
    if arr.ndim != 3 or arr.shape[0] != 1:
        raise ValueError("unsupported_model_output_rank")
    if arr.shape[1] == channels:
        matrix = arr[0].T
    elif arr.shape[2] == channels:
        matrix = arr[0]
    else:
        raise ValueError("unsupported_model_output_channels")
    if not 1 <= matrix.shape[0] <= 100000:
        raise ValueError("unsupported_model_output_count")
    candidates = []
    for row in matrix:
        if not np.all(np.isfinite(row)):
            continue
        cx, cy, bw, bh = map(float, row[:4])
        if bw <= 0 or bh <= 0:
            continue
        scores = row[4:]
        cls = int(np.argmax(scores))
        confidence = float(scores[cls])
        if not 0 <= confidence <= 1 or confidence < threshold:
            continue
        x1 = max(0.0, min(float(width), (cx - bw / 2 - pad_x) / scale))
        y1 = max(0.0, min(float(height), (cy - bh / 2 - pad_y) / scale))
        x2 = max(0.0, min(float(width), (cx + bw / 2 - pad_x) / scale))
        y2 = max(0.0, min(float(height), (cy + bh / 2 - pad_y) / scale))
        if x2 - x1 >= 2 and y2 - y1 >= 2:
            candidates.append((cls, confidence, (x1, y1, x2, y2)))
    return nms(candidates)[:MAX_OBJECTS]


def box_disparity(disparity, box, np):
    """Use the central half of an object to reduce background contamination."""
    x1, y1, x2, y2 = box
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    w, h = x2 - x1, y2 - y1
    x0, xx = max(0, int(cx - w / 4)), min(disparity.shape[1], int(cx + w / 4))
    y0, yy = max(0, int(cy - h / 4)), min(disparity.shape[0], int(cy + h / 4))
    if xx <= x0 or yy <= y0:
        return None
    values = disparity[y0:yy, x0:xx]
    good = values[np.isfinite(values) & (values > 1.0)]
    if good.size < max(8, int(values.size * 0.2)):
        return None
    return float(np.median(good))


def write_private_json(destination: Path, payload: dict):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_symlink():
        raise ValueError("symlink_output_not_allowed")
    fd, tmp = tempfile.mkstemp(prefix=".spatial-", suffix=".tmp", dir=destination.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, separators=(",", ":"), allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, destination)
        os.chmod(destination, 0o600)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def run(args):
    for path in (args.video, args.model, args.manifest):
        if not path.is_file() or path.is_symlink():
            raise ValueError("missing_or_symlinked_local_input")
    if not args.authorized_source or not args.rectified_stereo:
        raise ValueError("source_authorization_and_rectification_required")
    fx = number(args.fx_px, 1, 10000, "fx_px")
    baseline = number(args.baseline_m, 0.001, 10, "baseline_m")
    number(args.confidence, 0.05, 0.99, "confidence")
    if not isinstance(args.max_frames, int) or not 1 <= args.max_frames <= MAX_FRAMES:
        raise ValueError("invalid_max_frames")
    if not isinstance(args.frame_step, int) or not 1 <= args.frame_step <= 120:
        raise ValueError("invalid_frame_step")
    if args.output.resolve() in {args.video.resolve(),args.model.resolve(),args.manifest.resolve()}:
        raise ValueError("output_would_overwrite_input")
    if args.video.stat().st_size > 2_000_000_000 or args.model.stat().st_size > 1_000_000_000:
        raise ValueError("input_size_limit_exceeded")
    manifest = load_manifest(args.manifest)
    model_digest = sha256_file(args.model)
    if model_digest != manifest["sha256"]:
        raise ValueError("model_digest_mismatch")
    video_digest = sha256_file(args.video)

    try:
        import cv2
        import numpy as np
        import onnxruntime as ort
    except ImportError as exc:
        raise RuntimeError("local_packages_required: opencv-python-headless numpy onnxruntime") from exc

    session = ort.InferenceSession(str(args.model), providers=["CPUExecutionProvider"])
    inputs = session.get_inputs()
    if len(inputs) != 1 or len(inputs[0].shape) != 4:
        raise ValueError("unsupported_model_inputs")
    if inputs[0].shape[1] != 3 or inputs[0].shape[2] != manifest["inputSize"] or inputs[0].shape[3] != manifest["inputSize"]:
        raise ValueError("model_manifest_input_mismatch")
    cap = cv2.VideoCapture(str(args.video))
    if not cap.isOpened():
        raise ValueError("unreadable_video")
    fps = float(cap.get(cv2.CAP_PROP_FPS))
    if not math.isfinite(fps) or fps <= 0 or fps > 240:
        cap.release()
        raise ValueError("invalid_video_frame_rate")
    matcher = cv2.StereoSGBM_create(minDisparity=0, numDisparities=64, blockSize=5,
                                   P1=8 * 25, P2=32 * 25, mode=cv2.STEREO_SGBM_MODE_SGBM_3WAY)
    frames = []
    read_count = 0
    try:
        while len(frames) < args.max_frames:
            ok, full = cap.read()
            if not ok:
                break
            source_index = read_count
            read_count += 1
            if source_index % args.frame_step:
                continue
            height, pair_width = full.shape[:2]
            if pair_width % 2:
                raise ValueError("stereo_video_must_be_even_width")
            width = pair_width // 2
            if width < 128 or height < 64 or width > 1920 or height > 1080:
                raise ValueError("stereo_frame_dimensions_not_supported")
            left, right = full[:, :width], full[:, width:]
            gray_l = cv2.cvtColor(left, cv2.COLOR_BGR2GRAY)
            gray_r = cv2.cvtColor(right, cv2.COLOR_BGR2GRAY)
            disparity = matcher.compute(gray_l, gray_r).astype(np.float32) / 16.0
            tensor, scale, pad_x, pad_y = make_letterbox(left, manifest["inputSize"], cv2, np)
            result = session.run(None, {inputs[0].name: tensor})
            if len(result) != 1:
                raise ValueError("unsupported_multiple_model_outputs")
            detected = decode_yolov8(result[0], manifest["labels"], width, height,
                                     scale, pad_x, pad_y, args.confidence, np)
            frame_id = "stereo-" + str(source_index).zfill(8)
            timestamp_ms = round(source_index / fps * 1000)
            observations = []
            for index, (cls, confidence, box) in enumerate(detected):
                z_disp = box_disparity(disparity, box, np)
                x1, y1, x2, y2 = box
                observations.append(observation(
                    frame_id, timestamp_ms, index, manifest["labels"][cls], confidence,
                    (x1, y1, x2 - x1, y2 - y1), z_disp, fx, baseline,
                    video_digest, width, height
                ))
            frames.append({"frameId": frame_id, "timestampMs": timestamp_ms,
                           "width": width, "height": height, "observations": observations})
    finally:
        cap.release()
    if not frames:
        raise ValueError("no_frames_processed")

    payload = {
        "schema": "evercraft.spatial-perception.offline-import.v1",
        "sourceSha256": video_digest,
        "modelSha256": model_digest,
        "modelFormat": FORMAT,
        "media": "local_authorized_rectified_stereo_side_by_side",
        "frameTimestampBasis": "decoded_source_frame_index_over_reported_fps",
        "calibration": {"fxPx": fx, "baselineM": baseline, "rectification": "user_asserted_not_verified"},
        "evidenceStatus": "unreviewed_not_field_calibrated",
        "coordinateFrame": "camera_relative",
        "frames": frames
    }
    if sha256_file(args.video) != video_digest or sha256_file(args.model) != model_digest:
        raise ValueError("source_or_model_changed_during_processing")
    serialized_bytes = len(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    if serialized_bytes > 9_500_000:
        raise ValueError("output_exceeds_browser_review_limit_reduce_max_frames")
    write_private_json(args.output, payload)
    return {"frames": len(frames), "observations": sum(len(f["observations"]) for f in frames),
            "output": str(args.output), "evidenceStatus": payload["evidenceStatus"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", required=True, type=Path, help="Already rectified stereo side-by-side local video")
    parser.add_argument("--model", required=True, type=Path, help="Locally provided YOLOv8 unfused ONNX file")
    parser.add_argument("--manifest", required=True, type=Path, help="Local format/labels/license/model-SHA manifest")
    parser.add_argument("--fx-px", required=True, type=float, help="Calibrated left-camera focal length in original pixels")
    parser.add_argument("--baseline-m", required=True, type=float, help="Measured stereo separation in meters")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--confidence", type=float, default=0.45)
    parser.add_argument("--max-frames", type=int, default=60)
    parser.add_argument("--frame-step", type=int, default=5)
    parser.add_argument("--authorized-source", action="store_true", help="User verifies rights to analyze source footage")
    parser.add_argument("--rectified-stereo", action="store_true", help="User confirms pre-rectified synchronized stereo footage")
    args = parser.parse_args()
    try:
        print(json.dumps(run(args)))
    except (ValueError, RuntimeError, OSError, json.JSONDecodeError) as error:
        print("spatial_offline_error: " + str(error), file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
