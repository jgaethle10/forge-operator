#!/usr/bin/env python3
"""Private Relay RC21 native Bella speech-intention auditions.
Seven original scripts x two punctuation directions, no phoneme edits."""
import pathlib,json,hashlib,re,sys,wave
LINES=[
('a01','Everyone leaves the meeting feeling certain.','Everyone leaves the meeting, feeling certain.','Quiet confident observation'),
('a02','Until the same date means two different things.','Until... the same date means two different things.','Discovery interrupts certainty'),
('a03','One plan begins. Another waits for permits.','One plan begins; another waits for permits.','Second plan contradicts the first'),
('a04',"Most mistakes don't announce themselves.","Most mistakes... don't announce themselves.",'Private warning, not movie-trailer danger'),
('a05',"Relay finds the difference while there's still time to fix it.","Relay finds the difference, while there's still time to fix it.",'Relief replaces uncertainty'),
('a06','One clear decision. Shared by everyone.','One clear decision... shared by everyone.','Collective resolution'),
('a07','Relay. Clarity before consequences.','Relay... clarity before consequences.','Intimate confident conclusion')
]
SPEED={'a01':(.99,1.),'a02':(1.,1.02),'a03':(1.,.98),'a04':(.98,.98),'a05':(1.02,1.04),'a06':(1.,1.01),'a07':(.97,.99)}
def words(s): return re.findall(r"[a-z0-9']+",s.casefold())
def verify():
 assert len(LINES)==7
 for key,original,conversational,_ in LINES:
  assert words(original)==words(conversational),key
  assert '—' not in conversational
 print('7 lines: original words preserved for both punctuated directions')
def generate(out):
 verify()
 import numpy as np,torch,soundfile as sf
 from kokoro import KPipeline
 out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=False)
 pipe=KPipeline(lang_code='a');takes=[]
 for i,(key,original,conversational,note) in enumerate(LINES):
  for j,(name,txt) in enumerate((('original',original),('conversational',conversational))):
   seed=21200+i*9+j
   torch.manual_seed(seed);np.random.seed(seed)
   speed=SPEED[key][j]
   chunks=[np.asarray(c.audio,dtype=np.float32) for c in pipe(txt,voice='af_bella',speed=speed)]
   if not chunks:raise RuntimeError('no audio '+key+name)
   samples=np.concatenate(chunks)
   if not np.isfinite(samples).all():raise RuntimeError('non-finite audio')
   f=out/f'{key}_{name}.wav';sf.write(f,samples,24000,subtype='PCM_16')
   with wave.open(str(f),'rb') as w:
    dur=w.getnframes()/w.getframerate()
    assert w.getnchannels()==1 and w.getframerate()==24000 and 1.<dur<9.
   takes.append({'line':key,'variant':name,'sourceText':txt,'intention':note,
    'speed':speed,'seed':seed,'durationSec':round(dur,3),'filename':f.name,
    'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'wordsUnchanged':True})
 ev={'schema':'evercraft.voice-foundry.relay21.conversational-native.v1',
  'model':'Kokoro 0.9.4','voiceId':'af_bella','nativeNeuralGeneration':True,
  'phonemeOverrides':False,'timbreBlends':False,'pitchPostProcessing':False,
  'founderApproved':False,'humanListeningApproved':False,'published':False,'takes':takes}
 (out/'evidence.json').write_text(json.dumps(ev,indent=2)+'\n')
 print(json.dumps({'status':'GENERATED','takes':len(takes),'voice':ev['voiceId']},indent=2))
if __name__=='__main__':
 if len(sys.argv)==2 and sys.argv[1]=='--verify-only':verify()
 elif len(sys.argv)==2:generate(sys.argv[1])
 else:raise SystemExit('Usage: relay-voice21-native-study.py --verify-only|outdir')
