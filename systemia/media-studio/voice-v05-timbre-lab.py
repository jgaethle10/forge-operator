#!/usr/bin/env python3
"""Private V05 identity study: preserve original Bella, never edit Kokoro phonemes."""
import argparse
import hashlib
import html
import json
import pathlib
import re
import subprocess
import wave

VOICE_A = 'af_bella'
VOICE_B = 'af_heart'
CANONICAL = 'This is Evercraft, and this is only the beginning.'
CONTROLLED_SEED = 1701
SCENES = (
    ('tagline', CANONICAL),
    ('commercial', "Good ideas don't need louder promises. They need people who show up, do the work, and get it right. That's how trust is built. And it's why Evercraft exists."),
)
# Each coefficient is the af_heart voice-vector weight. Remaining weight is V05.
TAKES = (
    ('A', 0., False), ('B', .05, False), ('C', .10, False),
    ('D', .20, False), ('E', 1., False), ('F', 0., True)
)

def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for part in iter(lambda:f.read(1048576), b''):
            h.update(part)
    return h.hexdigest()

def words(text):
    return re.findall(r"[^\W_]+(?:'[^\W_]+)?", text.casefold(), re.UNICODE)

def validate():
    assert VOICE_A == 'af_bella' and VOICE_B == 'af_heart'
    assert len(TAKES) == 6 and len(SCENES) == 2
    assert len(set(x[0] for x in TAKES)) == 6
    assert [x[1] for x in TAKES] == [0., .05, .10, .20, 1., 0.]
    assert sum(x[2] for x in TAKES) == 1
    assert SCENES[0][1] == CANONICAL
    assert CONTROLLED_SEED == 1701
    assert all(words(script).count('evercraft') == 1 for _,script in SCENES)
    print('12 controlled neural audition takes; phoneme overrides prohibited; pure Bella restored')

def metrics(path):
    with wave.open(str(path), 'rb') as w:
        n,rate = w.getnframes(), w.getframerate()
        if w.getnchannels() != 1 or w.getsampwidth() != 2 or rate != 24000 or not (1.5<n/rate<55):
            raise RuntimeError('Invalid neural recording ' + path.name)
    return {'sampleRate':rate, 'durationSec':round(n/rate,3), 'frames':n}

def render(folder):
    validate()
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline
    out = pathlib.Path(folder)
    out.mkdir(parents=True, exist_ok=False)
    pipeline = KPipeline(lang_code='a')
    bella = pipeline.load_voice(VOICE_A).cpu().float()
    heart = pipeline.load_voice(VOICE_B).cpu().float()
    if bella.shape != heart.shape or bella.ndim not in (2,3):
        raise RuntimeError('Incompatible Kokoro voice packs')
    if not torch.isfinite(bella).all() or not torch.isfinite(heart).all() or torch.equal(bella, heart):
        raise RuntimeError('Unexpected voice embeddings')
    report = {
      'schema':'evercraft.voice-foundry.v05-timbre-listening-study.v1',
      'status':'private_unapproved_human_listening_required',
      'control':'Pure af_bella via full-text KPipeline; no phoneme or stress override',
      'model':'Kokoro-82M, kokoro==0.9.4; model loaded at runtime',
      'modelCheckpointDigestIndependentlyPinned':False,
      'originalShootout':'https://github.com/jgaethle10/forge-operator/actions/runs/39464600851',
      'originalV05WavSha256':'eac576dc30d5a5e684241de1e7bd187b5f6d3d0f00d39eb413c31255eeb33a14',
      'blendMethod':'torch.lerp(bella,heart,heartWeight) in voice embedding, not output WAV mixing',
      'controlledSeedResetBeforeEveryTake':CONTROLLED_SEED,
      'reproducibilityMustBeBitwiseExact':True,
      'lexicalTextChangedAcrossCandidates':False,
      'originalPhonemeTokensModified':False,
      'humanNaturalnessImprovementVerified':False,
      'sameVoiceIdentityEstablishedForBlends':False,
      'voiceAndModelCommercialRightsIndependentlyVerified':False,
      'commercialPublicationAuthorized':False,
      'auditions':[], 'reproducibilityChecks':[]
    }
    for scene,script in SCENES:
        # Audit natural Kokoro G2P but DO NOT pass edited tokens to synthesis.
        _,tokens = pipeline.g2p(script)
        brand = [str(t.phonemes) for t in tokens
                 if re.sub('[^a-z]','',str(t.text).lower()) == 'evercraft']
        if len(brand) != 1:
            raise RuntimeError('Ambiguous Evercraft token: ' + repr(brand))
        repeat_reference = {}
        for label,weight,repeat in TAKES:
            name = scene+'-'+label
            voice = VOICE_A if weight == 0 else VOICE_B if weight == 1 else torch.lerp(bella,heart,weight).contiguous()
            if isinstance(voice,torch.Tensor) and not torch.isfinite(voice).all():
                raise RuntimeError('Nonfinite blend tensor')
            # Equalize stochastic conditions so 5% timbre blends are not confounded by a different random draw.
            torch.manual_seed(CONTROLLED_SEED)
            np.random.seed(CONTROLLED_SEED)
            pieces = [np.asarray(result.audio,dtype=np.float32)
                      for result in pipeline(script,voice=voice,speed=1.0)]
            if not pieces:
                raise RuntimeError('No neural audio for '+name)
            samples = np.concatenate([x for i,p in enumerate(pieces)
                                      for x in ((np.zeros(2400,dtype=np.float32),p) if i else (p,))])
            wav,mp3 = out/(name+'.wav'),out/(name+'.mp3')
            sf.write(wav,samples,24000,subtype='PCM_16')
            info = metrics(wav)
            subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-i',str(wav),
                '-af','loudnorm=I=-16:TP=-1.5:LRA=11','-codec:a','libmp3lame','-q:a','3',str(mp3)],
                timeout=90,check=True)
            if not mp3.exists() or mp3.stat().st_size<1000:
                raise RuntimeError('Failed to generate preview '+name)
            report['auditions'].append({
              'id':name, 'scene':scene, 'script':script, 'heartWeight':weight,
              'bellaWeight':1-weight, 'duplicatePureBellaControl':repeat,
              'randomSeed':CONTROLLED_SEED,
              'originalG2pBrandPhonemes':brand[0], 'g2pMutation':False,
              'wavSha256':sha256(wav), 'mp3Sha256':sha256(mp3),
              'chunkCount':len(pieces),**info
            })
            if label in ('A','F'):
                repeat_reference[label] = samples
        a,b = repeat_reference['A'],repeat_reference['F']
        same = len(a)==len(b)
        corr = float(np.corrcoef(a,b)[0,1]) if same and len(a)>1 else None
        if not same or not np.array_equal(a,b):
            raise RuntimeError('Repeated pure V05 control failed fixed-seed bitwise parity: '+scene)
        report['reproducibilityChecks'].append({
          'scene':scene, 'sameFrameCount':same,
          'sampleCorrelation':round(corr,7) if corr is not None else None,
          'bitwiseEqual':bool(np.array_equal(a,b))
        })
    (out/'evidence.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    blocks = []
    for scene,script in SCENES:
        audios = ''.join('<article><h3>Take '+label+'</h3><audio controls preload="metadata" src="'+
                         scene+'-'+label+'.mp3"></audio></article>' for label,_,_ in TAKES)
        blocks.append('<section><h2>'+html.escape(scene.title())+'</h2><p>'+
                      html.escape(script)+'</p>'+audios+'</section>')
    page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evercraft V05 Identity Audition</title><style>body{max-width:820px;margin:30px auto;padding:0 20px;background:#111b2b;color:#f1f5ff;font:16px/1.5 system-ui}section{padding:20px;border:1px solid #66758c;border-radius:14px;margin:20px 0}article{background:#253248;padding:14px;border-radius:10px;margin:12px 0}audio{width:100%}p{color:#ccd8ec}</style>
<h1>V05: Original voice versus subtle identity variants</h1>
<p>Listen before inspecting evidence.json. Six takes share the exact words in each scene. Includes the untouched V05, low-level voice embedding blends, the existing V02 and a duplicate baseline for reproducibility. These are NOT accepted improvements. Some blends may change the speaker identity or accent.</p>'''+''.join(blocks)+'''
<p>Rate the brand word, vowel transitions, cadence, meaning and similarity to original Bella. Use phone and headphones. Dry WAV originals, normalized MP3s and provenance receipts are included. No voice is approved for publication.</p></html>'''
    (out/'index.html').write_text(page)
    print(json.dumps({'rendered':len(report['auditions']),
         'status':report['status'],'reproducibility':report['reproducibilityChecks']}))

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('out_dir',nargs='?')
    p.add_argument('--verify-only',action='store_true')
    opt=p.parse_args()
    if opt.verify_only:validate()
    elif opt.out_dir:render(opt.out_dir)
    else:p.error('Provide a fresh output directory or --verify-only')
