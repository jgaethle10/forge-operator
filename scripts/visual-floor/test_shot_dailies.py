import importlib.util
import json
import hashlib
import subprocess
import tempfile
import unittest
from pathlib import Path
import cv2
import numpy as np

spec=importlib.util.spec_from_file_location('shot_dailies',str(Path(__file__).with_name('shot-dailies.py')))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class DailiesTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.temp=tempfile.TemporaryDirectory()
  cls.root=Path(cls.temp.name)
  # Render 90 independent synthetic frames, each segment materially different.
  raw=cls.root/'raw.avi'
  writer=cv2.VideoWriter(str(raw),cv2.VideoWriter_fourcc(*'MJPG'),30,(320,180))
  if not writer.isOpened():raise RuntimeError('missing AVI encoder')
  for i in range(90):
   frame=np.zeros((180,320,3),dtype=np.uint8)
   hue=(i//30)*45
   frame[:]=[20+hue,30+(i*2)%120,55+(i//30)*60]
   cv2.circle(frame,(30+i*2,80),12+(i//30)*8,(200,120,230),-1)
   writer.write(frame)
  writer.release()
  cls.mp4=cls.root/'test.mp4'
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw),'-c:v','libx264','-pix_fmt','yuv420p',str(cls.mp4)],check=True)
  cls.base={'schema':m.JOBPACK_SCHEMA,'campaignId':'test-001','fps':30,'frameCount':90,'resolution':{'width':320,'height':180},
   'shots':[{'id':f'shot-{i}','startFrame':i*30,'frameCount':30} for i in range(3)],
   'visualFloor':{'publicationAuthority':False,'workOrder':{'schema':m.ORDER_SCHEMA,'assetId':'test-001','publicationAuthority':False,
    'digest':'test-source-id','beats':[{'id':f'shot-{i}','intent':f'Explain panel {i}','visualProof':'display approved art'} for i in range(3)]}}}
  core=cls.base['visualFloor']['workOrder']
  core.pop('digest')
  core['digest']=hashlib.sha256(json.dumps(core,separators=(',',':')).encode()).hexdigest()
  cls.pack=cls.root/'jobpack.json';cls.pack.write_text(json.dumps(cls.base))
 @classmethod
 def tearDownClass(cls):cls.temp.cleanup()
 def test_real_decoded_shot_board_and_hash(self):
  out=self.root/'out1';res=m.audit(self.mp4,self.pack,out,max_tile_width=300)
  self.assertEqual(len(res['shots']),3)
  self.assertEqual(res['video']['frameCount'],90)
  self.assertEqual(res['shots'][0]['frames'][0]['frame'],4)
  self.assertFalse(res['publicationAuthority'])
  self.assertTrue((out/'shot-dailies.jpg').is_file())
  self.assertTrue(all(len(s['frames'])==3 for s in res['shots']))
 def test_stable_framed_digest(self):
  a=m.audit(self.mp4,self.pack,self.root/'repeat1',max_tile_width=300)
  b=m.audit(self.mp4,self.pack,self.root/'repeat2',max_tile_width=300)
  self.assertEqual(a['digest'],b['digest'])
 def reject(self,update,expected,rehash=False):
  bad=json.loads(json.dumps(self.base));update(bad)
  if rehash:
   order=bad['visualFloor']['workOrder']
   order['digest']=hashlib.sha256(json.dumps({k:v for k,v in order.items() if k!='digest'},separators=(',',':')).encode()).hexdigest()
  p=self.root/'bad.json';p.write_text(json.dumps(bad))
  with self.assertRaisesRegex(ValueError,expected):m.audit(self.mp4,p,self.root/'bad_out')
 def test_overlap_blocked(self):self.reject(lambda a:a['shots'][1].update(startFrame=29),'gap_overlap')
 def test_missing_coverage_blocked(self):self.reject(lambda a:a['shots'][-1].update(frameCount=29),'incomplete_video_coverage')
 def test_mismatched_workorder_blocked(self):self.reject(lambda a:a['visualFloor']['workOrder']['beats'][0].update(id='other'),'shot_work_order_identity_mismatch',rehash=True)
 def test_tampered_work_order_digest_blocked(self):self.reject(lambda a:a['visualFloor']['workOrder']['beats'][0].update(intent='fabricated content'),'work_order_digest_mismatch')
 def test_fps_mismatch_blocked(self):self.reject(lambda a:a.update(fps=24),'jobpack_video_format_mismatch')
 def test_publishing_authority_blocked(self):self.reject(lambda a:a['visualFloor'].update(publicationAuthority=True),'publication_authority_unsafe')
 def test_real_media_mutation_changes_media_digest(self):
  p=self.root/'other.mp4'
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(self.mp4),'-vf','eq=brightness=0.1','-c:v','libx264',str(p)],check=True)
  a=m.audit(self.mp4,self.pack,self.root/'original',max_tile_width=300)
  b=m.audit(p,self.pack,self.root/'mutated',max_tile_width=300)
  self.assertNotEqual(a['input']['mediaSha256'],b['input']['mediaSha256'])
  self.assertNotEqual(a['digest'],b['digest'])

if __name__=='__main__': unittest.main()
