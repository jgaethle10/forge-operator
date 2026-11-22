#!/usr/bin/env python3
"""Pacific V28: emulate founder's supplied rhythm without using founder voice.

Founder voice reference is private: 2026-11-22 IMG_7202.mp4.
This job processes NO founder or client media; only approved script and native Bella.
First thought ends, intentional ~1.3s silence, second thought begins.
"""
from pathlib import Path
import json,hashlib
import numpy as np, soundfile as sf, torch
from kokoro import KPipeline
OUT=Path('pacific-v28-private')
RATE=24000
GAP_SECONDS=1.30
FIRST='You probably have places to be.'
REMAINING=('But your car might have other plans. '
           "We've all been there. Thankfully, Pacific can help. "
           "Their crew takes a closer look, figures out what's wrong, and gets to work. "
           "From engines to bodywork, it's about getting you moving again. "
           "Stop by their Yakima shop, or ask about mobile service. "
           "Pacific Service Center. Keeping Yakima moving.")
def synth(p,text,speed,seed):
    np.random.seed(seed);torch.manual_seed(seed)
    parts=[np.asarray(x.audio,dtype=np.float32) for x in p(text,voice='af_bella',speed=speed)]
    if not parts: raise RuntimeError('No Bella audio')
    return np.concatenate(parts)
def edge_trim(audio):
    # Strictly trim silence at the *two* fragment edges; never alter words.
    win=480
    padded=np.pad(audio,(win//2,win//2))
    energy=np.sqrt(np.convolve(padded*padded,np.ones(win)/win,mode='valid'))
    threshold=max(.0014,min(.005, float(np.max(energy))*.07))
    nonzero=np.flatnonzero(energy>threshold)
    if len(nonzero)<100: raise RuntimeError('No audible speech')
    lo=max(0,int(nonzero[0])-round(.06*RATE))
    hi=min(len(audio),int(nonzero[-1])+round(.07*RATE))
    return audio[lo:hi]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    p=KPipeline(lang_code='a')
    rows=[]
    for tag,speed,seed in [('reference_cadence',.97,2801),
                           ('gentle_cadence',1.00,2802)]:
        a=edge_trim(synth(p,FIRST,speed,seed))
        b=edge_trim(synth(p,REMAINING,speed,seed+10))
        gap=np.zeros(round(GAP_SECONDS*RATE),dtype=np.float32)
        joined=np.concatenate([a,gap,b])
        f=OUT/(tag+'.wav')
        sf.write(f,joined,RATE,subtype='PCM_16')
        rows.append({
            'file':f.name,'speed':speed,'voice':'af_bella','seed':seed,
            'first_phrase_duration_seconds':round(len(a)/RATE,3),
            'pause_seconds':round(len(gap)/RATE,3),
            'pause_start_seconds':round(len(a)/RATE,3),
            'pause_end_seconds':round((len(a)+len(gap))/RATE,3),
            'second_part_duration_seconds':round(len(b)/RATE,3),
            'full_voice_duration_seconds':round(len(joined)/RATE,3),
            'sha256':sha(f)
        })
        assert len(joined)/RATE < 29.1, 'Narration too long for 30-second commercial'
        print(json.dumps(rows[-1]),flush=True)
    (OUT/'receipt.json').write_text(json.dumps({
       'schema':'evercraft.pacific.v28.founder-spacing.v1',
       'founder_reference_media':'private; never uploaded',
       'timing_observation':'Approximately 1.3 seconds between the two spoken clauses in founder supplied reference',
       'exact_first_spoken_words':'You probably have places to be',
       'exact_second_spoken_words':'but your car might have other plans',
       'first_script':FIRST,'remaining_script':REMAINING,
       'voice_engine':'Kokoro 0.9.4 af_bella',
       'joins':'One deliberate phrase join with real generated silence, no time stretching',
       'synthesis_is_not_human_approved':True,
       'private_review_only':True,'client_contact':False,'takes':rows
    },indent=2)+'\n')
if __name__=='__main__': main()
