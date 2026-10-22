#!/usr/bin/env python3
"""Photon Forge V4: actual triangles, canonical World Engine-shaped frames, CPU fallback.

Art preview only. It is NOT WebGPU hardware rendering nor a running World Engine.
"""
import argparse
import hashlib
import json
import math
import subprocess
import time
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from worldframe import sha, validate_frame, torus, box_geometry, coordinates, camera_project

W,H=960,540
FPS=30
DURATION=10
OUT=Path(__file__).resolve().parent
GEOMETRIES=[torus('armor-spine',4.2,.22,24,3),torus('ceramic-fiber',3.52,.08,30,3),torus('drive-channel',2.36,.11,30,3),box_geometry('machined-vane')]
GEOM={g['id']:g for g in GEOMETRIES}
PALETTE=[
 ('graphite',(0.13,0.19,0.27),.87,.23,(0,0,0),0),
 ('titanium',(0.35,0.44,0.58),.94,.19,(0,0,0),0),
 ('cyan',(0.04,0.54,1),.2,.13,(0.05,.85,1),3.5),
 ('violet',(0.5,0.22,1),.2,.13,(.76,.2,1),3.1),
 ('hot',(1,.7,.26),.1,.18,(1,.44,.07),2.5),
]
MATERIALS=[dict(id=n,model='pbr',baseColor=dict(r=r,g=g,b=b,a=1),metallic=metal,roughness=rough,emissive=dict(r=em[0],g=em[1],b=em[2]),emissiveIntensity=inten) for n,(r,g,b),metal,rough,em,inten in PALETTE]
MBY={m['id']:m for m in MATERIALS}

def smooth(x):
 x=max(0,min(1,x));return x*x*(3-2*x)

def vec(x=0,y=0,z=0):return dict(x=x,y=y,z=z)

def tr(x,y,z,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1):
 return dict(position=vec(x,y,z),rotationDeg=vec(rx,ry,rz),scale=vec(sx,sy,sz))

def look(cam,target):
 dx,dy,dz=np.array(target)-np.array(cam)
 yaw=-math.degrees(math.atan2(dx,-dz))
 pitch=math.degrees(math.atan2(dy,math.hypot(dx,dz)))
 return vec(pitch,yaw,0)

def add(rows,id,g,m,T):
 rows.append(dict(entityId=id,transform=T,component=dict(geometryRef=g,materialId=m,visible=True,castsShadow=True,receivesShadow=True,layerMask=1)))

def fixture_frame(t):
 t=max(0,min(9.999999,t))
 k=smooth(t/7)
 cx=8.0-4.5*k+0.30*math.sin(t*.66)
 cy=4.5-2.9*k
 cz=14.5-13.0*k
 target=(-.8+.8*k,.0,-14.0-3*k)
 camera=dict(cameraId='photon-cam',projection=dict(type='perspective',fovYDeg=62-14*k),near=.08,far=130,exposure=1.1,layerMask=1,transform=tr(cx,cy,cz,**{}),blend=None)
 camera['transform']['rotationDeg']=look((cx,cy,cz),target)
 rows=[]
 for i in range(7):
    z=-2.1-4.45*i
    pulse=.20*math.sin(t*3.8-i*1.7)
    angle=(1 if i%2 else -1)*(t*12.5+i*18)
    tilt=8*math.sin(t*.37+i*.8)
    add(rows,f'gate-{i}-armor','armor-spine','titanium' if i%2 else 'graphite',tr(0,0,z,0,tilt,angle))
    add(rows,f'gate-{i}-cyan','ceramic-fiber','cyan' if i%2 else 'violet',tr(0,0,z+.22,0,tilt,angle*1.13,sx=1+pulse*.03,sy=1+pulse*.03))
    if i%2==0:add(rows,f'gate-{i}-inner','drive-channel','hot' if i==4 else 'cyan',tr(0,0,z-.18,5,tilt,-angle*.66))
    for j in range(8):
        a=2*math.pi*j/8+(i%2)*.15
        radius=4.7
        add(rows,f'gate-{i}-strut-{j}','machined-vane','graphite' if j%3 else 'titanium',tr(radius*math.cos(a),radius*math.sin(a),z,0,0,math.degrees(a),sx=.22,sy=.58,sz=.54))
 # a nested reactor and a looming enclosure
 for j in range(12):
    a=j*math.tau/12
    radius=6.1
    add(rows,f'longitudinal-rail-{j}','machined-vane','graphite',tr(radius*math.cos(a),radius*math.sin(a),-14.0,0,0,math.degrees(a),sx=.12,sy=.28,sz=17))
 tick=int(round(t*60))
 core=dict(schema='evercraft.world-engine.visual-frame.v1',worldId='photon-forge-v4-fixture',tick=tick,timeSec=round(t,8),camera=camera,clearColor=dict(r=.003,g=.006,b=.013),materials=MATERIALS,renderables=sorted(rows,key=lambda r:r['entityId']),lights=[
  dict(entityId='amb',transform=tr(0,0,0),component=dict(type='ambient',color=dict(r=.34,g=.58,b=1),intensity=.24,layerMask=1)),
  dict(entityId='key',transform=tr(3,7,4),component=dict(type='point',color=dict(r=.2,g=.79,b=1),intensity=12,range=45,layerMask=1)),
  dict(entityId='rim',transform=tr(-4,-1,-12),component=dict(type='point',color=dict(r=.65,g=.22,b=1),intensity=10,range=40,layerMask=1))
 ])
 return dict(**core,digest=sha(core))

MESH_CACHE={}
for g in GEOMETRIES:
 MESH_CACHE[g['id']]=(np.asarray(g['positions'],dtype=np.float64).reshape((-1,3)),np.asarray(g['indices'],dtype=np.int32).reshape((-1,3)))

Y,X=np.mgrid[:H,:W]
BG=np.zeros((H,W,3),np.float32)
r2=((X-W*.54)/(W*.85))**2+((Y-H*.52)/(H*.9))**2
BG[:]=np.array([19,10,4],dtype=np.float32)
BG+=np.exp(-r2*3.6)[...,None]*np.array([21,11,4],dtype=np.float32)
RNG=np.random.default_rng(20261021)
STARS=[(int(x),int(y),int(r)) for x,y,r in zip(RNG.integers(0,W,240),RNG.integers(0,H,240),RNG.choice([1,1,1,2],240))]


def line_glow(layer,a,b,color,thick=2):
 p1=tuple(np.round(a).astype(int));p2=tuple(np.round(b).astype(int))
 cv2.line(layer,p1,p2,color,thick,cv2.LINE_AA)


def render_frame(frame,width=W,height=H,geometries=None):
 if width!=W or height!=H:raise ValueError('v4_fixed_canvas_size')
 geometries=GEOMETRIES if geometries is None else geometries
 validate_frame(frame,geometries)
 mesh_cache={g['id']:(np.asarray(g['positions'],dtype=np.float64).reshape((-1,3)),np.asarray(g.get('indices') or list(range(len(g['positions'])//3)),dtype=np.int32).reshape((-1,3))) for g in geometries}
 material_lookup={m['id']:m for m in frame['materials']}
 is_fixture=frame['worldId']=='photon-forge-v4-fixture'
 t=frame['timeSec']
 img=BG.copy().astype(np.uint8)
 neon=np.zeros_like(img)
 for x,y,r in STARS:
  b=0.26+.5*(.5+.5*math.sin(t*.3+x*.13+y*.2))
  cv2.circle(img,(x,y),r,(int(30*b),int(65*b),int(90*b)),-1,cv2.LINE_AA)
 cam=frame['camera']
 draw=[]
 visible=[]
 for row in frame['renderables']:
  g=row['component']['geometryRef']
  verts,indices=mesh_cache[g]
  world=coordinates(row['transform'],verts)
  projected,depth=camera_project(world,cam,W,H)
  if not np.any((depth>cam['near'])&(depth<cam['far'])):continue
  m=material_lookup[row['component']['materialId']]
  color=np.array([m['baseColor'][q] for q in ('b','g','r')],dtype=float)
  emissive=m.get('emissiveIntensity',0)>1
  for tri in indices:
   d=depth[tri];xy=projected[tri]
   if min(d)<cam['near'] or max(d)>cam['far']:continue
   if np.any(~np.isfinite(xy)) or np.all(xy[:,0]<-30) or np.all(xy[:,0]>W+30) or np.all(xy[:,1]<-30) or np.all(xy[:,1]>H+30):continue
   # true world-space geometric normals, per-face lighting
   p=world[tri]
   n=np.cross(p[1]-p[0],p[2]-p[0]);length=np.linalg.norm(n)
   if length<1e-9:continue
   n/=length
   light=np.array([-.37,.7,.61]);light/=np.linalg.norm(light)
   shade=.19+.71*abs(np.dot(n,light))
   zdist=np.mean(d)
   fog=max(.18,math.exp(-zdist/72))
   bgr=tuple(int(np.clip(c*(shade if not emissive else 1.5)*fog*255,0,255)) for c in color)
   if emissive:
    e=m['emissive'];bgr=(int(255*e['b']),int(255*e['g']),int(255*e['r']))
   draw.append((zdist,xy,bgr,emissive))
 for _,poly,col,em in sorted(draw,key=lambda r:-r[0]):
  pts=np.clip(np.round(poly),-5000,5000).astype(np.int32)
  cv2.fillConvexPoly(img,pts,col,cv2.LINE_AA)
  if em and pts[:,0].min()<W and pts[:,0].max()>0:
   cv2.polylines(neon,[pts],True,col,1,cv2.LINE_AA)
 # Emitters and beam trajectories as three-dimensional light events
 if is_fixture and t<8.75:
  growth=smooth((t-1.15)/3.5)
  ramp=smooth((t-4.7)/2.3)
  for i in range(7):
   z=-2.1-4.45*i
   pts=[]
   for k in range(16):
    a=math.tau*k/16+.10*i+.21*t
    pts.append([3.55*math.cos(a),3.55*math.sin(a),z+.24])
   proj,depth=camera_project(np.array(pts),cam,W,H)
   if np.any(depth<cam['near']):continue
   for j in range(16):
    if j%2==0:
     a=proj[j];b=proj[(j+1)%16]
     c=(255,190,35) if (j+i)%4 else (235,70,190)
     line_glow(neon,a,b,c,2)
     if growth>.1 and (i+j)%3==0:
      target=np.array([[0,0,z-1.8]],dtype=float)
      core,_=camera_project(target,cam,W,H)
      q=growth*(.25+.75*ramp)
      line_glow(neon,a,a+(core[0]-a)*q,c,1)
  # kinetic discontinuous electric filaments across the foreground
  if t>5.2:
   fac=smooth((t-5.2)/1.4)*(1-smooth((t-8.1)/.7))
   for k in range(8):
    a=k*math.tau/8+t*.38
    pts=[]
    for j in range(9):
     q=j/8
     noise=math.sin(k*13+j*8+t*14)*.11
     pts.append([ (4.1*(1-q)+noise)*math.cos(a+q*.24), (4.1*(1-q)+noise)*math.sin(a+q*.24), -8.5-3*q])
    p,d=camera_project(np.array(pts),cam,W,H)
    if min(d)>cam['near']:
     for u,v in zip(p[:-1],p[1:]):line_glow(neon,u,v,(255,110,65) if k%2 else (240,65,186),max(1,int(2*fac)))
 # air haze, physically unverified atmospheric compositing
 light=cv2.GaussianBlur(neon,(0,0),2.5)
 bloom=cv2.GaussianBlur(neon,(0,0),18)
 img=np.clip(img.astype(np.float32)+light*.46+bloom*.70+neon*.88,0,255).astype(np.uint8)
 if is_fixture and 6.25<t<8.3:
  u=(t-6.25)/2.05
  rad=int(25+u*620)
  ctr=np.array([[0,0,-13]],float)
  xy,_=camera_project(ctr,cam,W,H)
  o=np.zeros_like(img)
  cv2.circle(o,tuple(xy[0].astype(int)),rad,(235,179,100),2,cv2.LINE_AA)
  cv2.circle(o,tuple(xy[0].astype(int)),rad//2,(255,222,178),1,cv2.LINE_AA)
  img=cv2.addWeighted(img,1,o,1,0)
 if is_fixture and 7.45<t<8.0:
  flash=math.sin(math.pi*(t-7.45)/.55)**4
  img=np.clip(img+flash*160,0,255).astype(np.uint8)
 fade=smooth((t-8.15)/.8)
 if is_fixture and fade>0:
  img=(img.astype(np.float32)*(1-.88*fade)).astype(np.uint8)
  # Fade into cleaner typography, not a generic powerpoint card
  rgba=Image.fromarray(cv2.cvtColor(img,cv2.COLOR_BGR2RGB),'RGB').convert('RGBA')
  overlay=Image.new('RGBA',rgba.size,(0,0,0,0));pen=ImageDraw.Draw(overlay)
  font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
  f=ImageFont.truetype(font,67);sm=ImageFont.truetype(font,13)
  text='E V E R C R A F T'; bbox=pen.textbbox((0,0),text,font=f)
  left=(W-(bbox[2]-bbox[0]))//2
  alpha=int(245*fade)
  pen.text((left,H//2-54),text,font=f,fill=(235,246,255,alpha))
  tagline='BUILD WHAT DOES NOT EXIST. YET.'
  b=pen.textbbox((0,0),tagline,font=sm)
  pen.text(((W-(b[2]-b[0]))//2,H//2+57),tagline,font=sm,fill=(127,206,252,int(150*fade)))
  rgba=Image.alpha_composite(rgba,overlay).convert('RGB')
  img=cv2.cvtColor(np.array(rgba),cv2.COLOR_RGB2BGR)
 # subtle horizontal anamorphic artifact across optical source
 img=np.ascontiguousarray(img)
 return img



def encode_external_sequence(manifest_path, geometry_path, output_path, fps):
 """Encode supplied, hash-verified canonical-shaped WorldFrame packets with the OWNED Photon Forge V4 rasterizer.

 A manifest is not evidence that the live World Engine executed. Nothing is sent to a model or external provider.
 """
 if fps not in (24,30,60):raise ValueError('sequence_fps_unsupported')
 manifest_file=Path(manifest_path).resolve()
 manifest_bytes=manifest_file.read_bytes()
 if len(manifest_bytes)>262144:raise ValueError('sequence_manifest_too_large')
 manifest=json.loads(manifest_bytes)
 if manifest.get('schema')!='evercraft.photon-forge-v4.frame-sequence.v1':raise ValueError('sequence_schema_invalid')
 if type(manifest.get('fps'))!=int or manifest['fps']!=fps:raise ValueError('sequence_fps_mismatch')
 names=manifest.get('framePaths')
 if not isinstance(names,list) or not 2<=len(names)<=900:raise ValueError('sequence_frame_count_invalid')
 if any(not isinstance(s,str) or not s for s in names) or len(set(names))!=len(names):
  raise ValueError('sequence_paths_invalid')
 geometry_file=Path(geometry_path)
 geometry_bytes=geometry_file.read_bytes()
 if len(geometry_bytes)>8388608:raise ValueError('sequence_geometry_too_large')
 geometries=json.loads(geometry_bytes)
 if not isinstance(geometries,list) or not geometries:raise ValueError('sequence_geometry_invalid')
 root=manifest_file.parent
 records=[]
 world_id=None
 first_time=None
 last_tick=-1
 for i,name in enumerate(names):
  relative=Path(name)
  if relative.is_absolute() or '..' in relative.parts or relative.suffix!='.json' or name.startswith('.'):
   raise ValueError('sequence_path_unsafe')
  frame_path=(root/relative).resolve()
  if root not in frame_path.parents or frame_path.is_symlink() or not frame_path.is_file():
   raise ValueError('sequence_path_unsafe_or_missing')
  raw=frame_path.read_bytes()
  if len(raw)>4194304:raise ValueError('sequence_frame_too_large')
  frame=json.loads(raw)
  validate_frame(frame,geometries)
  if world_id is None:
   world_id=frame['worldId']
   first_time=frame['timeSec']
  if frame['worldId']!=world_id:raise ValueError('sequence_world_changed')
  if frame['tick']<=last_tick:raise ValueError('sequence_ticks_not_increasing')
  if abs(frame['timeSec']-(first_time+i/fps))>0.0001:raise ValueError('sequence_frame_time_mismatch')
  last_tick=frame['tick']
  records.append(dict(path=str(frame_path),sourceSha256=hashlib.sha256(raw).hexdigest(),
                      digest=frame['digest'],tick=frame['tick'],timeSec=frame['timeSec']))
 output=Path(output_path)
 if output.suffix.lower()!='.mp4':raise ValueError('sequence_output_must_be_mp4')
 output.parent.mkdir(parents=True,exist_ok=True)
 cmd=['ffmpeg','-loglevel','error','-y','-f','rawvideo','-vcodec','rawvideo',
      '-s',f'{W}x{H}','-pix_fmt','bgr24','-r',str(fps),'-i','-','-an',
      '-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',
      '-movflags','+faststart',str(output)]
 proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
 samples={}
 try:
  for i,record in enumerate(records):
   raw=Path(record['path']).read_bytes()
   if hashlib.sha256(raw).hexdigest()!=record['sourceSha256']:
    raise ValueError('sequence_frame_changed_during_render')
   pixels=render_frame(json.loads(raw),geometries=geometries)
   if i in {0,len(records)//2,len(records)-1}:
    samples[str(i)]=dict(frameDigest=record['digest'],frameTick=record['tick'],
                         pixelsSha256=hashlib.sha256(pixels.tobytes()).hexdigest())
   proc.stdin.write(pixels.tobytes())
  proc.stdin.close()
  exit_code=proc.wait()
 except BaseException:
  proc.kill()
  try:proc.stdin.close()
  except Exception:pass
  proc.wait()
  output.unlink(missing_ok=True)
  raise
 if exit_code:
  output.unlink(missing_ok=True)
  raise RuntimeError('sequence_ffmpeg_encode_failed')
 try:
  probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames',
   '-show_entries','stream=codec_type,codec_name,nb_read_frames,width,height',
   '-show_entries','format=duration','-of','json',str(output)]))
  videos=[s for s in probe['streams'] if s.get('codec_type')=='video']
  if len(videos)!=1 or len(probe['streams'])!=1 or videos[0].get('codec_name')!='h264' or int(videos[0]['nb_read_frames'])!=len(records):
   raise RuntimeError('sequence_encoded_frame_count_invalid')
 except BaseException:
  output.unlink(missing_ok=True)
  raise
 receipt=dict(schema='evercraft.photon-forge-v4.external-sequence-receipt.v1',
  status='external_canonical_shaped_frames_encoded_not_mastered',
  manifestSha256=hashlib.sha256(manifest_bytes).hexdigest(),
  geometrySha256=hashlib.sha256(geometry_bytes).hexdigest(),
  worldId=world_id,firstFrameDigest=records[0]['digest'],
  lastFrameDigest=records[-1]['digest'],firstTick=records[0]['tick'],lastTick=records[-1]['tick'],
  frameSourceSha256=[r['sourceSha256'] for r in records],
  width=W,height=H,fps=fps,frameCount=len(records),durationSec=len(records)/fps,
  outputSha256=hashlib.sha256(output.read_bytes()).hexdigest(),sampleFrames=samples,
  renderedBy='Evercraft Photon Forge V4 CPU triangle renderer',
  externalCanonicalShapedFramesRendered=True,originRuntimeUnverified=True,
  worldEngineRuntimeExecuted=False,webgpuHardwareVerified=False,
  voiceOrScoreIncluded=False,masterQcApproved=False,publicationAuthority=False)
 output.with_suffix('.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps(receipt,indent=2))
 return receipt

def main():
 p=argparse.ArgumentParser();p.add_argument('--output',default=str(OUT/'Evercraft_Photon_Forge_V4_SILENT.mp4'))
 p.add_argument('--preview',type=float);p.add_argument('--fps',type=int,default=FPS)
 p.add_argument('--frame-json');p.add_argument('--geometry-json');p.add_argument('--sequence-manifest');a=p.parse_args()
 if a.sequence_manifest:
  if not a.geometry_json or a.frame_json or a.preview is not None:raise ValueError('sequence_requires_geometry_only')
  encode_external_sequence(a.sequence_manifest,a.geometry_json,a.output,a.fps)
  return
 if a.frame_json:
  if not a.geometry_json:raise ValueError('geometry_json_required')
  f=json.loads(Path(a.frame_json).read_text());gs=json.loads(Path(a.geometry_json).read_text())
  validate_frame(f,gs)
  img=render_frame(f,geometries=gs)
  output=Path(a.output).with_suffix('.png'); output.parent.mkdir(parents=True,exist_ok=True)
  cv2.imwrite(str(output),img)
  rec=dict(schema='evercraft.photon-forge-v4.external-frame-canary.v1',frameDigest=f['digest'],frameTick=f['tick'],worldId=f['worldId'],geometryDigests={g['id']:sha(g) for g in gs},imageSha256=hashlib.sha256(output.read_bytes()).hexdigest(),renderBackend='CPU_triangle_depth_sorting',worldEngineRuntimeExecuted=False,webgpuHardwareVerified=False,publicationAuthority=False)
  output.with_suffix('.receipt.json').write_text(json.dumps(rec,indent=2)+'\n')
  print(json.dumps(rec,indent=2));return
 if a.preview is not None:
  t=a.preview;img=render_frame(fixture_frame(t))
  loc=OUT/f'v4_preview_{t:04.1f}.jpg';cv2.imwrite(str(loc),img,[cv2.IMWRITE_JPEG_QUALITY,92]);print(loc);return
 if a.fps not in (24,30,60):raise ValueError('fps_required_24_30_60')
 output=Path(a.output);output.parent.mkdir(parents=True,exist_ok=True)
 cmd=['ffmpeg','-loglevel','error','-y','-f','rawvideo','-vcodec','rawvideo','-s',f'{W}x{H}','-pix_fmt','bgr24','-r',str(a.fps),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(output)]
 proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
 starts=time.monotonic();samples={}
 try:
  for k in range(DURATION*a.fps):
   t=k/a.fps;frame=fixture_frame(t)
   arr=render_frame(frame)
   if k in [0,60,120,180,240,299]:samples[str(k)]={'timeSec':t,'frameDigest':frame['digest'],'pixelsSha256':hashlib.sha256(arr.tobytes()).hexdigest()}
   proc.stdin.write(arr.tobytes())
 finally:
  proc.stdin.close()
  code=proc.wait()
 if code:raise RuntimeError(f'ffmpeg_{code}')
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_entries','stream=codec_type,codec_name,nb_read_frames,width,height','-show_entries','format=duration','-of','json',str(output)]))
 v=probe['streams']
 if len(v)!=1 or v[0]['codec_type']!='video' or v[0]['codec_name']!='h264' or int(v[0]['nb_read_frames'])!=DURATION*a.fps:raise RuntimeError('invalid_encoded_output')
 evidence=dict(schema='evercraft.photon-forge-v4.frame-bridge-canary.v1',status='encoded_audition_not_mastered',width=W,height=H,durationSec=DURATION,fps=a.fps,frames=DURATION*a.fps,encodedSha256=hashlib.sha256(output.read_bytes()).hexdigest(),elapsedSeconds=round(time.monotonic()-starts,2),sampleFrames=samples,backend='CPU_perspective_triangle_raster_depth_sorting',frameSchema='evercraft.world-engine.visual-frame.v1',geometrySchema='evercraft.world-engine.geometry.v1',worldEngineRuntimeExecuted=False,webgpuHardwareVerified=False,actualWorldEngineFrameIngested=False,productionQualityApproved=False,audioIncluded=False,publicationAuthority=False)
 output.with_suffix('.receipt.json').write_text(json.dumps(evidence,indent=2)+'\n')
 print(json.dumps(evidence,indent=2))

if __name__=='__main__':main()
