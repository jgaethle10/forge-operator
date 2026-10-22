import copy
import json
import subprocess
import unittest
from pathlib import Path
import numpy as np
from render import fixture_frame, render_frame, GEOMETRIES
from worldframe import sha, validate_frame, validate_geometry, torus

class BridgeTests(unittest.TestCase):
 def test_frame_and_real_geometry_contract(self):
  f=fixture_frame(3.2)
  self.assertTrue(validate_frame(f,GEOMETRIES))
  for g in GEOMETRIES:self.assertTrue(validate_geometry(g))
  self.assertGreater(len(f['renderables']),65)
  self.assertEqual(f['schema'],'evercraft.world-engine.visual-frame.v1')
  self.assertEqual(GEOMETRIES[0]['schema'],'evercraft.world-engine.geometry.v1')
 def test_tampering_and_missing_geometry_rejected(self):
  f=fixture_frame(1.2)
  f['camera']['projection']['fovYDeg']=23
  with self.assertRaisesRegex(ValueError,'digest_mismatch'):validate_frame(f,GEOMETRIES)
  f=fixture_frame(1.2)
  with self.assertRaisesRegex(ValueError,'geometry_missing'):validate_frame(f,[])
  g=copy.deepcopy(GEOMETRIES[0]);g['indices'][0]=999999
  with self.assertRaisesRegex(ValueError,'geometry_indices'):validate_geometry(g)
 def test_exact_frame_repeatable_and_temporal_change(self):
  a=render_frame(fixture_frame(2.1));b=render_frame(fixture_frame(2.1));c=render_frame(fixture_frame(5.0))
  self.assertTrue(np.array_equal(a,b))
  self.assertGreater(float(np.mean(np.abs(a.astype(np.int16)-c.astype(np.int16)))),8)
 def test_actual_js_hash_canonical_parity(self):
  f=fixture_frame(1.2)
  path=Path(__file__).with_name('test-temporary-fixture.json');path.write_text(json.dumps(f))
  try:
   js="""const fs=require('fs'),crypto=require('crypto');const f=JSON.parse(fs.readFileSync(process.argv[1]));const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>[k,stable(v)])):x;const {digest,...core}=f;console.log(digest===crypto.createHash('sha256').update(JSON.stringify(stable(core))).digest('hex')?'pass':'fail');"""
   got=subprocess.check_output(['node','-e',js,str(path)],text=True).strip()
   self.assertEqual(got,'pass')
  finally:path.unlink(missing_ok=True)
 def test_external_frame_ingest_render_and_receipt(self):
  import cv2,hashlib,tempfile
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);f=fixture_frame(1.2)
   (p/'frame.json').write_text(json.dumps(f))
   (p/'geo.json').write_text(json.dumps(GEOMETRIES))
   subprocess.run(['python',str(Path(__file__).with_name('render.py')),'--frame-json',str(p/'frame.json'),'--geometry-json',str(p/'geo.json'),'--output',str(p/'external.mp4')],capture_output=True,check=True)
   img=p/'external.png';self.assertTrue(img.exists())
   receipt=json.loads((p/'external.receipt.json').read_text())
   self.assertEqual(receipt['imageSha256'],hashlib.sha256(img.read_bytes()).hexdigest())
   self.assertEqual(receipt['frameDigest'],f['digest'])
   self.assertFalse(receipt['worldEngineRuntimeExecuted'])
   self.assertFalse(receipt['webgpuHardwareVerified'])
   self.assertFalse(receipt['publicationAuthority'])

if __name__=='__main__':unittest.main()
