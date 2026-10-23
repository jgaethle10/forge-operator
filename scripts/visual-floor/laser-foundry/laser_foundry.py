#!/usr/bin/env python3
"""Evercraft / Laser Foundry: original procedural cinematic laser show.
Raster composition and original choreography; not a camera recording or physical laser simulation.
No third-party art, model inference or external imagery.
"""
import argparse, math, subprocess, os, json, hashlib
from pathlib import Path
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

TAU=2*math.pi
DURATION=12.0
FPS=30
SEED=814509
BLUE=(254,204,57)    # BGR laser colors, original palette
CYAN=(241,244,86)
PINK=(212,112,250)
PURPLE=(236,103,160)
GOLD=(122,201,255)
WHITE=(255,255,248)
COLORS=[CYAN,BLUE,PURPLE,PINK,CYAN,GOLD]


def clamp(x,a=0,b=1): return max(a,min(b,x))
def smooth(a,b,x):
    v=clamp((x-a)/(b-a))
    return v*v*(3-2*v)
def pulse(t,a,b,fade=.3):return smooth(a,a+fade,t)*(1-smooth(b-fade,b,t))

def font(px,heavy=False):
    target=('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if heavy else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    return ImageFont.truetype(target,max(8,round(px)))

def background(W,H,portrait):
    xs=np.linspace(-1,1,W,dtype=np.float32)[None,:]
    ys=np.linspace(0,1,H,dtype=np.float32)[:,None]
    center= np.exp(-((xs*.9)**2+((ys-.63)*2.25)**2)*1.6)
    vignette=np.power(np.clip(1.0-.46*(xs**2)-.28*((ys-.55)*2)**2,.2,1),1.1)
    bg=np.zeros((H,W,3),np.float32)
    bg[:,:,0]=(8+20*center+6*ys)*vignette
    bg[:,:,1]=(9+10*center+4*ys)*vignette
    bg[:,:,2]=(9+8*center+4*ys)*vignette
    # fine grained tech-stadium points
    rng=np.random.default_rng(SEED)
    for i in range(270 if portrait else 390):
        x=rng.integers(0,W); y=int(rng.uniform(.13,.84)*H)
        a=rng.uniform(2,13)
        bg[y,x,:]+=a*np.array([1,.8,.65])
    return np.uint8(np.clip(bg,0,255))


def pnt(x,y,W,H):return (int(x*W),int(y*H))

def line(img,a,b,color,thick,W,H):
    cv2.line(img,pnt(a[0],a[1],W,H),pnt(b[0],b[1],W,H),color,thick,cv2.LINE_AA)

def poly(img,coords,color,W,H):
    cv2.fillConvexPoly(img,np.array([pnt(x,y,W,H) for x,y in coords],np.int32),color,cv2.LINE_AA)

def build_static(w,h,portrait):
    bg=background(w,h,portrait)
    # arena architecture; rays and floor are composited on top of tangible scene
    edge=cv2.copyMakeBorder(bg,0,0,0,0,cv2.BORDER_CONSTANT)
    horizon=.78 if portrait else .74
    floorFront=.965 if portrait else .97
    # back wall in perspective and structural bands
    wall=(9,12,18)
    poly(edge,[(.03,horizon-.22),(.97,horizon-.22),(.95,horizon+.02),(.05,horizon+.02)],wall,w,h)
    # neutral graphite stage platform, broken into layers
    poly(edge,[(.08,horizon),(.92,horizon),(.995,floorFront),(.005,floorFront)],(30,21,15),w,h)
    poly(edge,[(.10,horizon+.010),(.90,horizon+.010),(.98,floorFront-.02),(.02,floorFront-.02)],(38,27,19),w,h)
    # back panel ribs give stable real-world scale
    for k in range(18):
        x=.07+k*.86/17
        length=.13+.03*(k%3)
        line(edge,(x,horizon-.20),(x,horizon-.20+length),(31,24,19),2,w,h)
    for yy in [horizon-.21,horizon-.175,horizon-.125,horizon-.052]:
        line(edge,(.045,yy),(.955,yy),(38,29,22),2,w,h)
    # long truss overhead with physical depth offset
    y=horizon-.24
    for yoff in [0,.024]:
        line(edge,(.03,y+yoff),(.97,y+yoff),(62,48,40),3,w,h)
    for k in range(21):
        x=.03+.94*k/20
        line(edge,(x,y),(min(.97,x+.94/20),y+.024),(64,52,45),1,w,h)
        line(edge,(x,y+.024),(min(.97,x+.94/20),y),(46,40,34),1,w,h)
    # integrated floor stage panels, correct perspective to central vanishing point
    for k in range(-9,10):
        x=.5+k*.052
        xfront=.5+(x-.5)*1.3
        line(edge,(x,horizon+.008),(xfront,floorFront-.020),(42,35,27),1,w,h)
    for j in range(6):
        depth=(j/6)**1.6
        yy=horizon+.012+(floorFront-horizon-.045)*depth
        left=.095-(.082*depth); right=.905+.082*depth
        line(edge,(left,yy),(right,yy),(34+int(12*depth),31,28),1,w,h)
    # stage plinths
    for sx in np.linspace(.13,.87,9):
        x0=sx-.024
        poly(edge,[(x0,horizon+.012),(sx+.025,horizon+.012),(sx+.028,horizon+.045),(x0-.002,horizon+.045)],(60,52,44),w,h)
        line(edge,(x0,horizon+.012),(sx+.025,horizon+.012),(99,69,52),2,w,h)
    return edge,horizon


def add_round(layer,x,y,r,bgr,W,H,intensity=1):
    cv2.circle(layer,pnt(x,y,W,H),max(1,int(r*min(W,H))),tuple(int(c*intensity) for c in bgr),-1,cv2.LINE_AA)

def ray_img(halo,core,point_a,point_b,col,width,W,H,level=1):
    if level<=0:return
    a=pnt(*point_a,W,H);b=pnt(*point_b,W,H)
    # Separate bloom and optical core. Bloom will be filtered at 3 spatial scales.
    glow=tuple(int(c*level*.32) for c in col)
    cv2.line(halo,a,b,glow,max(2,width*3),cv2.LINE_AA)
    cv2.line(core,a,b,tuple(min(255,int(c*level)) for c in col),max(1,width),cv2.LINE_AA)
    if level>.55:cv2.line(core,a,b,tuple(min(255,int(v*level)) for v in WHITE),1,cv2.LINE_AA)


def rig(t,portrait):
    """Semantic beat structure. 4 controlled cue blocks, no random blinkenlights."""
    if t<1.65:return 0
    if t<4.1:return 1
    if t<6.8:return 2
    if t<9.25:return 3
    return 4


def beam_system(t,W,H,portrait,horizon):
    halo=np.zeros((H,W,3),np.uint8)
    core=np.zeros_like(halo)
    haze=np.zeros_like(halo)
    beat=rig(t,portrait)
    # physical projector pods spread across stage; atmosphere is 2D haze volume approximation
    pod_x=np.linspace(.105,.895,18)
    center_y=horizon-.045
    # energizing cue
    power=smooth(.08,.65,t)*(1-smooth(10.62,11.96,t)*.35)
    if beat==0:
        frac=smooth(.35,1.55,t)
        indices=list(range(7,11))
    elif beat==1:
        frac=smooth(1.65,2.2,t)
        indices=list(range(2,16))
    else:
        frac=1
        indices=list(range(18))
    phase=t*1.4
    for i in indices:
        sx=float(pod_x[i]);side=1 if i>=9 else -1
        # closer projectors lie slightly lower than far emitters
        sy=horizon-.035+0.007*math.sin(i*.55)
        wave=math.sin(phase+i*.26)
        if beat==0:
            # the first ignition fan is focused straight into the roof
            ex=.5+(.018*(i-8.5))+(.025*math.sin(t*2))
            ey=.29+(i%3)*.016 if portrait else .12+(i%3)*.02
        elif beat==1:
            # grand reveal: a fan opens out over the entire arena
            spread=(sx-.5)*1.04
            ex=.5-spread*(.78+.22*math.sin(t*1.9))+.075*wave
            ey=(.225 if portrait else .10)+.13*((i%5)/4)+.035*math.cos(t*.65+i*.13)
        elif beat==2:
            # spatial weave: cross the auditorium to create a kinetic lattice
            ex=1-sx+.16*math.sin(phase+i*.40)
            ey=(.26 if portrait else .12)+.15*((i%4)/3)+.030*math.sin(phase*2+i)
        elif beat==3:
            # laser canopy pyramid splits into controlled 3D-oriented groups
            spread=.42*(i-8.5)/8.5
            ex=.5-spread*(.85+.45*math.sin(t*1.15+i*.18))+ .065*math.sin(t*1.8+i*.30)
            ey=(.19 if portrait else .085)+.08*(i%4)/3+.055*math.sin(t*.45+i*.2)
        else:
            # final rays form two strong wings framing the identity
            ex=.5+(.49 if side>0 else -.49)*smooth(9.25,9.82,t)+.08*(sx-.5)
            ey=(.40 if portrait else .27)+.10*(i%3)/3
        ex=clamp(ex,-.17,1.17)
        lv=power*frac*(.52+.40*smooth(1.3,3.0,t))
        lv*=1 + .13*math.sin(t*4+i*.3)
        if beat==4:lv*=.65
        col=COLORS[(i//3)%len(COLORS)]
        if beat==4:col= CYAN if i%2 else GOLD
        width=max(1,round(W/620))
        ray_img(halo,core,(sx,sy),(ex,ey),col,width,W,H,lv)
        # glowing haze along the beam visible in fog, not simply a thin stroke
        if i%2==0:
            for u in (.24,.52,.78):
                px=sx+(ex-sx)*u;py=sy+(ey-sy)*u
                add_round(haze,px,py,(.008+.010*(1-u))*(.7+.3*math.sin(i)),col,W,H,.12*lv)
        # tight beam-origin bloom
        add_round(halo,sx,sy,.007,col,W,H,.8*lv)
    return halo,core,haze


def physical_housings(frame,t,W,H,horizon):
    # Black moving head lens housings with lit Fresnel apertures.
    for i,x in enumerate(np.linspace(.105,.895,18)):
        y=horizon-.018+.005*math.sin(i*.55)
        p=pnt(x,y,W,H)
        r=max(2,W//230)
        cv2.ellipse(frame,(p[0],p[1]+r*2),(r*2,r),0,0,360,(0,0,0),-1,cv2.LINE_AA)
        cv2.circle(frame,p,r+3,(46,43,42),-1,cv2.LINE_AA)
        cv2.circle(frame,p,r,(132,106,73),1,cv2.LINE_AA)
        if t>1.65 or i in (7,8,9,10):
            cv2.circle(frame,p,max(1,r-1),COLORS[(i//3)%6],-1,cv2.LINE_AA)
    # upper rig pods with lens guards
    for i in range(12):
        x=.085+.83*(i/11)
        px,py=pnt(x,horizon-.24,W,H)
        rad=max(2,W//180)
        cv2.rectangle(frame,(px-rad*2,py-rad),(px+rad*2,py+rad*2),(28,35,37),-1)
        cv2.circle(frame,(px,py+rad),rad,(85,95,104),1,cv2.LINE_AA)


def environment_fx(frame,t,W,H,horizon):
    halo=np.zeros((H,W,3),np.uint8)
    core=np.zeros_like(halo)
    pulse_strength=pulse(t,6.72,9.95,fade=.8)
    # rotating portal laser crowns, concentric optical interference rings
    if t>5.65 and t<10.2:
        a=pulse(t,5.65,10.2,.9)
        ox,oy=(.5, .455 if H>W else .36)
        rbase=.17 if H>W else .132
        for j in range(3):
            r=rbase*(1+j*.34)*(.85+.06*math.sin(t*2+j))
            count=48
            pts=[]
            for k in range(count):
                ang=k*TAU/count+t*(.18*(-1)**j)+j*.35
                pts.append((ox+r*math.cos(ang),oy+r*.58*math.sin(ang)))
            for k in range(count):
                if k%7 in (0,1):continue
                col=[CYAN,PURPLE,GOLD][j]
                ray_img(halo,core,pts[k],pts[(k+1)%count],col,max(1,W//930),W,H,a*(.65+.2*math.sin(t*2+j)))
    # floor light pools, bounce-like physically staged lights
    for i,x in enumerate(np.linspace(.12,.88,9)):
        if t<1.3 and i not in (4,):continue
        amp=.14+.22*pulse(t,1.1,10.5,.45)
        c=COLORS[i%6]
        px,py=pnt(x,horizon+.065,W,H)
        rx=max(4,int(W*.052));ry=max(2,int(H*.009))
        cv2.ellipse(halo,(px,py),(rx,ry),0,0,360,tuple(int(z*amp) for z in c),-1,cv2.LINE_AA)
    # original optical dust, particles move continuously on a beat, no stock footage
    rng=np.random.default_rng(SEED+4)
    dust=rng.random((190,5))
    for k,(rx,ry,rs,rate,hue) in enumerate(dust):
        x=(float(rx)+t*(.002+.02*rate)+.015*math.sin(t*.43+k))%1
        y=.18+float(ry)*(.61 if H>W else .51)-t*.007*(.2+rate)
        if not (.02<y<horizon):continue
        c=COLORS[int(hue*6)%6]
        rad=1 if rs<.92 else 2
        p=pnt(x,y,W,H)
        # Particle main layer is subdued and never a solid confetti storm
        cv2.circle(core,p,rad,tuple(int(z*(.20+.22*rs)) for z in c),-1,cv2.LINE_AA)
    return halo,core


def add_fog_and_glow(bg,halos,cores,haze,t,W,H):
    combined=np.zeros((H,W,3),np.uint8)
    for hl in halos:combined=cv2.add(combined,hl)
    for c in cores:combined=cv2.add(combined,c)
    # layered optical energy: wide 17-31px, mid 9px, core 1px, all source-bound
    blur_big=cv2.GaussianBlur(combined,(0,0),max(7,W*.014))
    blur_med=cv2.GaussianBlur(combined,(0,0),max(2.5,W*.0048))
    blur_haze=cv2.GaussianBlur(haze,(0,0),max(9,W*.016))
    b=cv2.addWeighted(bg,1.0,blur_big,.68,0)
    b=cv2.addWeighted(b,1.0,blur_haze,.47,0)
    b=cv2.addWeighted(b,1.0,blur_med,.68,0)
    for c in cores:b=cv2.addWeighted(b,1,c,.74,0)
    return b


def typography(frame,t,W,H,portrait):
    # Anti-aliased typography is composited last, exempt from laser bloom.
    alpha=1.0
    image=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)).convert('RGBA')
    overlay=Image.new('RGBA',(W,H),(0,0,0,0))
    d=ImageDraw.Draw(overlay)
    margin=int(W*.070)
    title_px=int(W*(.039 if portrait else .029))
    small_px=max(14,int(W*(.020 if portrait else .0125)))
    tiny=max(12,int(W*(.015 if portrait else .009)))
    d.text((margin,int(H*.067 if portrait else H*.062)),"E V E R C R A F T",font=font(title_px,True),fill=(221,241,250,220))
    d.text((margin,int(H*.067 if portrait else H*.062)+title_px*1.6),"VISUAL FOUNDRY   /   ORIGINAL LASER STUDY",font=font(tiny),fill=(146,184,204,160))
    yline=.140 if portrait else .139
    d.line([(margin,int(H*yline)),(W-margin,int(H*yline))],fill=(135,184,202,75),width=max(1,W//600))
    # tiny but truthful 'not recorded physical lights' review label
    by=int(H*.924 if portrait else H*.922)
    d.text((margin,by),"PROCEDURAL LIGHT PERFORMANCE",font=font(tiny),fill=(179,214,233,185))
    d.text((margin,by+tiny*1.5),"ORIGINAL RENDER   •   NOT LIVE CONCERT FOOTAGE",font=font(tiny),fill=(129,159,186,141))
    # story beats provide restrained narration only at transitions
    lines=[(1.7,3.5,'IGNITION'),(4.2,6.5,'SPECTRUM'),(6.9,8.9,'APERTURE')]
    for a,b,word in lines:
        op=int(110*pulse(t,a,b,.28))
        if op:
            ff=font(int(W*(.053 if portrait else .036)),True)
            box=d.textbbox((0,0),word,font=ff)
            tw=box[2]-box[0]
            d.text(((W-tw)//2,int(H*(.155 if portrait else .145))),word,font=ff,fill=(216,239,255,op))
    # footer progress bar
    foot_y=int(H*(.975 if portrait else .975))
    d.line([(margin,foot_y),(W-margin,foot_y)],fill=(72,100,116,80),width=2)
    d.line([(margin,foot_y),(margin+int((W-2*margin)*t/DURATION),foot_y)],fill=(123,232,244,210),width=3)
    # Final lockup; controlled luminance and no background rectangular card.
    reveal=smooth(9.6,10.2,t)
    if reveal:
        op=int(255*reveal)
        txt='EVERCRAFT'
        f=font(int(W*(.12 if portrait else .095)),True)
        box=d.textbbox((0,0),txt,font=f)
        tw=box[2]-box[0]
        yy=int(H*(.40 if portrait else .46))
        d.text(((W-tw)//2,yy),txt,font=f,fill=(242,250,255,op))
        ft=font(int(W*(.035 if portrait else .025)))
        sub="IMAGINE WHAT'S NEXT"
        bbox=d.textbbox((0,0),sub,font=ft)
        d.text(((W-(bbox[2]-bbox[0]))//2,yy+int(W*(.145 if portrait else .12))),sub,font=ft,fill=(168,235,246,int(op*.9)))
        cy=yy-int(H*.034)
        d.line([(int(W*.36),cy),(int(W*.64),cy)],fill=(71,224,240,int(op*.85)),width=max(2,W//250))
    image=Image.alpha_composite(image,overlay).convert('RGB')
    return cv2.cvtColor(np.asarray(image),cv2.COLOR_RGB2BGR)


def frame_at(t,W,H,portrait,bg,horizon):
    base=bg.copy()
    # More cinematic integration: physical housings remain behind the laser system,
    # the optical bloom and reflection add dimensionality rather than just strokes.
    physical_housings(base,t,W,H,horizon)
    main_halo,main_core,haze=beam_system(t,W,H,portrait,horizon)
    fx_halo,fx_core=environment_fx(base,t,W,H,horizon)
    out=add_fog_and_glow(base,[main_halo,fx_halo],[main_core,fx_core],haze,t,W,H)
    out=typography(out,t,W,H,portrait)
    # stylish cold-graded film grain, 1% amplitudes; not fake texture overstock
    return out


def render(output,working_w,working_h,output_w,output_h,frames=360,preview_times=None):
    portrait=working_h>working_w
    workdir=Path(output).parent;workdir.mkdir(exist_ok=True,parents=True)
    bg,horizon=build_static(working_w,working_h,portrait)
    if preview_times:
        for t in preview_times:
            img=frame_at(t,working_w,working_h,portrait,bg,horizon)
            if (output_w,output_h)!=(working_w,working_h):img=cv2.resize(img,(output_w,output_h),interpolation=cv2.INTER_CUBIC)
            p=workdir/f'{Path(output).stem}_preview_{t:.1f}.jpg'
            cv2.imwrite(str(p),img,[cv2.IMWRITE_JPEG_QUALITY,92])
            print('PREVIEW',p,flush=True)
        return
    size=f'{output_w}x{output_h}'
    args=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','bgr24',
          '-s',size,'-r',str(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','18',
          '-pix_fmt','yuv420p','-movflags','+faststart',output]
    proc=subprocess.Popen(args,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        for i in range(frames):
            t=i/FPS
            img=frame_at(t,working_w,working_h,portrait,bg,horizon)
            if (output_w,output_h)!=(working_w,working_h):
                img=cv2.resize(img,(output_w,output_h),interpolation=cv2.INTER_CUBIC)
            proc.stdin.write(img.tobytes())
            if i%30==0:print(f'frame {i}/{frames}',flush=True)
    except Exception:
        proc.kill();raise
    finally:
        if proc.stdin:proc.stdin.close()
    stderr=proc.stderr.read().decode('utf-8','replace');code=proc.wait()
    if code:raise RuntimeError(f'ffmpeg error {code}: {stderr[-2000:]}')
    print('RENDER_COMPLETE',output,flush=True)


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--format',choices=['story','wide'],default='story')
    p.add_argument('--output',required=True)
    p.add_argument('--previews',action='store_true')
    p.add_argument('--frames',type=int,default=360)
    a=p.parse_args()
    if a.format=='story':size=(540,960);out=(1080,1920)
    else:size=(960,540);out=(1920,1080)
    render(a.output,*size,*out,frames=a.frames,preview_times=[.6,2.5,4.9,7.5,9.0,10.7] if a.previews else None)
if __name__=='__main__':main()

