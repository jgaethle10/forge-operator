#!/usr/bin/env python3
"""Evercraft V8 locally owned stereo-calibration and rectification field kit.

Calibrate from authorized, simultaneous checkerboard still pairs. Rectify a
separately supplied left|right side-by-side video using those matrices.
No webcam access, auto-download, external inference, real-world validation
claim, or production/forensic authority.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import sys
import tempfile

from offline_stereo import sha256_file, write_private_json

INPUT_SCHEMA = "evercraft.spatial-perception.stereo-calibration-input.v1"
CALIBRATION_SCHEMA = "evercraft.spatial-perception.stereo-calibration.v1"
RECTIFICATION_SCHEMA = "evercraft.spatial-perception.rectification-receipt.v1"
MAX_PAIRS = 80
MIN_PAIRS = 10
MAX_VIDEO_BYTES = 2_000_000_000
MAX_IMAGE_BYTES = 20_000_000
MAX_FRAMES = 400


def error(reason):
    raise ValueError("spatial_stereo_fieldkit_" + reason)


def number(value, low, high, field):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        error("invalid_" + field)
    if not low <= value <= high:
        error("invalid_" + field)
    return float(value)


def integer(value, low, high, field):
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        error("invalid_" + field)
    return value


def read_json(path):
    if not path.is_file() or path.is_symlink() or path.stat().st_size > 1000000:
        error("invalid_local_json")
    def no_constant(_):
        error("nonfinite_json")
    result = json.loads(path.read_text(encoding="utf-8"), parse_constant=no_constant)
    if not isinstance(result, dict):
        error("invalid_json_object")
    return result


def relative_image(base, name):
    if not isinstance(name, str) or not name or len(name) > 240 or "\\" in name:
        error("invalid_image_path")
    pure = PurePosixPath(name)
    if pure.is_absolute() or ".." in pure.parts or "." in pure.parts:
        error("invalid_image_path")
    resolved = base.joinpath(*pure.parts)
    if not resolved.resolve().is_relative_to(base.resolve()):
        error("image_path_outside_manifest")
    if not resolved.is_file() or resolved.is_symlink() or resolved.stat().st_size > MAX_IMAGE_BYTES:
        error("missing_or_unsafe_image")
    # Reject a symlinked parent folder, too.
    for ancestor in [resolved.parent, *resolved.parents]:
        if ancestor == base.parent:
            break
        if ancestor.is_symlink():
            error("symlinked_image_directory")
    return resolved


def calibration_inputs(data, base):
    if data.get("schema") != INPUT_SCHEMA or data.get("sourceRights") != "authorized_local_use":
        error("input_rights_or_schema_invalid")
    rid = data.get("rigId")
    if not isinstance(rid, str) or not rid.strip() or len(rid) > 128:
        error("invalid_rig_id")
    board = data.get("checkerboard")
    if not isinstance(board, dict):
        error("invalid_checkerboard")
    columns = integer(board.get("columns"), 5, 16, "checkerboard_columns")
    rows = integer(board.get("rows"), 4, 12, "checkerboard_rows")
    squares = number(board.get("squareSizeM"), 0.002, 0.2, "square_size")
    pairs = data.get("pairs")
    if not isinstance(pairs, list) or not MIN_PAIRS <= len(pairs) <= MAX_PAIRS:
        error("invalid_pair_count")
    seen = set()
    validated = []
    for item in pairs:
        if not isinstance(item, dict):
            error("invalid_pair")
        left = relative_image(base, item.get("left"))
        right = relative_image(base, item.get("right"))
        if left == right or left in seen or right in seen:
            error("duplicate_or_self_pair")
        seen.add(left);seen.add(right)
        validated.append((left, right))
    return rid,(columns, rows, squares),validated


def vision_modules():
    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise RuntimeError("local_packages_required_opencv_and_numpy") from exc
    return cv2,np


def chessboard_corners(image, shape, cv2):
    dims=(shape[0],shape[1])
    if hasattr(cv2,"findChessboardCornersSB"):
        ok,corners=cv2.findChessboardCornersSB(image,dims)
    else:
        ok,corners=cv2.findChessboardCorners(image,dims)
        if ok:
            corners=cv2.cornerSubPix(image,corners,(9,9),(-1,-1),
                (cv2.TERM_CRITERIA_EPS+cv2.TERM_CRITERIA_MAX_ITER,30,.001))
    return corners if ok else None


def serialize_matrix(array, np):
    a=np.asarray(array)
    if not np.isfinite(a).all():
        error("nonfinite_calibration_matrix")
    return a.astype("float64").tolist()


def calibrate(manifest_file, output, authorized_source=False):
    if not authorized_source:
        error("source_authorization_required")
    if output.is_symlink() or output.exists() or output.resolve() == manifest_file.resolve():
        error("unsafe_or_existing_output")
    data=read_json(manifest_file)
    rig,board,pairs=calibration_inputs(data,manifest_file.parent)
    cv2,np=vision_modules()
    columns,rows,square=board
    coords=np.zeros((columns*rows,3),np.float32)
    coords[:,:2]=np.mgrid[0:columns,0:rows].T.reshape(-1,2)*square
    object_points=[];left_points=[];right_points=[]
    receipts=[];image_dims=None
    for left,right in pairs:
        l=cv2.imread(str(left),cv2.IMREAD_GRAYSCALE)
        r=cv2.imread(str(right),cv2.IMREAD_GRAYSCALE)
        if l is None or r is None or l.shape != r.shape:
            error("unreadable_or_mismatched_pair")
        h,w=l.shape
        if not 320<=w<=1920 or not 240<=h<=1080:
            error("unsupported_calibration_image_dimensions")
        if image_dims is None:image_dims=(w,h)
        if image_dims!=(w,h):
            error("mixed_calibration_resolution")
        lc=chessboard_corners(l,(columns,rows),cv2)
        rc=chessboard_corners(r,(columns,rows),cv2)
        success=lc is not None and rc is not None
        receipts.append({
            "leftPath":left.relative_to(manifest_file.parent).as_posix(),
            "rightPath":right.relative_to(manifest_file.parent).as_posix(),
            "leftSha256":sha256_file(left),"rightSha256":sha256_file(right),
            "bothBoardsFound":success
        })
        if success:
            object_points.append(coords.copy())
            left_points.append(lc)
            right_points.append(rc)
    if len(object_points) < MIN_PAIRS:
        error("insufficient_detected_stereo_checkerboards")
    left_rms,K1,D1,_,_=cv2.calibrateCamera(object_points,left_points,image_dims,None,None)
    right_rms,K2,D2,_,_=cv2.calibrateCamera(object_points,right_points,image_dims,None,None)
    flags=cv2.CALIB_FIX_INTRINSIC
    result=cv2.stereoCalibrate(object_points,left_points,right_points,K1,D1,K2,D2,
        image_dims,flags=flags,criteria=(cv2.TERM_CRITERIA_MAX_ITER+cv2.TERM_CRITERIA_EPS,200,1e-7))
    stereo_rms,K1,D1,K2,D2,R,T,E,F=result
    if any(not math.isfinite(float(rms)) or float(rms)>1.5
           for rms in (left_rms,right_rms,stereo_rms)):
        error("reprojection_rms_exceeds_prototype_limit")
    baseline=float(np.linalg.norm(T))
    if not 0.01<=baseline<=5:
        error("implausible_baseline")
    if float(T[0][0]) >= 0 or abs(float(T[0][0]))/baseline < .75:
        error("unsupported_stereo_order_or_vertical_rig")
    R1,R2,P1,P2,Q,roi1,roi2=cv2.stereoRectify(
        K1,D1,K2,D2,image_dims,R,T,flags=cv2.CALIB_ZERO_DISPARITY,alpha=0)
    fx=number(float(P1[0,0]),10,10000,"rectified_fx")
    if float(P2[0,3])>=0:
        error("unsupported_rectified_baseline_sign")
    output_data={
        "schema":CALIBRATION_SCHEMA,
        "rigId":rig,
        "sourceManifestSha256":sha256_file(manifest_file),
        "manifestRights":"authorized_local_use",
        "imageWidth":image_dims[0],"imageHeight":image_dims[1],
        "checkerboard":{"columns":columns,"rows":rows,"squareSizeM":square},
        "pairsProvided":len(pairs),"pairsDetected":len(object_points),
        "pairSources":receipts,
        "imageReprojectionRmsPx":{"left":round(float(left_rms),5),
            "right":round(float(right_rms),5),"stereo":round(float(stereo_rms),5)},
        "baselineM":round(baseline,7),"rectifiedFxPx":round(fx,6),
        "rectifiedCxPx":round(float(P1[0,2]),6),
        "rectifiedCyPx":round(float(P1[1,2]),6),
        "matrices":{key:serialize_matrix(value,np) for key,value in {
            "K1":K1,"D1":D1,"K2":K2,"D2":D2,
            "R":R,"T":T,"R1":R1,"R2":R2,"P1":P1,"P2":P2,"Q":Q}.items()},
        "qualityStatus":"prototype_checkerboard_solution_not_field_verified",
        "physicalBaselineIndependentlyVerified":False,
        "timestampSyncVerified":False,
        "realWorldAccuracyCertified":False,
        "safetyCriticalApproved":False
    }
    write_private_json(output,output_data)
    return {"output":str(output),"pairsDetected":len(object_points),
            "stereoRmsPx":output_data["imageReprojectionRmsPx"]["stereo"],
            "baselineM":output_data["baselineM"],"realWorldAccuracyCertified":False}


def validated_calibration(data, np):
    if (data.get("schema") != CALIBRATION_SCHEMA or
        data.get("qualityStatus") != "prototype_checkerboard_solution_not_field_verified"):
        error("invalid_calibration_schema")
    if (data.get("realWorldAccuracyCertified") is not False or
        data.get("safetyCriticalApproved") is not False):
        error("unsupported_calibration_authority")
    w=integer(data.get("imageWidth"),320,1920,"image_width")
    h=integer(data.get("imageHeight"),240,1080,"image_height")
    number(data.get("baselineM"),.01,5,"baseline")
    number(data.get("rectifiedFxPx"),10,10000,"fx")
    number(data.get("rectifiedCxPx"),0,w,"cx")
    number(data.get("rectifiedCyPx"),0,h,"cy")
    matrix_shapes={"K1":(3,3),"D1":None,"K2":(3,3),"D2":None,
       "R":(3,3),"T":None,"R1":(3,3),"R2":(3,3),
       "P1":(3,4),"P2":(3,4),"Q":(4,4)}
    raw=data.get("matrices")
    if not isinstance(raw,dict):
        error("missing_calibration_matrices")
    matrices={}
    for key,shape in matrix_shapes.items():
        try:
            value=np.asarray(raw[key],dtype=np.float64)
        except (TypeError,ValueError,KeyError):
            error("invalid_matrix_"+key)
        if shape is not None and value.shape!=shape:
            error("bad_matrix_shape_"+key)
        if key in ("D1","D2") and (value.size<4 or value.size>14):
            error("invalid_distortion_"+key)
        if key=="T" and value.size!=3:
            error("invalid_translation")
        if not np.isfinite(value).all():
            error("nonfinite_matrix_"+key)
        matrices[key]=value
    if not np.isclose(matrices["P1"][0,0],data["rectifiedFxPx"],atol=1e-4):
        error("rectified_focal_conflict")
    if not np.isclose(matrices["P1"][0,2],data["rectifiedCxPx"],atol=1e-4):
        error("rectified_center_conflict")
    if float(matrices["P2"][0,3])>=0:
        error("wrong_rectified_camera_order")
    if abs(float(np.linalg.norm(matrices["T"]))-data["baselineM"])>1e-4:
        error("baseline_matrix_conflict")
    return (w,h),matrices


def rectify(calibration_file, source_video, output_video, receipt_path,
            authorized_source=False, reviewed_calibration=False, max_frames=120):
    if not authorized_source or not reviewed_calibration:
        error("explicit_source_and_calibration_review_required")
    integer(max_frames,1,MAX_FRAMES,"max_frames")
    paths=(calibration_file,source_video)
    if any(not p.is_file() or p.is_symlink() for p in paths):
        error("missing_or_symlinked_input")
    if source_video.stat().st_size>MAX_VIDEO_BYTES:
        error("oversized_video")
    if (output_video.suffix.lower()!=".avi" or output_video.exists() or
        receipt_path.exists() or output_video.is_symlink() or receipt_path.is_symlink() or
        output_video.resolve()==receipt_path.resolve() or
        any(out.resolve() in {p.resolve() for p in paths}
            for out in (output_video,receipt_path))):
        error("unsafe_or_existing_output")
    data=read_json(calibration_file)
    cv2,np=vision_modules()
    (w,h),m=validated_calibration(data,np)
    map1x,map1y=cv2.initUndistortRectifyMap(
        m["K1"],m["D1"],m["R1"],m["P1"],(w,h),cv2.CV_32FC1)
    map2x,map2y=cv2.initUndistortRectifyMap(
        m["K2"],m["D2"],m["R2"],m["P2"],(w,h),cv2.CV_32FC1)
    source_hash=sha256_file(source_video)
    calib_hash=sha256_file(calibration_file)
    cap=cv2.VideoCapture(str(source_video))
    if not cap.isOpened():
        error("unreadable_source_video")
    fps=float(cap.get(cv2.CAP_PROP_FPS))
    if not math.isfinite(fps) or not 1<=fps<=120:
        cap.release();error("invalid_video_fps")
    output_video.parent.mkdir(parents=True,exist_ok=True)
    receipt_path.parent.mkdir(parents=True,exist_ok=True)
    fd,temp_name=tempfile.mkstemp(prefix=".evercraft-stereo-",suffix=".avi",
        dir=output_video.parent)
    os.close(fd)
    writer=None;frames=0
    try:
        writer=cv2.VideoWriter(temp_name,cv2.VideoWriter_fourcc(*"MJPG"),fps,(2*w,h))
        if not writer.isOpened():
            error("rectified_video_writer_unavailable")
        while frames<max_frames:
            ok,pair=cap.read()
            if not ok:break
            if pair.shape[:2]!=(h,2*w):
                error("source_pair_dimensions_do_not_match_calibration")
            left=pair[:,:w]
            right=pair[:,w:]
            rect_left=cv2.remap(left,map1x,map1y,cv2.INTER_LINEAR)
            rect_right=cv2.remap(right,map2x,map2y,cv2.INTER_LINEAR)
            writer.write(np.concatenate([rect_left,rect_right],axis=1))
            frames+=1
        writer.release();writer=None
        cap.release()
        if frames<1 or os.path.getsize(temp_name)<256:
            error("no_rectified_video_frames")
        if sha256_file(source_video)!=source_hash or sha256_file(calibration_file)!=calib_hash:
            error("input_mutated_during_rectification")
        output_hash=sha256_file(Path(temp_name))
        # A reviewer must treat MJPEG re-encoding as derivative, not original evidence.
        receipt={
            "schema":RECTIFICATION_SCHEMA,"rigId":data["rigId"],
            "sourceVideoSha256":source_hash,"calibrationFileSha256":calib_hash,
            "rectifiedVideoSha256":output_hash,
            "outputFormat":"side_by_side_left_then_right_mjpeg_avi",
            "frameWidth":w,"frameHeight":h,"fpsFromSourceContainer":round(fps,6),
            "framesWritten":frames,
            "frameTimestampBasis":"index_over_container_fps_not_verified_capture_clock",
            "fxPx":data["rectifiedFxPx"],"baselineM":data["baselineM"],
            "cxPx":data["rectifiedCxPx"],"cyPx":data["rectifiedCyPx"],
            "rectificationStatus":"computed_operator_reviewed_not_field_validated",
            "originalFootagePreserved":True,
            "fieldAccuracyCertified":False,
            "safetyCriticalApproved":False,
            "georegistered":False
        }
        # Ensure metadata output is committed first? No: write receipt after video,
        # with rollback if the receipt fails, so no successful orphan receipt exists.
        os.chmod(temp_name,0o600)
        os.replace(temp_name,output_video)
        try:
            write_private_json(receipt_path,receipt)
        except Exception:
            output_video.unlink(missing_ok=True)
            raise
        return {"rectifiedVideo":str(output_video),"receipt":str(receipt_path),
                "framesWritten":frames,"fieldAccuracyCertified":False}
    finally:
        cap.release()
        if writer is not None:writer.release()
        if os.path.exists(temp_name):os.unlink(temp_name)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    subs=parser.add_subparsers(dest="operation",required=True)
    cal=subs.add_parser("calibrate",help="Build a provisional stereo calibration from checkerboard pairs")
    cal.add_argument("--manifest",required=True,type=Path)
    cal.add_argument("--output",required=True,type=Path)
    cal.add_argument("--authorized-source",action="store_true")
    rec=subs.add_parser("rectify",help="Rectify left/right side-by-side video using a reviewed calibration")
    rec.add_argument("--calibration",required=True,type=Path)
    rec.add_argument("--video",required=True,type=Path)
    rec.add_argument("--output-video",required=True,type=Path)
    rec.add_argument("--receipt",required=True,type=Path)
    rec.add_argument("--max-frames",type=int,default=120)
    rec.add_argument("--authorized-source",action="store_true")
    rec.add_argument("--reviewed-calibration",action="store_true")
    args=parser.parse_args()
    try:
        if args.operation=="calibrate":
            result=calibrate(args.manifest,args.output,args.authorized_source)
        else:
            result=rectify(args.calibration,args.video,args.output_video,args.receipt,
                           args.authorized_source,args.reviewed_calibration,args.max_frames)
        print(json.dumps(result))
    except (ValueError,RuntimeError,OSError,json.JSONDecodeError) as exc:
        print("spatial_fieldkit_error: "+str(exc),file=sys.stderr)
        sys.exit(2)


if __name__=="__main__":
    main()
