#!/usr/bin/env python3
"""Evercraft Photon Forge V3: original, deterministic CPU cinematic preview.
Software-only procedural 3D projection; no claim of GPU or World Engine integration.
"""
from __future__ import annotations
import argparse, cv2, numpy as np, math, os, json, hashlib, subprocess, time
from PIL import Image,ImageDraw,ImageFont,ImageFilter
from pathlib import Path

W,H=960,540
FPS=30
DURATION=10
TAU=2*math.pi
OUT=Path(os.environ.get('EVERCRAFT_PHOTON_OUT', str(Path(__file__).resolve().parent / 'renders')))
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONT_BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

rng=np.random.default_rng(2601)
STARS=np.column_stack((rng.uniform(-13,13,220),rng.uniform(-9,9,220),rng.uniform(1,65,220))).astype('float32')
STARCOL=rng.uniform(.5,1.0,220)
PARTICLE_SEEDS=np.column_stack((rng.uniform(-1,1,240),rng.uniform(-1,1,240),rng.uniform(-1,1,240),rng.uniform(0,TAU,240))).astype('float32')

# OpenCV BGR channels throughout, converted to RGB only for Pillow typography.
ICE=(242,192,75)
CYAN=(255,225,94)
VIOLET=(247,91,176)
GOLD=(126,198,255)
WHITE=(255,250,246)

def smooth(a,b,x):
    v=np.clip((x-a)/(b-a),0,1);return v*v*(3-2*v)

def clamp(x,a,b):return max(a,min(b,x))

def norm(a):return a/(np.linalg.norm(a)+1e-10)

class Camera:
 def __init__(self,t):
    advance=-18+3.2*t+2.0*smooth(4.5,7.6,t)
    self.pos=np.array([4.9*math.cos(.58*t+.4),3.0*math.sin(.48*t+.9),advance])
    target=np.array([.35*math.sin(.5*t),.16*math.cos(t*.7),advance+22]);self.fwd=norm(target-self.pos)
    right=norm(np.cross(np.array([0.,1.,0.]),self.fwd)); up=norm(np.cross(self.fwd,right))
    roll=.065*math.sin(t*.8)+.06*smooth(5.5,7,t)*math.sin(12*t)
    self.right=right*math.cos(roll)+up*math.sin(roll)
    self.up=up*math.cos(roll)-right*math.sin(roll)
    self.focal=680*(1+.17*smooth(3.2,7,t))
 def project(self,P):
    p=np.asarray(P,dtype='float64')-self.pos
    z=p@self.fwd
    if z<.33:return None
    return (int(W/2+self.focal*(p@self.right)/z), int(H/2-self.focal*(p@self.up)/z),z)

class Renderer:
 def __init__(self,t):
    self.t=t;self.cam=Camera(t); self.main=np.zeros((H,W,3),np.uint8);self.light=np.zeros((H,W,3),np.uint8)
    self.bg()
 def bg(self):
    yy,xx=np.mgrid[0:H,0:W]; xn=(xx/W-.50);yn=(yy/H-.5)
    radius=xn*xn*1.2+yn*yn*.9
    glow=np.exp(-radius*7.5)
    mist=np.exp(-((xn-.12)**2*7+(yn+.02)**2*11))
    self.main[:,:,0]=np.uint8(np.clip(5+11*glow+5*mist,0,255))
    self.main[:,:,1]=np.uint8(np.clip(3+5*glow+2*mist,0,255))
    self.main[:,:,2]=np.uint8(np.clip(2+4*glow+2*mist,0,255))
    # Curved point streaks move as the camera advances; physical-ish Z parallax.
    for i,(x,y,z) in enumerate(STARS):
      p=self.cam.project((x*2.0,y*1.5,self.cam.pos[2]+z))
      if p is None: continue
      px,py,depth=p
      if px<0 or px>=W or py<0 or py>=H:continue
      s=STARCOL[i]*(.48+.52*smooth(5,40,depth))
      v=int(s*95)
      cv2.circle(self.main,(px,py),1,(v,int(v*.88),int(v*.78)),-1,cv2.LINE_AA)
      if i%9==0:
       cv2.line(self.light,(px,py),(px+int((px-W/2)*.013),py+int((py-H/2)*.013)),(int(v*.8),int(v*.6),int(v*.35)),1,cv2.LINE_AA)
 def shape(self,points,col,glow=False,thick=1,closed=False):
    p=[self.cam.project(x) for x in points]
    segments=[];cur=[]
    for q in p:
     if q is None:
      if len(cur)>1:segments.append(cur)
      cur=[]
     else:cur.append(q[:2])
    if len(cur)>1:segments.append(cur)
    for seg in segments:
     cv2.polylines(self.light if glow else self.main,[np.asarray(seg,np.int32)],closed,col,thick,cv2.LINE_AA)
 def luminous_line(self, a,b,col,thick=2,intensity=1):
    x=self.cam.project(a);y=self.cam.project(b)
    if x is None or y is None:return
    co=tuple(int(clamp(c*intensity,0,255)) for c in col)
    cv2.line(self.main,x[:2],y[:2],tuple(int(c*.60) for c in co),max(1,thick),cv2.LINE_AA)
    cv2.line(self.light,x[:2],y[:2],co,thick+1,cv2.LINE_AA)
 def polygon(self,pts,col,outline=None,glow=False):
    ps=[self.cam.project(a) for a in pts]
    if any(x is None for x in ps):return
    poly=np.asarray([x[:2] for x in ps],np.int32)
    if np.min(poly[:,0])>W+80 or np.max(poly[:,0])< -80 or np.min(poly[:,1])>H+80 or np.max(poly[:,1])< -80:return
    cv2.fillConvexPoly(self.main,poly,col,cv2.LINE_AA)
    if outline:
     cv2.polylines(self.main,[poly],True,outline,1,cv2.LINE_AA)
     if glow: cv2.polylines(self.light,[poly],True,outline,1,cv2.LINE_AA)
 def ring(self,z,R,index):
    t=self.t
    angleOffset=t*(.12 if index%2==0 else -.16)+index*.75
    # Sort by ring depth in the main scene; angular tone makes metal faceted.
    arms=36
    tilt=2.5*math.sin(index*2.1+0.2)
    def P(ang,r,zd=z):return (r*math.cos(ang),r*math.sin(ang),zd+tilt*math.cos(ang+angleOffset))
    # Segmented machined outer casing, with beveled radial ridges.
    for j in range(arms):
      a=TAU*j/arms+angleOffset;b=TAU*(j+.93)/arms+angleOffset
      lit=max(0, .5+.5*math.sin(a+.4))
      depth=(self.cam.project(P(a,R)) or (0,0,9999))[2]
      if depth<1:continue
      shade= .5+.45*lit
      base=(int(26*shade),int(21*shade),int(22*shade))
      edge=(int(68*shade),int(55*shade),int(46*shade))
      self.polygon([P(a,R+.58),P(b,R+.58),P(b,R-.22),P(a,R-.22)],base,outline=edge)
      if j%3==0:
        self.luminous_line(P(a,R-.27,z+.16),P(b,R-.27,z+.16),CYAN if index%2==0 else VIOLET,1,.40+.4*smooth(1.3,3.8,t))
      if j%6==0:
        self.polygon([P(a,R+.75),P(a+.035,R+.75),P(a+.035,R-1.0),P(a,R-1.0)],(43,39,45),(72,66,64))
    # Mechanical bridge frames toward the next ring.
    if index<4:
      for j in range(12):
       a=TAU*j/12+index*.30
       self.luminous_line(P(a,R+.38,z+.1),P(a,R+.25,z+4.1),(108,86,45),1,.40)
       self.luminous_line(P(a,R+.25,z+4.1),P(a,R+.48,z+8.4),(70,58,45),1,.3)
    for lane in range(3):
      pts=[P(TAU*j/112+angleOffset+lane*.009,R-.46-lane*.10,z+.16) for j in range(113)]
      self.shape(pts, (100,78,29) if lane else (100,116,48),False,1,True)
      if lane==0 and t>1:
       step=math.floor((t*.62+index*.27)%1*112)
       sub=[pts[(step+k)%112] for k in range(18)]
       self.shape(sub,CYAN if index%2==0 else VIOLET,True,2)
    # Arrayed holographic indexing plates outside the metal ring.
    for j in range(12):
      a=TAU*j/12+angleOffset
      if j%2:continue
      r=R+1.05
      self.luminous_line(P(a,r-.27,z+.2),P(a,r+.75,z+.2),CYAN if j%4==0 else VIOLET,2,.6)
      self.luminous_line(P(a-.045,r+.34,z+.2),P(a+.045,r+.34,z+.2),CYAN,1,.65)
 def core(self):
    t=self.t;phase=smooth(1.0,6.5,t)
    z=38.0
    for k in range(5):
      r=3.9-k*.35
      ang=t*(.60 if k%2==0 else -.73)+.9*k
      pts=[]
      for n in range(97):
        u=TAU*n/96+ang
        pts.append((r*math.cos(u),r*math.sin(u),z+1.15*math.sin(u*2+k)*.3))
      self.shape(pts,CYAN if k%2==0 else VIOLET,True,max(1,2-k//3),True)
    for j in range(8):
      a=TAU*j/8+t*.12;v=(3.9*math.cos(a),3.9*math.sin(a),z-.6)
      self.luminous_line(v,(0,0,z+1.1),VIOLET if j%2 else CYAN,2, .2+.8*smooth(3,5.6,t))
    p=self.cam.project((0,0,z))
    if p:
      rad=int(clamp(self.cam.focal*1.5/p[2],5,120))
      col=(255,240,190)
      cv2.circle(self.light,p[:2],max(5,rad),col,-1,cv2.LINE_AA)
      cv2.circle(self.main,p[:2],max(3,rad//3),(235,224,175),-1,cv2.LINE_AA)
 def lasers(self):
    t=self.t; ignition=smooth(2.6,4.6,t)*(1-.65*smooth(7.4,8.2,t))
    if ignition<=.005:return
    z=27.3;converge=38.0
    for k in range(12):
     a=TAU*k/12+.20
     start=np.array((5.4*math.cos(a),5.4*math.sin(a),z))
     tip=np.array((.15*math.sin(k*13),.15*math.cos(k*4),converge))
     mix=smooth(3,6.1,t)
     end=start+(tip-start)*mix
     color=CYAN if k%3 else VIOLET
     self.luminous_line(start,end,color,2,ignition*(.65+.2*math.sin(t*8+k)))
     if k%2==0:
       self.luminous_line(start+(0,0,.5),end+(0,0,.5),WHITE,1,ignition*.27)
 def sparks(self):
    t=self.t
    for i,(u,v,q,phi) in enumerate(PARTICLE_SEEDS):
      ang=phi+t*(.3+abs(q))
      r=2.0+7.2*abs(u)
      z=-1+q*11+(t*4+i*.041)%42
      P=(r*math.cos(ang),r*math.sin(ang),z)
      p=self.cam.project(P)
      if p is None:continue
      x,y,depth=p
      if x<-10 or x>=W+10 or y<-10 or y>=H+10:continue
      brightness=clamp(1.1/(.4+depth*.025),.25,1)
      co=CYAN if i%4 else VIOLET
      color=tuple(int(c*brightness*.65) for c in co)
      cv2.circle(self.light,(x,y),1 if depth>9 else 2,color,-1,cv2.LINE_AA)
      if i%6==0:
       ox=int(clamp((x-W/2)*.014,-9,9));oy=int(clamp((y-H/2)*.014,-9,9))
       cv2.line(self.main,(x,y),(x-ox,y-oy),tuple(int(c*.4) for c in co),1,cv2.LINE_AA)
 def shock(self):
    t=self.t
    if not 6.65<t<8.45:return
    p=smooth(6.68,7.7,t)
    center=self.cam.project((0,0,38))
    if center is None:return
    x,y,z=center
    R=int(14+p*max(W,H)*1.15)
    bright=1-smooth(7.45,8.45,t)
    cv2.circle(self.light,(x,y),R,tuple(int(c*bright) for c in CYAN),max(2,int(8*(1-p)+2)),cv2.LINE_AA)
    if t<7.28:
      r=int(12+65*smooth(6.8,7.25,t))
      cv2.circle(self.light,(x,y),r,WHITE,-1,cv2.LINE_AA)
      cv2.line(self.light,(0,y),(W,y),tuple(int(c*bright*.47) for c in WHITE),2,cv2.LINE_AA)
      cv2.line(self.light,(x,0),(x,H),tuple(int(c*bright*.30) for c in CYAN),1,cv2.LINE_AA)
 def draw(self):
    t=self.t
    self.sparks()
    for i,z in enumerate([34,25,16,7,-2][::-1]):
      self.ring(z, 5.0-.1*i,4-i)
    self.core();self.lasers();self.shock()
    # dynamic bloom; low-frequency radiance should not replace surface details.
    bloom=cv2.GaussianBlur(self.light,(0,0),5.0)
    bloom2=cv2.GaussianBlur(self.light,(0,0),13)
    out=cv2.addWeighted(self.main,1,bloom,.50,0)
    out=cv2.addWeighted(out,1,bloom2,.32,0)
    out=cv2.addWeighted(out,1,self.light,.55,0)
    # graded blue atmosphere, vignette and slight film grain
    yy,xx=np.ogrid[:H,:W]
    mask=np.clip(1-.32*((xx-W/2)/(W/2))**2-.32*((yy-H/2)/(H/2))**2,.46,1)
    out=np.uint8(np.clip(out.astype(np.float32)*mask[:,:,None],0,255))
    return out


def draw_titles(frame,t):
  pil=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB));draw=ImageDraw.Draw(pil)
  small=ImageFont.truetype(FONT,12);smallb=ImageFont.truetype(FONT_BOLD,11)
  # premium minimal editorial style, sparse technical metadata
  if t<8.3:
    v=1-smooth(7.5,8.3,t)
    c=tuple(int(x*v) for x in (100,132,166))
    draw.text((37,29),'EVERCRAFT    /    PHOTON LAB',font=smallb,fill=c,spacing=3)
    draw.text((37,50),'VOL. 03   •   CINEMATIC ENGINE TEST',font=ImageFont.truetype(FONT,9),fill=tuple(int(x*v) for x in (67,82,106)))
    draw.line((37,72,180,72),fill=(20,50,75),width=1)
    draw.text((W-193,H-42),'SYNTHETIC / OWNED FX',font=ImageFont.truetype(FONT,9),fill=c)
  if t>8.04:
    a=smooth(8.06,8.8,t)
    # background darkens for brand readability
    veil=Image.new('RGBA',(W,H),(1,4,12,int(205*a)))
    pil=Image.alpha_composite(pil.convert('RGBA'),veil)
    draw=ImageDraw.Draw(pil)
    big=ImageFont.truetype(FONT_BOLD,73)
    text='EVERCRAFT'
    # manually kern wide with calm, extremely crisp title lockup
    font=ImageFont.truetype(FONT_BOLD,56)
    letterspacing=7
    widths=[draw.textbbox((0,0),c,font=font)[2] for c in text]
    full=sum(widths)+letterspacing*(len(text)-1)
    x=(W-full)/2
    y=H/2-39
    alpha=int(255*a)
    # soft illuminated backplate, not floating powerpoint panels
    glow=Image.new('RGBA',(W,H),(0,0,0,0));g=ImageDraw.Draw(glow)
    g.rounded_rectangle((x-35,y-20,x+full+35,y+90),radius=20,fill=(12,60,115,int(a*17)))
    glow=glow.filter(ImageFilter.GaussianBlur(22))
    pil=Image.alpha_composite(pil,glow);draw=ImageDraw.Draw(pil)
    for c,w in zip(text,widths):
      draw.text((int(x),int(y)),c,font=font,fill=(232,246,255,alpha))
      x+=w+letterspacing
    tag='WHAT DOESN\'T EXIST. YET.'
    tagline=ImageFont.truetype(FONT,13)
    tw=draw.textbbox((0,0),tag,font=tagline)[2]
    draw.text(((W-tw)/2,H/2+57),tag,font=tagline,fill=(110,175,213,int(180*a)))
    # one thin emphasis line with horizontal lens stroke
    draw.line((int(W*.29),int(H*.71),int(W*.71),int(H*.71)),fill=(35,96,149,int(a*130)),width=1)
  return cv2.cvtColor(np.array(pil.convert('RGB')),cv2.COLOR_RGB2BGR)

def frame_at(t):
    img=Renderer(t).draw()
    return draw_titles(img,t)

def main():
  p=argparse.ArgumentParser();p.add_argument('--output',default=str(OUT/'Evercraft_Photon_Forge_V3_Silent.mp4'));p.add_argument('--fps',type=int,default=FPS);p.add_argument('--preview',type=float,default=None);p.add_argument('--quality',type=int,default=18)
  args=p.parse_args();OUT.mkdir(exist_ok=True,parents=True)
  if args.preview is not None:
    path=OUT/f'preview_{args.preview:04.1f}.jpg';cv2.imwrite(str(path),frame_at(args.preview));print(path);return
  target=Path(args.output).resolve();start=time.monotonic();cmd=['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pixel_format','bgr24','-video_size',f'{W}x{H}','-framerate',str(args.fps),'-i','pipe:0','-c:v','libx264','-preset','veryfast','-crf',str(args.quality),'-pix_fmt','yuv420p','-movflags','+faststart','-an',str(target)]
  proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
  for i in range(args.fps*DURATION):
    fr=frame_at(i/args.fps)
    proc.stdin.write(fr.tobytes())
    if i%60==0: print('frame',i,flush=True)
  proc.stdin.close();status=proc.wait()
  if status:raise RuntimeError(f'ffmpeg failed: {status}')
  probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_entries','stream=codec_name,width,height,nb_read_frames,codec_type','-show_entries','format=duration','-of','json',str(target)]))
  assert len(probe['streams'])==1 and int(probe['streams'][0]['nb_read_frames'])==args.fps*DURATION
  report={'schema':'evercraft.photon-forge.v3.canary','title':'Photon Forge V3','status':'decoded_software_preview','width':W,'height':H,'fps':args.fps,'frames':args.fps*DURATION,'durationSec':DURATION,'codec':'h264','audio':False,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'sourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'renderSeconds':round(time.monotonic()-start,2),'renderer':'CPU procedural perspective/2.5D','webglValidated':False,'worldEngineIntegrated':False,'masterApproved':False,'publicationAuthority':False}
  target.with_suffix('.receipt.json').write_text(json.dumps(report,indent=2)+'\n')
  print(json.dumps(report,indent=2))
if __name__=='__main__':main()
