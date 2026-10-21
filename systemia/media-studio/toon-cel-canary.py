#!/usr/bin/env python3
"""Deterministic 2D toon render canary. Never implies matched identities, dialogue, or QC.

Usage: python3 systemia/media-studio/toon-cel-canary.py --out /tmp/toon-canary
Requires cairosvg and ffmpeg+ffprobe. No network, provider calls or source photos.
"""
import argparse, hashlib, json, math, pathlib, shutil, subprocess, wave
from array import array
import cairosvg
from PIL import Image

def curve(n):
    n=max(0.,min(1.,n))
    return n*n*(3-2*n)

def frame_svg(frame,fps,motion=None,mouth_open=0):
    # A small explicitly authored, bounded 2D performance rig, NOT an AI actor.
    motion=motion or {'reach':1,'blinkAtSec':2.1,'gazeX':0,'lanternLift':1,'tailEnergy':.5}
    reach=motion['reach']
    gaze_x=motion['gazeX']
    tail_energy=motion['tailEnergy']
    mouth_open=max(0,min(1,mouth_open))
    t=frame/fps
    lift=curve((t-.45)/1.8)*motion['lanternLift']
    wave=curve((t-.6)/1.5)
    glow=90+18*math.sin(t*2.8)
    blink=max(.65,7*(1-max(0.,1-abs(t-motion['blinkAtSec'])/.12)))
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
<g transform="translate({math.sin(t*.9)*(3+7*tail_energy):.1f} 0)">
<path d="M367 398Q295 {380+12*tail_energy*math.sin(t*2):.1f} 275 442L188 401Q202 477 364 455Z" fill="url(#fur)" stroke="#55343d" stroke-width="6"/>
<path d="M190 404Q220 467 275 464Q220 479 190 404Z" fill="#ffedd6"/>
<path d="M356 363Q312 407 356 465H535Q566 411 506 368Q418 336 356 363Z" fill="url(#fur)" stroke="#55333b" stroke-width="6"/>
<path d="M408 374Q398 417 427 447Q456 470 484 443L468 376Z" fill="#f9dfbd"/>
<ellipse cx="372" cy="462" rx="48" ry="16" fill="#873d3a"/><ellipse cx="517" cy="462" rx="47" ry="15" fill="#853b3b"/>
<!-- upper-arm shoulder pivot / articulated paw -->
<g transform="translate(487 379) rotate({-49*wave*reach:.2f})">
<path d="M0 0Q30 8 53 40L60 71Q55 87 42 80L34 56L1 28Z" fill="#d66f4c" stroke="#54353b" stroke-width="5"/>
<path d="M42 72Q43 63 51 64L54 77Q60 66 65 69L64 81Q70 72 77 77L71 91Q56 100 43 89Z" fill="#f1ba86" stroke="#684448" stroke-width="3"/>
</g>
<g transform="translate(430 305)">
<path d="M-76 -38L-76 -141L-16 -84L35 -96L84 -142L72 -36Z" fill="url(#fur)" stroke="#59353f" stroke-width="6"/>
<path d="M-62 -88L-63 -120L-33 -90ZM45 -90L70 -121L59 -83Z" fill="#f5bfac"/>
<path d="M-88 -29Q-105 29 -65 73Q-3 118 58 75Q98 38 87 -33Q42 -88 -14 -73Q-62 -71 -88 -29Z" fill="url(#fur)" stroke="#55343d" stroke-width="6"/>
<path d="M-85 22Q-84 64 -39 79L5 97L51 79Q86 62 85 26L32 48L1 33L-39 47Z" fill="#f8e8d5"/>
<ellipse cx="{-40+7*gaze_x:.2f}" cy="-16" rx="8" ry="{blink:.2f}" fill="#172834"/><ellipse cx="{40+7*gaze_x:.2f}" cy="-16" rx="8" ry="{blink:.2f}" fill="#172834"/>
<circle cx="{-38+7*gaze_x:.2f}" cy="-18" r="2" fill="#fff6e1"/><circle cx="{42+7*gaze_x:.2f}" cy="-18" r="2" fill="#fff6e1"/>
<path d="M-36 43Q-14 18 5 24Q24 18 40 43Q23 74 4 74Q-12 70 -36 43Z" fill="#fff1df"/>
<ellipse cx="5" cy="40" rx="11" ry="7" fill="#292a33"/>
<path d="M5 48Q0 61 -10 59M5 48Q13 61 23 59" stroke="#63434a" stroke-width="3" fill="none" stroke-linecap="round"/>
<ellipse cx="5" cy="66" rx="{5+8*mouth_open:.2f}" ry="{1.2+15*mouth_open:.2f}" fill="#3c2731" stroke="#72444b" stroke-width="1.7"/>
<ellipse cx="5" cy="{70+6*mouth_open:.2f}" rx="{1+6*mouth_open:.2f}" ry="{.5+3*mouth_open:.2f}" fill="#e88c99" opacity="{min(1,mouth_open*1.5):.2f}"/>
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

def audio(path,seconds,rate=32000,voice_samples=None,voice_start=0):
    voice_samples=voice_samples or []
    voice_start_sample=round(voice_start*rate)
    pcm=array('h')
    notes=[(0.06,523.25),(.9,659.25),(1.8,783.99),(2.8,659.25)]
    for i in range(round(seconds*rate)):
        t=i/rate
        fade=max(0,min(1,t*4,(seconds-t)*2))
        pad=sum((.023-j*.004)*math.sin(2*math.pi*frequency*.5*t) for j,frequency in enumerate([220,329.63,392,493.88]))
        lead=sum(.08*math.exp(-3.5*(t-start))*(math.sin(2*math.pi*f*(t-start))+.31*math.sin(4*math.pi*f*(t-start)))
                 for start,f in notes if t>=start)
        pos=i-voice_start_sample
        voice=(voice_samples[pos]/32768) if 0<=pos<len(voice_samples) else 0.
        mix=(pad+lead)*fade*(.28 if voice_samples else 1)+voice*.8
        pcm.append(int(max(-1,min(1,mix))*30000))
    with wave.open(str(path),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(pcm.tobytes())

def read_motion(motion_path,seconds):
    if not motion_path:
        return {'reach':1,'blinkAtSec':min(2.1,seconds*.7),'gazeX':0,
                'lanternLift':1,'tailEnergy':.5},None,'default_original_fox_v1'
    motion=json.loads(pathlib.Path(motion_path).read_text())
    fields={'specimenProfile','reach','blinkAtSec','gazeX','lanternLift','tailEnergy'}
    if not isinstance(motion,dict) or set(motion)!=fields or motion['specimenProfile']!='original_fox_v1':
        raise ValueError('toon_motion_specimen_or_fields_invalid')
    for key,low,high in [('reach',0,1),('blinkAtSec',0,seconds),
                         ('gazeX',-1,1),('lanternLift',0,1),('tailEnergy',0,1)]:
        v=motion[key]
        if type(v) not in (float,int) or not math.isfinite(v) or not low<=v<=high:
            raise ValueError('toon_motion_range_invalid:'+key)
    canonical=json.dumps(motion,separators=(',',':'),ensure_ascii=False)
    motion_digest=hashlib.sha256(canonical.encode('utf-8')).hexdigest()
    return motion,motion_digest,'explicit_authored_original_fox_v1'

def offline_speech(out,phrase,seconds,start_sec,rate=32000):
    """Synthetic scratch speech, never a Voice Foundry or locked actor voice."""
    if phrase!='Hello, little light.':
        raise ValueError('toon_speech_canary_phrase_not_supported')
    if not (.2<=start_sec<=seconds-1.2):
        raise ValueError('toon_speech_canary_window_invalid')
    engine=shutil.which('espeak-ng') or shutil.which('espeak')
    if not engine:
        raise RuntimeError('toon_speech_canary_espeak_missing')
    scratch=out/'scratch-speech.wav'
    normalized=out/'scratch-speech-pcm.wav'
    command([engine,'-s','138','-p','62','-a','115','-w',str(scratch),phrase])
    command(['ffmpeg','-v','error','-y','-i',str(scratch),'-ar',str(rate),
        '-ac','1','-c:a','pcm_s16le',str(normalized)])
    with wave.open(str(normalized),'rb') as f:
        if f.getnchannels()!=1 or f.getsampwidth()!=2 or f.getframerate()!=rate:
            raise RuntimeError('toon_speech_canary_wav_format_mismatch')
        samples=array('h')
        samples.frombytes(f.readframes(f.getnframes()))
    last=len(samples)/rate
    if start_sec+last>seconds-.02:
        raise ValueError('toon_speech_canary_line_exceeds_shot')
    return samples,normalized

def frame_mouth_poses(voice_samples,start_sec,seconds,fps,rate=32000):
    if not voice_samples: return [0.]*round(seconds*fps)
    count=round(seconds*fps)
    poses=[]
    for frame in range(count):
        # Look at the true PCM amplitude in the corresponding audio window;
        # frame timestamps share the same master sample clock as the AAC mix.
        a=max(0,round((frame/fps-start_sec)*rate))
        b=min(len(voice_samples),round(((frame+1)/fps-start_sec)*rate))
        if b<=a or a>=len(voice_samples): poses.append(0.);continue
        span=voice_samples[a:b]
        rms=(sum(value*value for value in span)/len(span))**.5/32768
        poses.append(min(1.,max(0.,(rms-.009)*8)))
    return poses

def command(args):
    result=subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:raise RuntimeError(args[0]+'_failed:'+result.stderr[-1300:])
    return result.stdout

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def render(out,seconds=3,fps=24,width=768,height=432,motion_path=None,speech_line=None,speech_start_sec=.45):
    if not (.5<=seconds<=8 and 12<=fps<=60 and 320<=width<=1920 and 180<=height<=1080):
        raise ValueError('toon_canary_bounds_invalid')
    motion,motion_digest,motion_source=read_motion(motion_path,seconds)
    output=pathlib.Path(out).resolve(); frames=output/'frames'
    frames.mkdir(parents=True,exist_ok=True)
    count=round(seconds*fps)
    if speech_line:
        voice_samples,voice_path=offline_speech(output,speech_line,seconds,speech_start_sec)
        poses=frame_mouth_poses(voice_samples,speech_start_sec,seconds,fps)
        if max(poses)<=.12 or not any(value==0 for value in poses):
            raise RuntimeError('toon_speech_canary_mouth_contrast_missing')
    else:
        voice_samples=[];voice_path=None;poses=[0.]*count
    for i in range(count):
        cairosvg.svg2png(bytestring=frame_svg(i,fps,motion,poses[i]).encode(),
                        output_width=width,output_height=height,
                        write_to=str(frames/f'frame-{i:05d}.png'))
    if speech_line:
        strongest=max(range(count),key=lambda i:poses[i])
        quiet=next(i for i,v in enumerate(poses) if v==0)
        def mouth_crop_digest(i):
            with Image.open(frames/f'frame-{i:05d}.png') as image:
                crop=image.crop((round(width*.425),round(height*.635),
                                 round(width*.49),round(height*.79)))
                return hashlib.sha256(crop.tobytes()).hexdigest()
        active_mouth_digest=mouth_crop_digest(strongest)
        quiet_mouth_digest=mouth_crop_digest(quiet)
        if active_mouth_digest==quiet_mouth_digest:
            raise RuntimeError('toon_speech_canary_rendered_mouth_did_not_change')
    else:
        active_mouth_digest=None;quiet_mouth_digest=None
    wav=output/'original-synth-score.wav';audio(wav,seconds,voice_samples=voice_samples,voice_start=speech_start_sec)
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
      'previewMotionSource':motion_source,'previewMotionDigest':motion_digest,
      'sampleFrameIndex':min(count-1,round(count*.67)),
      'sampleFrameSha256':digest(frames/f"frame-{min(count-1,round(count*.67)):05d}.png"),
      'shotHandoffConnected':False,'characterIdentityVerified':False,
      'lipSyncVerified':False,'phonemeTimingVerified':False,'voiceProfileMatched':False,
      'audioReactiveMouthObserved':bool(speech_line),'speechEngine':'espeak_scratch_test_only' if speech_line else None,
      'speechText':speech_line,'speechStartSec':speech_start_sec if speech_line else None,
      'speechPcmDigest':digest(voice_path) if voice_path else None,
      'mouthPoseDigest':hashlib.sha256(json.dumps(poses,separators=(',',':')).encode()).hexdigest(),
      'mouthActiveFrames':sum(value>.12 for value in poses),'mouthSilentFrames':sum(value==0 for value in poses),
      'activeMouthCropSha256':active_mouth_digest,
      'silentMouthCropSha256':quiet_mouth_digest,
      'performanceAdmitted':False,
      'masterQcPassed':False,'publicationAuthority':False
    }
    if speech_line:
        (output/'audio-mouth-track.json').write_text(json.dumps({
            'schema':'evercraft.fallen.audio-reactive-mouth-track.v1',
            'source':'measured_pcm_frame_rms',
            'speechText':speech_line,'startSec':speech_start_sec,
            'fps':fps,'mouthPoses':poses,'phonemeAccurate':False,
            'voiceProfileMatched':False,'publicationAuthority':False
        },indent=2)+'\n')
    (output/'render-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    return receipt

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--out',required=True)
    p.add_argument('--seconds',type=float,default=3)
    p.add_argument('--fps',type=int,default=24)
    p.add_argument('--motion-json')
    p.add_argument('--speech-line')
    p.add_argument('--speech-start-sec',type=float,default=.45)
    p.add_argument('--width',type=int,default=768)
    p.add_argument('--height',type=int,default=432)
    args=p.parse_args()
    print(json.dumps(render(args.out,args.seconds,args.fps,args.width,args.height,args.motion_json,args.speech_line,args.speech_start_sec),indent=2))
