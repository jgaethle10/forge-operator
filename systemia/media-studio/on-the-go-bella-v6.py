#!/usr/bin/env python3
"""A-led Kokoro/Bella prosody auditions for Juan's On The Go commercial.
Private auditions only, not client-approved or publication-ready.
"""
import hashlib,json,pathlib,sys
SR=24000
TAKES={
 "A1_warm_curiosity":[
  (0.55,0.99,"An oil change shouldn't take over your afternoon. You're busy, and the last thing you need is another trip across town. So, what if the service came to you?"),
  (11.05,0.97,"That's what Juan does with On The Go Quick Lube. Oil changes, filters, brake service. He brings the work to your location while you get on with your day."),
  (21.35,0.98,"No sitting around a waiting room. Just real service, on your schedule. On The Go Quick Lube. Let us come to you.")],
 "A2_warm_grounded":[
  (0.55,0.98,"Your day doesn't stop just because your car needs attention. Meetings, errands, family... there's always something next. That's why Juan brings the service right to you."),
  (10.80,1.00,"At On The Go Quick Lube, Juan handles oil changes, filters, and brake service right where your vehicle is. You keep moving through your day, and he handles the work."),
  (21.20,0.97,"And when it's done, you're right where you needed to be. On The Go Quick Lube. Let us come to you.")]
}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify():
 assert len(TAKES)==2
 for name,blocks in TAKES.items():
  assert len(blocks)==3 and blocks[0][0]==0.55
  assert [x[0] for x in blocks]==sorted(x[0] for x in blocks)
  for start,speed,words in blocks:
   assert 0<=start<30 and 0.94<=speed<=1.03
   assert len(words.split())>=18 and '—' not in words and '–' not in words
  print(name,sum(len(words.split()) for _,_,words in blocks),'words')
 print('PASS: Bella native A-led prosody v6 preflight')
def generate(outdir):
 verify()
 import torch,numpy as np,soundfile as sf
 from kokoro import KPipeline
 root=pathlib.Path(outdir);root.mkdir(parents=True,exist_ok=False)
 pipe=KPipeline(lang_code='a')
 takes=[]
 for index,(name,blocks) in enumerate(TAKES.items()):
  master=np.zeros(30*SR,dtype=np.float32);parts=[]
  for i,(start,speed,words) in enumerate(blocks):
   torch.manual_seed(1701+index*31+i);np.random.seed(1701+index*31+i)
   items=[np.asarray(x.audio,dtype=np.float32) for x in pipe(words,voice='af_bella',speed=speed)]
   if not items:raise RuntimeError('EMPTY_AUDIO '+name)
   audio=np.concatenate(items);duration=len(audio)/SR
   next_start=blocks[i+1][0] if i<2 else 30.
   if duration+start>next_start-0.10:raise RuntimeError(f'VOICE_TIMING_FAILED_CLOSED {name} paragraph {i+1}: {duration:.3f} seconds, slot {next_start-start:.3f}')
   if not np.all(np.isfinite(audio)) or np.max(np.abs(audio))>1.001:raise RuntimeError('BAD_SIGNAL '+name)
   wav=root/f'{name}_paragraph_{i+1}.wav';sf.write(wav,audio,SR,subtype='PCM_16')
   offset=round(start*SR);master[offset:offset+len(audio)]+=audio
   parts.append(dict(startSec=start,durationSec=round(duration,3),speed=speed,script=words,filename=wav.name,sha256=sha(wav),pauseUntilNextSec=round(next_start-start-duration,3)))
  if np.max(np.abs(master))>1:raise RuntimeError('CLIP '+name)
  final=root/f'{name}_30s.wav';sf.write(final,master,SR,subtype='PCM_16')
  takes.append(dict(id=name,masterFile=final.name,masterSha256=sha(final),parts=parts))
 receipt=dict(schema='evercraft.voice-foundry.onthego.prosody-v6.v1',
  referenceAudition='A_warm_conversational',voiceId='af_bella',model='Kokoro-82M',
  kokoroVersion='0.9.4',originalNativeVoice=True,timbreBlends=False,
  pitchEffects=False,sampleRate=SR,durationSec=30,auditions=takes,
  humanListeningApproved=False,clientApproved=False,published=False)
 (root/'evidence.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps(dict(status='READY_FOR_HUMAN_LISTENING',takes=[
  dict(id=t['id'],durations=[p['durationSec'] for p in t['parts']],
       gaps=[p['pauseUntilNextSec'] for p in t['parts']]) for t in takes]),indent=2))
if __name__=='__main__':
 if len(sys.argv)==2 and sys.argv[1]=='--verify-only':verify()
 elif len(sys.argv)==2:generate(sys.argv[1])
 else:raise SystemExit('Usage: on-the-go-bella-v6.py <new-dir>|--verify-only')
