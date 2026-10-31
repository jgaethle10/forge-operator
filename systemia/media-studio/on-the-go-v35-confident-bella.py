#!/usr/bin/env python3
"""Evercraft On The Go V35 private Bella confident-intention voice auditions.
Generate uninterrupted native phrases. No pitch bending, word splices or picture changes.
Approval required before master replacement or client delivery.
"""
import hashlib, json, pathlib
import numpy as np, torch, soundfile as sf
from kokoro import KPipeline
root = pathlib.Path('otg-v35-confident-voice-review')
root.mkdir(parents=True, exist_ok=True)
takes = [
 ('service_firm_bella','From oil changes and filters to BRAKE service.',1.05,'af_bella'),
 ('service_fluid_bella','From oil changes and filters to brake service.',1.09,'af_bella'),
 ('service_warm_bella','From oil changes and filters to BRAKE service.',1.07,'af_bella(0.80)+af_heart(0.20)'),
 ('closing_grounded_bella','On The Go Mobile Quick Lube. Let us come to you. Thank you.',1.04,'af_bella'),
 ('closing_steady_bella','On The Go Mobile Quick Lube. Let us come to YOU. Thank you.',1.06,'af_bella'),
 ('closing_warm_bella','On The Go Mobile Quick Lube. Let us come to YOU. Thank you.',1.04,'af_bella(0.80)+af_heart(0.20)'),
 ('closing_direct_bella','On The Go Mobile Quick Lube. Let us come to you.',1.04,'af_bella'),
]
pipe = KPipeline(lang_code='a')
results=[]
for idx,(name,script,speed,voice) in enumerate(takes):
    torch.manual_seed(3500+idx*53)
    np.random.seed(3500+idx*53)
    chunks=list(pipe(script,voice=voice,speed=speed))
    if not chunks: raise RuntimeError('EMPTY '+name)
    audio=np.concatenate([np.asarray(c.audio,dtype=np.float32) for c in chunks])
    phonemes=' '.join(str(getattr(c,'phonemes','')) for c in chunks)
    if not np.isfinite(audio).all() or np.max(np.abs(audio))>1.0001:
        raise RuntimeError('INVALID '+name)
    duration=len(audio)/24000
    if duration>7.5: raise RuntimeError('TOO_LONG '+name+' '+str(duration))
    wav=root/(name+'.wav')
    sf.write(wav,audio,24000,subtype='PCM_16')
    results.append({'name':name,'text':script,'speed':speed,'voice':voice,
       'seconds':round(duration,3),'phonemes':phonemes,
       'sha256':hashlib.sha256(wav.read_bytes()).hexdigest()})
(root/'manifest.json').write_text(json.dumps({
 'schema':'evercraft.commercial.onthego.v35-confidence-auditions',
 'purpose':'Firm declarative endings, warm tone, BRAKE emphasis, full brand pronunciation',
 'preserve':'V34 picture, V33 guitar and end card; private owner review only',
 'human_listening_approved':False,'client_approved':False,'sent':False,'published':False,
 'takes':results},indent=2)+'\n')
print(json.dumps(results,indent=2))
