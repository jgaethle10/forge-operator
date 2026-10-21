#!/usr/bin/env python3
"""Deterministic 2D toon render canary. Never implies matched identities, dialogue, or QC.

Usage: python3 systemia/media-studio/toon-cel-canary.py --out /tmp/toon-canary
Requires cairosvg and ffmpeg+ffprobe. No network, provider calls or source photos.
"""
import argparse, hashlib, json, math, pathlib, subprocess, wave
from array import array
import cairosvg

def curve(n):
    n=max(0.,min(1.,n))
    return n*n*(3-2*n)

def frame_svg(frame,fps):
    t=frame/fps
    lift=curve((t-.45)/1.8)
    wave=curve((t-.6)/1.5)
    glow=90+18*math.sin(t*2.8)
    blink=max(.65,7*(1-max(0.,1-abs(t-2.1)/.12)))
    x=650-42*lift+4*math.sin(t*1.7)
    y=181-44*lift+4*math.cos(t*2)
    dust=''.join(
        f'<circle cx="{x+math.sin(i*5.1+t)*(29+9*(i%4)):.2f}" cy="{y+math.cos(i*6.1+t)*(34+9*(i%3)):.2f}" r="{1.4+i%3}" fill="#ffe4a2" opacity="{.3+.5*(.5+.5*math.sin(t+i)):.2f}"/>'
        for i in range(18))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
<defs>
<linearGradient id="sky" x2="0" y2="1"><stop stop-color="#0b142a"/><stop offset=".64" stop-color="#35324c"/><stop offset="1" stop-color="#536157"/></linearGradient>
<linearGradient id="fur" x1="0" x2=".9" y1="0" y2="1"><stop stop-color="#ffaf69"/><stop offset="1" stop-color="#a2483e"/></linearGradient>
<radialGradient id="halo"><stop stop-color="#fff0be" stop-opacity=".92"/><stop offset=".3" stop-color="#ffcf86" stop-opacity=".48"/><stop offset="1" stop-color="#ffc178" stop-opacity="0"/></radialGradient>
<linearGradient id="land" x2="0" y2="1"><stop stop-color="#334c48"/><stop offset="1" stop-color="#10272b"/></linearGradient>
</defs>
<rect width="960" height="540" fill="url(#sky)"/>
<circle cx="801" cy="94" r="26" fill="#f5eed6" opacity=".8"/>
<path d="M0 330Q207 220 432 302T960 266V540H0Z" fill="#343c50"/>
<path d="M0 383Q260 285 462 357T960 310V540H0Z" fill="#263f46"/>
<g fill="#1a333c">
<path d="M0 399L66 201L144 399Z M117 403L186 240L255 404Z"/>
<path d="M781 396L844 190L928 397Z M899 411L963 219L1032 414Z"/>
</g>
<path d="M0 432Q247 398 512 430T960 412V540H0Z" fill="url(#land)"/>
<ellipse cx="450" cy="456" rx="164" ry="22" fill="#10252c" opacity=".65"/>
<!-- locked hand-drawn cartoon specimen, not reference-matched human identity -->
<g transform="translate({math.sin(t*.9)*5:.1f} 0)">
<path d="M367 398Q295 {380+6*math.sin(t*2):.1f} 275 442L188 401Q202 477 364 455Z" fill="url(#fur)" stroke="#55343d" stroke-width="6"/>
<path d="M190 404Q220 467 275 464Q220 479 190 404Z" fill="#ffedd6"/>
<path d="M356 363Q312 407 356 465H535Q566 411 506 368Q418 336 356 363Z" fill="url(#fur)" stroke="#55333b" stroke-width="6"/>
<path d="M408 374Q398 417 427 447Q456 470 484 443L468 376Z" fill="#f9dfbd"/>
<ellipse cx="372" cy="462" rx="48" ry="16" fill="#873d3a"/><ellipse cx="517" cy="462" rx="47" ry="15" fill="#853b3b"/>
<!-- upper-arm shoulder pivot / articulated paw -->
<g transform="translate(487 379) rotate({-49*wave:.2f})">
<path d="M0 0Q30 8 53 40L60 71Q55 87 42 80L34 56L1 28Z" fill="#d66f4c" stroke="#54353b" stroke-width="5"/>
<path d="M42 72Q43 63 51 64L54 77Q60 66 65 69L64 81Q70 72 77 77L71 91Q56 100 43 89Z" fill="#f1ba86" stroke="#684448" stroke-width="3"/>
</g>
<g transform="translate(430 305)">
<path d="M-76 -38L-76 -141L-16 -84L35 -96L84 -142L72 -36Z" fill="url(#fur)" stroke="#59353f" stroke-width="6"/>
<path d="M-62 -88L-63 -120L-33 -90ZM45 -90L70 -121L59 -83Z" fill="#f5bfac"/>
<path d="M-88 -29Q-105 29 -65 73Q-3 118 58 75Q98 38 87 -33Q42 -88 -14 -73Q-62 -71 -88 -29Z" fill="url(#fur)" stroke="#55343d" stroke-width="6"/>
<path d="M-85 22Q-84 64 -39 79L5 97L51 79Q86 62 85 26L32 48L1 33L-39 47Z" fill="#f8e8d5"/>
<ellipse cx="-40" cy="-16" rx="8" ry="{blink:.2f}" fill="#172834"/><ellipse cx="40" cy="-16" rx="8" ry="{blink:.2f}" fill="#172834"/>
<circle cx="-38" cy="-18" r="2" fill="#fff6e1"/><circle cx="42" cy="-18" r="2" fill="#fff6e1"/>
<path d="M-36 43Q-14 18 5 24Q24 18 40 43Q23 74 4 74Q-12 70 -36 43Z" fill="#fff1df"/>
<ellipse cx="5" cy="40" rx="11" ry="7" fill="#292a33"/>
<path d="M5 48Q0 61 -10 59M5 48Q13 61 23 59" stroke="#63434a" stroke-width="3" fill="none" stroke-linecap="round"/>
</g>
</g>
<circle cx="{x:.2f}" cy="{y:.2f}" r="{glow:.2f}" fill="url(#halo)"/>
<g transform="translate({x:.2f} {y:.2f}) rotate({3*math.sin(t*2):.1f})">
<path d="M-21 -31H21L26 23Q0 39 -26 23Z" fill="#f7d18c" stroke="#a7704e" stroke-width="4"/>
<path d="M-23 -23L23 23M23 -23L-23 23" stroke="#9d7046" stroke-width="3" opacity=".65"/>
<rect x="-26" y="-34" width="52" height="8" rx="3" fill="#b58255"/>
<path d="M-10 -34Q-14 -53 0 -53Q14 -53 10 -34" stroke="#ffe0aa" stroke-width="5" fill="none"/>
<path d="M-4 12Q-15 0 -1 -19Q9 -5 7 5Q3 17 -4 12Z" fill="#fffbe2"/>
</g>
{dust}
<path d="M0 519Q360 510 610 520T960 515" fill="none" stroke="#799080" stroke-width="2" opacity=".3"/>
</svg>'''

def audio(path,seconds,rate=32000):
    pcm=array('h')
    notes=[(0.06,523.25),(.9,659.25),(1.8,783.99),(2.8,659.25)]
    for i in range(round(seconds*rate)):
        t=i/rate
        fade=max(0,min(1,t*4,(seconds-t)*2))
        pad=sum((.023-j*.004)*math.sin(2*math.pi*frequency*.5*t) for j,frequency in enumerate([220,329.63,392,493.88]))
        lead=sum(.08*math.exp(-3.5*(t-start))*(math.sin(2*math.pi*f*(t-start))+.31*math.sin(4*math.pi*f*(t-start)))
                 for start,f in notes if t>=start)
        pcm.append(int(max(-1,min(1,(pad+lead)*fade))*30000))
    with wave.open(str(path),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(pcm.tobytes())

def command(args):
    result=subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:raise RuntimeError(args[0]+'_failed:'+result.stderr[-1300:])
    return result.stdout

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def render(out,seconds=3,fps=24,width=768,height=432):
    if not (.5<=seconds<=8 and 12<=fps<=60 and 320<=width<=1920 and 180<=height<=1080):
        raise ValueError('toon_canary_bounds_invalid')
    output=pathlib.Path(out).resolve(); frames=output/'frames'
    frames.mkdir(parents=True,exist_ok=True)
    count=round(seconds*fps)
    for i in range(count):
        cairosvg.svg2png(bytestring=frame_svg(i,fps).encode(),
                        output_width=width,output_height=height,
                        write_to=str(frames/f'frame-{i:05d}.png'))
    wav=output/'original-synth-score.wav';audio(wav,seconds)
    mp4=output/'toon-cel-canary.mp4'
    command(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate',str(fps),
             '-i',str(frames/'frame-%05d.png'),'-i',str(wav),'-c:v','libx264',
             '-pix_fmt','yuv420p','-crf','21','-preset','fast',
             '-c:a','aac','-b:a','128k','-shortest','-movflags','+faststart',str(mp4)])
    probe=json.loads(command(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(mp4)]))
    video=next(s for s in probe['streams'] if s['codec_type']=='video')
    sound=next(s for s in probe['streams'] if s['codec_type']=='audio')
    assert video['codec_name']=='h264' and sound['codec_name']=='aac'
    assert (int(video['width']),int(video['height']))==(width,height)
    receipt={
      'schema':'evercraft.fallen.toon-cel-render-proof.v1',
      'status':'rendered_canary_not_production_admitted',
      'source':'self_contained_original_vector_art', 'frameCount':count,'fps':fps,
      'width':width,'height':height,'durationSec':float(probe['format']['duration']),
      'mp4':mp4.name,'sha256':digest(mp4),'audio':'original_synth_instrumental_no_voice',
      'shotHandoffConnected':False,'characterIdentityVerified':False,
      'lipSyncVerified':False,'performanceAdmitted':False,
      'masterQcPassed':False,'publicationAuthority':False
    }
    (output/'render-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    return receipt

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--out',required=True)
    p.add_argument('--seconds',type=float,default=3)
    p.add_argument('--fps',type=int,default=24)
    p.add_argument('--width',type=int,default=768)
    p.add_argument('--height',type=int,default=432)
    args=p.parse_args()
    print(json.dumps(render(args.out,args.seconds,args.fps,args.width,args.height),indent=2))
