#!/usr/bin/env python3
"""Voice Foundry: human-directed word-final pitch-contour repair with Praat PSOLA.
A selected, authorized dry voice audition is required. Does not generate,
clone, approve or publish any voice. Boundaries are set by the human editor.
"""
import argparse,hashlib,json
from pathlib import Path
import numpy as np,parselmouth,soundfile as sf
from parselmouth.praat import call

def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def repair(source,dest,*,pitch_start,pitch_end,fade_start,fade_end,target_final_hz):
  source,dest=Path(source),Path(dest)
  if source.resolve()==dest.resolve():raise ValueError('never_overwrite_source')
  original,sr=sf.read(source)
  if original.ndim!=1 or sr<16000:raise ValueError('mono_voice_audio_required')
  duration=len(original)/sr
  if not 0<=fade_start<fade_end<=pitch_start<pitch_end<duration:raise ValueError('manual_bounds_invalid')
  if not 70<=target_final_hz<=350:raise ValueError('target_pitch_out_of_range')
  manipulation=call(parselmouth.Sound(str(source)),'To Manipulation',.01,85,550)
  tier=call(manipulation,'Extract pitch tier')
  pts=[(float(call(tier,'Get time from index',i)),float(call(tier,'Get value at index',i)))
       for i in range(1,int(call(tier,'Get number of points'))+1)]
  region=[(t,v) for t,v in pts if pitch_start<=t<=pitch_end]
  if len(region)<4:raise ValueError('insufficient_voiced_tail')
  start_hz=float(np.interp(pitch_start,*[np.array(z) for z in zip(*pts)]))
  if target_final_hz>=start_hz:raise ValueError('target_not_falling')
  for i in range(len(pts),0,-1):
    if pitch_start<=pts[i-1][0]<=pitch_end:call(tier,'Remove point',i)
  for t,_ in region:
    u=np.clip((t-pitch_start)/(pitch_end-pitch_start),0,1)
    eased=u*u*(3-2*u)
    call(tier,'Add point',float(t),float(start_hz+(target_final_hz-start_hz)*eased))
  call([manipulation,tier],'Replace pitch tier')
  rendered=call(manipulation,'Get resynthesis (overlap-add)').values[0]
  if len(rendered)!=len(original):raise RuntimeError('duration_drift')
  a,b=round(sr*fade_start),round(sr*fade_end)
  mix=np.array(original,copy=True)
  alpha=np.linspace(0,1,b-a);alpha=alpha*alpha*(3-2*alpha)
  mix[a:b]=(1-alpha)*original[a:b]+alpha*rendered[a:b]
  mix[b:]=rendered[b:]
  if not np.array_equal(mix[:a],original[:a]):raise RuntimeError('prefix_mutated')
  if np.max(np.abs(mix))>=.98:raise RuntimeError('clipping')
  dest.parent.mkdir(parents=True,exist_ok=True)
  sf.write(dest,mix,sr,subtype='PCM_16')
  p=parselmouth.Sound(str(dest)).to_pitch(time_step=.01,pitch_floor=85,pitch_ceiling=550)
  f0=[p.get_value_at_time(t) for t in (pitch_start+.02,pitch_end-.02)]
  if not all(np.isfinite(x) for x in f0) or f0[1]>=f0[0]:raise RuntimeError('tail_not_falling')
  return {'schema':'evercraft.voice-foundry.local-cadence-review.v1',
    'sourceSha256':digest(source),'outputSha256':digest(dest),
    'preservedPrefixThroughSec':fade_start,'editedRegion':[pitch_start,pitch_end],
    'finalF0Hz':[round(v,1) for v in f0],'newVoiceGenerated':False,
    'humanQualityApproved':False,'commercialRightsCleared':False,
    'publicationAuthorized':False}

if __name__=='__main__':
  p=argparse.ArgumentParser()
  p.add_argument('source');p.add_argument('output')
  for f in ('pitch-start','pitch-end','fade-start','fade-end','target-final-hz'):
    p.add_argument('--'+f,type=float,required=True)
  a=p.parse_args()
  print(json.dumps(repair(a.source,a.output,pitch_start=a.pitch_start,pitch_end=a.pitch_end,
    fade_start=a.fade_start,fade_end=a.fade_end,target_final_hz=a.target_final_hz),indent=2))
