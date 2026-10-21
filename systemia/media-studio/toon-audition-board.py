#!/usr/bin/env python3
"""Audition an ACTUAL rendered cartoon clip. Technical evidence != artistic approval.

Only local files; no provider calls, identity claims, automatic aesthetics scoring,
or publication action. Contact sheet gives humans something concrete to review.
"""
import argparse, hashlib, io, json, math, pathlib, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageOps

def run(args):
    r=subprocess.run(args,check=False,capture_output=True)
    if r.returncode:
        raise RuntimeError(args[0]+'_failed:'+r.stderr.decode('utf8','replace')[-800:])
    return r.stdout

def sha(data):
    return hashlib.sha256(data).hexdigest()

def rate(raw):
    if not raw:return 0.
    try:
        a,b=(float(x) for x in str(raw).split('/')) if '/' in str(raw) else (float(raw),1.)
        return a/b if b else 0.
    except ValueError:return 0.

def frame_at(file,ts):
    raw=run(['ffmpeg','-hide_banner','-loglevel','error','-ss',str(ts),'-i',str(file),
      '-frames:v','1','-vf','scale=960:-2:flags=lanczos','-f','image2pipe','-vcodec','png','-'])
    return Image.open(io.BytesIO(raw)).convert('RGB')

def audition(video,out,render_receipt=None,columns=3,samples=9):
    video=pathlib.Path(video).resolve()
    if not video.is_file() or video.stat().st_size==0:raise ValueError('audition_video_missing')
    if not (2<=samples<=12 and 2<=columns<=4):raise ValueError('audition_layout_invalid')
    out=pathlib.Path(out).resolve();out.mkdir(parents=True,exist_ok=True)
    payload=video.read_bytes()
    digest=sha(payload)
    raw=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
    streams=raw.get('streams',[])
    v=next((x for x in streams if x.get('codec_type')=='video'),None)
    a=next((x for x in streams if x.get('codec_type')=='audio'),None)
    if v is None:raise ValueError('audition_video_stream_missing')
    duration=float(raw['format']['duration'])
    if not math.isfinite(duration) or duration<=0:raise ValueError('audition_duration_invalid')
    if not a:raise ValueError('audition_audio_stream_missing')
    original=None
    if render_receipt:
        original=json.loads(pathlib.Path(render_receipt).read_text())
        if original.get('sha256')!=digest:raise ValueError('audition_source_digest_mismatch')
    ts=[min(duration-.08,max(.03,duration*(.04+.92*i/(samples-1)))) for i in range(samples)]
    frames=[frame_at(video,t) for t in ts]
    thumbs=[ImageOps.contain(f,(420,236),Image.Resampling.LANCZOS) for f in frames]
    w,h=444,286
    rows=math.ceil(samples/columns)
    board=Image.new('RGB',(columns*w,rows*h+114),'#121823')
    d=ImageDraw.Draw(board)
    try:font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16)
    except OSError:font=ImageFont.load_default()
    try:big=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',25)
    except OSError:big=font
    d.text((16,12),'FALLEN | CINEMATIC AUDITION BOARD',fill='#fff5df',font=big)
    d.text((16,49),'TECHNICAL SPECIMEN ONLY  |  ARTISTIC APPROVAL NOT GRANTED',
           fill='#f7c280',font=font)
    d.text((16,76),f'Video SHA-256: {digest[:24]}...   Frame samples: {samples}',
           fill='#b5c3d4',font=font)
    differences=[]
    grayscale=[]
    for f in frames:
        mini=f.convert('L').resize((32,18),Image.Resampling.BILINEAR)
        grayscale.append(mini.tobytes())
    for i,(t,thumb) in enumerate(zip(ts,thumbs)):
        x=(i%columns)*w+12;y=(i//columns)*h+114
        board.paste(thumb,(x,y))
        d.text((x,y+243),f'FRAME {i+1:02d}    {t:05.2f}s',fill='#dde6e9',font=font)
        d.text((x,y+265),sha(grayscale[i])[:18],fill='#8eabb6',font=font)
        if i:
            v1,v2=grayscale[i-1],grayscale[i]
            differences.append(round(sum(abs(c-d) for c,d in zip(v1,v2))/len(v1)/255,5))
    board_path=out/'audition-board.jpg'
    board.save(board_path,quality=89,optimize=True)
    speech_engine=original.get('speechEngine') if original else None
    synthetic=(speech_engine in ('espeak','espeak-ng','espeak_scratch_test_only'))
    reference_bound=(original or {}).get('characterIdentityVerified') is True
    voice_bound=(original or {}).get('voiceProfileMatched') is True
    editorial_state='awaiting_real_character_and_voice_audition'
    blockers=[
        'No subjective visual or voice quality is inferred from codec, hashes or pixel activity.',
        'Audience review required for character appeal, staging, anatomy, emotion and storytelling.',
    ]
    if original is None:blockers.append('No hash-bound renderer provenance receipt supplied.')
    if original is not None and not reference_bound:
        blockers.append('No admitted identity/reference-matched character visual.')
    if original is not None and not voice_bound:
        blockers.append('No verified approved character voice.')
    if synthetic:blockers.append('Scratch eSpeak speech must not be presented as a creative vocal performance.')
    result={
        'schema':'evercraft.fallen.toon-audition-board.v1',
        'state':editorial_state,'video':str(video),'sha256':digest,
        'board':str(board_path),'boardSha256':sha(board_path.read_bytes()),
        'probe':{'durationSec':round(duration,3),'width':v.get('width'),'height':v.get('height'),
          'fps':round(rate(v.get('avg_frame_rate')),3),'videoCodec':v.get('codec_name'),
          'audioCodec':a.get('codec_name')},
        'sampleTimesSec':[round(x,3) for x in ts],
        'sampleFrameDigests':[sha(x) for x in grayscale],
        'sampledMotionDifference':differences,
        'speechEngine':speech_engine or 'unknown',
        'technicalVideoDecoded':True,
        'characterAppealVerified':False,'emotionalActingVerified':False,
        'naturalVoiceVerified':False,'identityReferenceVerified':reference_bound,
        'scriptAndPacingApproved':False,'musicAndMixApproved':False,
        'creativeAudienceApproval':False,'publicationAuthority':False,
        'blockers':blockers,
        'evidenceBoundary':'Sampled frame difference is NOT animation quality; all subjective criteria require human audition.'
    }
    (out/'audition-report.json').write_text(json.dumps(result,indent=2)+'\n')
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--video',required=True)
    p.add_argument('--out',required=True)
    p.add_argument('--render-receipt')
    p.add_argument('--samples',type=int,default=9)
    p.add_argument('--columns',type=int,default=3)
    args=p.parse_args()
    print(json.dumps(audition(args.video,args.out,args.render_receipt,args.columns,args.samples),indent=2))
