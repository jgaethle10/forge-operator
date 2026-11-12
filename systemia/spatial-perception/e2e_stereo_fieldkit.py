"""Synthetic V8 calibration-to-rectification-to-V3 importer field-kit smoke test.

All footage and checkerboard images are GENERATED in this test. It demonstrates
software operation, never physical camera calibration or real-world accuracy.
Requires numpy, opencv-python-headless, onnx, onnxruntime and Python 3.11.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import cv2
import numpy as np
from e2e_synthetic_stereo import synthetic_model

KIT=Path(__file__).with_name("stereo_fieldkit.py")
IMPORTER=Path(__file__).with_name("offline_stereo.py")
W,H=640,480
SQUARE=.03
BASELINE=.10
K=np.array([[850,0,W/2],[0,850,H/2],[0,0,1]],np.float64)


def generate_board_images(directory):
    """Project a 9x6 inner-corner chessboard into two known ideal cameras."""
    size=60
    texture=np.full((7*size,10*size),255,np.uint8)
    for row in range(7):
        for col in range(10):
            if (row+col)%2==0:
                texture[row*size:(row+1)*size,col*size:(col+1)*size]=0
    outer=np.array([
        [-SQUARE,-SQUARE,0],[9*SQUARE,-SQUARE,0],
        [9*SQUARE,6*SQUARE,0],[-SQUARE,6*SQUARE,0]],np.float32)
    pixels=np.array([[0,0],[10*size-1,0],
                     [10*size-1,7*size-1],[0,7*size-1]],np.float32)
    pairs=[]
    for i in range(16):
        rotation=np.array([
           .06+.14*np.sin(i*.8),-.09+.12*np.cos(i*.9),.03*np.sin(i*.6)
        ],np.float64)
        translation=np.array([
            -.035+.05*np.cos(i*.9),-.04+.04*np.sin(i*.8),
            .68+.13*np.sin(i*.4)
        ],np.float64)
        names={}
        for side,offset in [("left",0),("right",BASELINE)]:
            shifted=translation.copy()
            shifted[0]-=offset
            points,_=cv2.projectPoints(outer,rotation,shifted,K,np.zeros(5))
            Hmat=cv2.getPerspectiveTransform(
                pixels,points.reshape(-1,2).astype(np.float32))
            frame=cv2.warpPerspective(texture,Hmat,(W,H),borderValue=127)
            name=f"board-{i:02d}-{side}.png"
            if not cv2.imwrite(str(directory/name),frame):
                raise RuntimeError("cannot_write_synthetic_board")
            names[side]=name
        pairs.append(names)
    manifest={
       "schema":"evercraft.spatial-perception.stereo-calibration-input.v1",
       "sourceRights":"authorized_local_use",
       "rigId":"SYNTHETIC-CI-ONLY-NO-PHYSICAL-RIG",
       "checkerboard":{"columns":9,"rows":6,"squareSizeM":SQUARE},
       "pairs":pairs
    }
    path=directory/"calibration-input.json"
    path.write_text(json.dumps(manifest))
    return path


def synthetic_unrectified_video(path):
    """Stereo pair frames with known raw horizontal pixel shift."""
    writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*"MJPG"),
                           5.0,(W*2,H))
    if not writer.isOpened():
        raise RuntimeError("cannot_write_synthetic_video")
    try:
        for i in range(4):
            rng=np.random.default_rng(2000+i)
            left=rng.integers(20,235,size=(H,W),dtype=np.uint8)
            right=np.zeros_like(left)
            right[:,:W-8]=left[:,8:]
            pair=cv2.cvtColor(np.concatenate([left,right],axis=1),
                               cv2.COLOR_GRAY2BGR)
            writer.write(pair)
    finally:
        writer.release()
    return path


def call(*args):
    return subprocess.run([sys.executable,*map(str,args)],text=True,
                          capture_output=True,timeout=100,check=False)


class StereoFieldKitEndToEnd(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory(prefix="evercraft-v8-fixture-")
        root=Path(self.folder.name)
        self.root=root
        self.manifest=generate_board_images(root)
        self.source=synthetic_unrectified_video(root/"sbs-unrectified.avi")
        self.calibration=root/"stereo-calibration.json"
        self.rectified=root/"sbs-rectified.avi"
        self.receipt=root/"rectified-receipt.json"

    def tearDown(self):
        self.folder.cleanup()

    def calibrate(self):
        return call(KIT,"calibrate","--manifest",self.manifest,
                    "--authorized-source","--output",self.calibration)

    def rectify(self):
        return call(KIT,"rectify","--calibration",self.calibration,
                    "--video",self.source,"--output-video",self.rectified,
                    "--receipt",self.receipt,"--max-frames","4",
                    "--authorized-source","--reviewed-calibration")

    def test_actual_checkerboard_calibration_and_video_rectification(self):
        result=self.calibrate()
        self.assertEqual(result.returncode,0,result.stderr)
        data=json.loads(self.calibration.read_text())
        self.assertEqual(data["schema"],
           "evercraft.spatial-perception.stereo-calibration.v1")
        self.assertGreaterEqual(data["pairsDetected"],10)
        self.assertLess(data["imageReprojectionRmsPx"]["stereo"],1.5)
        self.assertAlmostEqual(data["baselineM"],BASELINE,delta=.025)
        self.assertFalse(data["realWorldAccuracyCertified"])
        self.assertFalse(data["timestampSyncVerified"])
        self.assertEqual(self.calibration.stat().st_mode & 0o777,0o600)

        rect=self.rectify()
        self.assertEqual(rect.returncode,0,rect.stderr)
        receipt=json.loads(self.receipt.read_text())
        self.assertEqual(receipt["framesWritten"],4)
        self.assertEqual(receipt["sourceVideoSha256"],
            hashlib.sha256(self.source.read_bytes()).hexdigest())
        self.assertEqual(receipt["rectifiedVideoSha256"],
            hashlib.sha256(self.rectified.read_bytes()).hexdigest())
        self.assertEqual(receipt["calibrationFileSha256"],
            hashlib.sha256(self.calibration.read_bytes()).hexdigest())
        self.assertFalse(receipt["fieldAccuracyCertified"])
        cap=cv2.VideoCapture(str(self.rectified))
        observed=0
        while True:
            ok,frame=cap.read()
            if not ok:break
            self.assertEqual(frame.shape[:2],(H,W*2))
            observed+=1
        cap.release()
        self.assertEqual(observed,4)
        self.assertEqual(self.rectified.stat().st_mode & 0o777,0o600)

        # Verify the rectified derivative can go through the EXISTING V3
        # model bridge; this is a constant proposal, not learned detection.
        model=self.root/"constant-output.onnx"
        synthetic_model(model)
        import_manifest=self.root/"model-manifest.json"
        import_manifest.write_text(json.dumps({
            "format":"yolov8_onnx_no_nms","inputSize":160,
            "labels":["synthetic_proposal"],
            "sha256":hashlib.sha256(model.read_bytes()).hexdigest(),
            "rights":"authorized_local_use"
        }))
        derived=self.root/"observations.json"
        detect=call(IMPORTER,"--video",self.rectified,
            "--model",model,"--manifest",import_manifest,
            "--fx-px",receipt["fxPx"],"--baseline-m",receipt["baselineM"],
            "--max-frames","4","--frame-step","1",
            "--authorized-source","--rectified-stereo",
            "--output",derived)
        self.assertEqual(detect.returncode,0,detect.stderr)
        observations=json.loads(derived.read_text())
        self.assertEqual(len(observations["frames"]),4)
        self.assertEqual(observations["sourceSha256"],
            receipt["rectifiedVideoSha256"])
        self.assertFalse(observations["frames"][0]["observations"][0]["safetyCriticalApproved"])

    def test_rights_and_calibration_review_required(self):
        result=call(KIT,"calibrate","--manifest",self.manifest,
                    "--output",self.calibration)
        self.assertNotEqual(result.returncode,0)
        self.assertIn("source_authorization_required",result.stderr)
        self.assertFalse(self.calibration.exists())
        self.assertEqual(self.calibrate().returncode,0)
        bad=call(KIT,"rectify","--calibration",self.calibration,
            "--video",self.source,"--output-video",self.rectified,
            "--receipt",self.receipt,"--authorized-source")
        self.assertNotEqual(bad.returncode,0)
        self.assertIn("explicit_source_and_calibration_review_required",bad.stderr)
        self.assertFalse(self.rectified.exists())

    def test_wrong_video_size_rejected_without_receipt(self):
        self.assertEqual(self.calibrate().returncode,0)
        small=self.root/"wrong-size.avi"
        writer=cv2.VideoWriter(str(small),cv2.VideoWriter_fourcc(*"MJPG"),
            5.0,(512,128))
        self.assertTrue(writer.isOpened())
        writer.write(np.full((128,512,3),127,np.uint8))
        writer.release()
        bad=call(KIT,"rectify","--calibration",self.calibration,
            "--video",small,"--output-video",self.rectified,
            "--receipt",self.receipt,"--authorized-source",
            "--reviewed-calibration")
        self.assertNotEqual(bad.returncode,0)
        self.assertIn("source_pair_dimensions_do_not_match_calibration",bad.stderr)
        self.assertFalse(self.receipt.exists())
        self.assertFalse(self.rectified.exists())


if __name__=="__main__":
    unittest.main()
