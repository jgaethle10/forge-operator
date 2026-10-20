#!/usr/bin/env python3
"""Evercraft-owned 5s synthetic permission-trace pixel canary.

This is an original geometric computer animation using Pillow/NumPy/FFmpeg.
It is NOT native World Engine WebGPU, not authentic Systemia product UI, not
a voice recording, and not a human-approved Fallen Shot Tournament winner.
"""
import argparse, hashlib, json, math, pathlib, random, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W,H,FPS,DURATION=1280,720,24,5
AQUA=(91,222,235); GOLD=(240,192,106); MUTED=(144,166,190); WHITE=(231,240,250)
FONT_BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT_NORMAL='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def font(n,bold=False):return ImageFont.truetype(FONT_BOLD if bold else FONT_NORMAL,n)
def clamp(v,a=0,b=1):return max(a,min(b,v))
def ease(t):
    x=clamp(t);return x*x*(3-2*x)
def rgba(rgb,alpha):return tuple(rgb)+(int(clamp(alpha)*255),)
def background():
    yy,xx=np.mgrid[0:H,0:W]
    radial=np.exp(-(((xx-640)/780)**2+((yy-325)/550)**2)*1.5)
    left=np.exp(-(((xx-470)/340)**2+((yy-344)/310)**2)*1.7)
    right=np.exp(-(((xx-910)/230)**2+((yy-340)/250)**2)*1.4)
    noise=np.random.default_rng(12021).normal(0,1.2,(H,W))
    arr=np.zeros((H,W,3),dtype=np.uint8)
    for channel,(base,blue,gold) in enumerate([(5,7,12),(12,17,13),(23,24,13)]):
        arr[:,:,channel]=np.clip(base+12*radial+blue*left+gold*right+noise,0,255).astype(np.uint8)
    return Image.fromarray(arr,'RGB').convert('RGBA')
BASE=background()
rng=random.Random(82145)
STARS=[(rng.randint(0,W),rng.randint(0,H),rng.choice([1,1,1,2]),rng.random()) for _ in range(85)]
def torus_projection(cx,cy,r,phase,tilt,t,points=220):
    pts=[]
    for j in range(points+1):
        a=2*math.pi*j/points+phase
        x0=r*math.cos(a);z0=r*math.sin(a)
        yaw=tilt+0.14*math.sin(t*.7)
        x=x0*math.cos(yaw)+z0*math.sin(yaw)
        depth=-x0*math.sin(yaw)+z0*math.cos(yaw)
        y=math.sin(a+phase*.17)*r*.38
        s=4.5/(4.5+depth/300)
        pts.append((cx+x*s,cy+y*s+depth*.11,depth))
    return pts
def bezier_path(x0,y0,x1,y1,n=110):
    points=[]
    for i in range(n+1):
        u=i/n
        x=(1-u)**3*x0+3*(1-u)**2*u*625+3*(1-u)*u*u*790+u**3*x1
        y=(1-u)**3*y0+3*(1-u)**2*u*228+3*(1-u)*u*u*485+u**3*y1
        points.append((x,y))
    return points
PATH=bezier_path(555,358,929,338)
def draw_frame(t):
    im=BASE.copy()
    back=Image.new('RGBA',(W,H),(0,0,0,0));d=ImageDraw.Draw(back,'RGBA')
    travel=t*19
    for z in range(1,19):
        u=z/19;y=int(495+u*u*205)
        d.line([(0,y),(W,y)],fill=(82,139,166,int(6+u*15)),width=1)
    for k in range(-15,16):
        x=640+k*74+int(travel)%74
        d.line([(640,492),(x*1.4-240,720)],fill=(64,125,162,14),width=1)
    for x,y,r,v in STARS:
        strength=int((8+v*27)*(.68+.32*math.sin(t*.4+v*15)**2))
        d.ellipse((x-r,y-r,x+r,y+r),fill=(185,221,236,strength))
    for cx,cy,color in [(485,360,AQUA),(932,342,GOLD)]:
        for radius in range(205,48,-18):
            a=max(0,8-int((radius-50)/20))
            d.ellipse((cx-radius,cy-radius*.68,cx+radius,cy+radius*.68),
                      outline=rgba(color,a/255),width=2)
    im=Image.alpha_composite(im,back)
    geometry=Image.new('RGBA',(W,H),(0,0,0,0));g=ImageDraw.Draw(geometry,'RGBA')
    # Rotating geometry: distinct computed pixels for every exact animation frame.
    for i,(r,theta,color) in enumerate([(190,.4,AQUA),(139,-.7,(120,167,207)),(79,.8,(138,209,216))]):
        points=torus_projection(486,355,r,theta+t*(.32 if i==0 else -.44),.64+t*.1,t)
        for j in range(len(points)-1):
            depth=(points[j][2]+r)/(2*r)
            thick=max(1,round(2+depth*2));a=int(65+140*depth)
            g.line([(points[j][0],points[j][1]),(points[j+1][0],points[j+1][1])],
                   fill=(*color,a),width=thick,joint='curve')
    g.line(PATH,fill=(61,174,201,48),width=15,joint='curve')
    g.line(PATH,fill=(113,212,232,96),width=2,joint='curve')
    packet=ease((t-1)/2.7)
    for j in range(8):
        u=clamp(packet-j*.018);index=round(u*(len(PATH)-1))
        x,y=PATH[index];strength=1-j/9;radius=3.4+j*.75
        g.ellipse((x-radius,y-radius,x+radius,y+radius),fill=rgba(GOLD,.75*strength))
    activated=ease((t-2.55)/1.3)
    for k in range(4):
        rad=81+k*18+math.sin(t*1.8+k)*3
        g.ellipse((928-rad,344-rad*.8,928+rad,344+rad*.8),
                  outline=rgba(GOLD,activated*(.52-k*.10)),width=2)
    g.ellipse((908,324,948,364),fill=rgba(GOLD,.12+.55*activated))
    g.ellipse((916,332,940,356),fill=rgba(WHITE,.22+.5*activated))
    for k in range(8):
        a=2*math.pi*k/8+t*.62
        x=486+191*math.cos(a);y=356+74*math.sin(a)
        radius=2+2*(.5+.5*math.cos(a))
        g.ellipse((x-radius,y-radius,x+radius,y+radius),
                  fill=rgba(AQUA,.25+.6*(.5+.5*math.sin(a))))
    im=Image.alpha_composite(im,geometry.filter(ImageFilter.GaussianBlur(13)))
    im=Image.alpha_composite(im,geometry)
    text=Image.new('RGBA',(W,H),(0,0,0,0));d=ImageDraw.Draw(text,'RGBA')
    d.text((86,59),'SYSTEMIA   /   UNIVERSITY',font=font(18,True),fill=rgba(WHITE,.96))
    d.line((86,98,1194,98),fill=(149,175,194,52),width=1)
    d.text((87,133),'AUTHORITY TRACE',font=font(38,True),fill=rgba(WHITE,1))
    d.text((90,185),'A fictional training scenario',font=font(17),fill=rgba(MUTED,.88))
    d.text((392,564),'AI AGENT',font=font(19,True),fill=rgba(AQUA,.98))
    d.text((853,564),'HUMAN OWNER',font=font(19,True),fill=rgba(GOLD,.78+activated*.22))
    d.line((87,613,1194,613),fill=(134,165,184,60),width=1)
    reveal=ease((t-.55)/.65)
    d.text((87,631),'SEND WITHOUT APPROVAL',font=font(20),fill=rgba(MUTED,reveal*.95))
    d.text((403,631),'ON',font=font(21,True),fill=rgba(GOLD,reveal*.98))
    d.text((774,631),'AUTHORIZED BY',font=font(20),fill=rgba(MUTED,activated))
    d.text((1020,627),'YOU',font=font(27,True),fill=rgba(GOLD,activated))
    d.text((88,686),'SYNTHETIC VISUALIZATION · NO LIVE CUSTOMER OR PRODUCT ACTION',
           font=font(10),fill=rgba(MUTED,.65))
    return Image.alpha_composite(im,text).convert('RGB')
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--handoff',required=True)
    parser.add_argument('--output',required=True)
    parser.add_argument('--receipt',required=True)
    parser.add_argument('--stills',required=True)
    args=parser.parse_args()
    with open(args.handoff,encoding='utf-8') as f:handoff=json.load(f)
    assert handoff['schema']=='evercraft.graphics-command.fallen-handoff.v1'
    assert handoff['truth']['publicationAuthority'] is False
    scene=next((x for x in handoff['studioPlan']['scenes'] if x['id']=='permission-trace'),None)
    assert scene and scene['durationSec']==5 and 'AUTHORIZED BY: YOU' in scene['screenText'],'scene contract mismatch'
    pathlib.Path(args.output).parent.mkdir(parents=True,exist_ok=True)
    pathlib.Path(args.stills).mkdir(parents=True,exist_ok=True)
    command=['ffmpeg','-loglevel','error','-y','-f','rawvideo','-vcodec','rawvideo',
             '-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-',
             '-an','-c:v','libx264','-preset','fast','-crf','18',
             '-pix_fmt','yuv420p','-movflags','+faststart',args.output]
    proc=subprocess.Popen(command,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    sample_hashes={}
    for frame in range(DURATION*FPS):
        image=draw_frame(frame/FPS)
        raw=image.tobytes()
        if frame in [0,24,48,72,96,119]:
            sample_hashes[str(frame)]=hashlib.sha256(raw).hexdigest()
        if frame in [0,36,72,108]:
            image.save(str(pathlib.Path(args.stills)/f'frame_{frame:03d}.png'))
        proc.stdin.write(raw)
    proc.stdin.close();error=proc.stderr.read();code=proc.wait()
    if code:raise RuntimeError(f'FFmpeg failed {code}: {error[-500:]}')
    output=pathlib.Path(args.output)
    digest=hashlib.sha256(output.read_bytes()).hexdigest()
    if len(set(sample_hashes.values()))<5:raise RuntimeError('distinct frames not proven')
    receipt={
      'schema':'evercraft.graphics-command.original-motion-candidate.v1',
      'campaignId':handoff['campaignId'],'sceneId':'permission-trace',
      'visualState':'original_software_render_synthetic_training_scene',
      'rightsState':'original_source_authored_pending_human_review',
      'renderer':'original_python_pillow_geometry_rasterizer_to_ffmpeg',
      'width':W,'height':H,'fps':FPS,'durationSec':DURATION,
      'frames':DURATION*FPS,'frameSha256':sample_hashes,
      'assetSha256':digest,'assetBytes':output.stat().st_size,
      'nativeWorldEngineGpu':False,'voicePresent':False,
      'shotTournamentApproved':False,'admittedIntoFallen':False,
      'publicationAuthority':False
    }
    pathlib.Path(args.receipt).write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
