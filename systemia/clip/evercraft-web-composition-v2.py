#!/usr/bin/env python3
"""Evercraft original melodic composition study, recorded CC0 notes, HUMAN AUDITION ONLY."""
import hashlib,importlib.util,json,math,os
from pathlib import Path
from fractions import Fraction
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly,butter,sosfiltfilt

HERE=Path(__file__).parent
def load(name,filename):
 spec=importlib.util.spec_from_file_location(name,HERE/filename)
 m=importlib.util.module_from_spec(spec)
 spec.loader.exec_module(m)
 return m
P=load('evercraft_piano','evercraft-real-piano-audition.py')
C=load('evercraft_cello','evercraft-web-recorded-cello-audition.py')
FS=48000
BPM=[74,76,78,75,70,75,79,67]
HARMONY=["Dm(add9)","Bbmaj7","Fmaj9/A","Csus4-C","Gm9","Bbmaj7","C(add9)","F6/9"]
CHORDS=[[50,57,62,64],[46,53,57,62],[45,53,60,67],[48,55,60,65],
        [43,50,58,62],[46,53,57,62],[48,55,62,64],[41,48,57,62]]
# Varied left hand with deliberate missing notes and silence; each bar is different.
PATTERNS=[
 [(0.02,0,3.4),(.88,1,1.56),(2.18,2,1.06)],
 [(.08,0,3.50),(1.31,2,1.06),(2.43,3,1.20)],
 [(.01,0,3.20),(.62,1,2.01),(1.69,2,1.23),(2.92,3,.94)],
 [(.06,0,3.24),(1.64,2,1.08),(2.94,3,.90)],
 [(.03,0,3.12),(1.09,1,1.67),(2.42,2,1.16)],
 [(.04,0,3.31),(1.56,2,1.26),(2.64,1,1.08)],
 [(.02,0,3.25),(.87,1,2.11),(2.08,3,1.27)],
 [(.04,0,3.65),(.75,1,2.86),(1.48,2,2.22),(2.74,3,1.44)]]
# A question motif, inversion and expansion, then F-major resolution.
MELODY=[
 (.35,74,58,.52),(1.12,77,73,.95),(2.28,76,55,.56),(2.90,69,47,.72),
 (4.28,72,54,.55),(5.09,74,65,.76),(6.13,69,51,.83),(7.11,65,42,.43),
 (8.16,69,55,.63),(9.04,72,64,.76),(10.20,74,71,.85),(11.28,72,53,.55),
 (12.32,67,49,.72),(13.27,69,60,.59),(14.12,67,48,.70),(15.22,64,40,.55),
 (16.46,70,62,.70),(17.49,74,72,1.02),(18.83,72,58,.78),
 (20.25,74,60,.65),(21.13,77,82,1.15),(22.66,74,63,.84),
 (24.29,72,59,.62),(25.10,76,77,.92),(26.25,74,57,.51),(27.14,67,45,.52),
 (28.44,69,55,.65),(29.25,72,66,.81),(30.13,77,78,2.1)]
REPLIES=[(3.18,65,33,.55),(7.28,62,35,.61),(11.40,67,37,.59),
         (15.10,60,31,.72),(19.25,65,39,.8),(23.05,69,40,.53)]
# Melodic cello RESPONSES. Nine note starts across two articulated phrases.
CELLO=[
 (9.38,53,50,'C3_p_g.wav',48,1.20,.57),
 (10.92,55,56,'C3_mp_d.wav',48,1.07,.73),
 (12.30,57,49,'A3_p_g.wav',57,1.31,.54),
 (14.03,55,52,'C3_mp_g.wav',48,1.25,.63),
 (19.85,58,55,'Gb2_mp_d.wav',42,1.26,.58),
 (21.39,60,65,'C3_mp_g.wav',48,1.09,.67),
 (22.83,57,53,'A3_p_d.wav',57,1.16,.55),
 (26.25,55,50,'C3_p_g.wav',48,1.12,.52),
 (27.66,53,47,'C3_p_d.wav',48,1.41,.55),
 (29.52,57,50,'A3_p_g.wav',57,2.0,.49)]
def sec(beat):
 b=min(7,int(beat//4))
 return sum(4*60/p for p in BPM[:b])+(beat-4*b)*60/BPM[b]
DURATION=sec(32)+2.1
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def stereo(path):
 a,sr=sf.read(path,dtype='float32',always_2d=True)
 if a.shape[1]==1:a=np.repeat(a,2,axis=1)
 if a.shape[1]!=2:raise ValueError('unexpected channels')
 return a,sr
def add(out,a,at,hold,gain,pan,attack,release):
 start=int(at*FS)
 count=min(len(a),len(out)-start)
 if count<=0:return
 t=np.arange(count,dtype=np.float32)/FS
 env=np.minimum(1,t/max(attack,.001))*np.exp(-4.7*np.maximum(0,t-hold)/max(release,.04))
 gains=np.array([math.sqrt(1-pan),math.sqrt(1+pan)],dtype=np.float32)
 out[start:start+count]+=a[:count]*env[:,None]*gain*gains
def render(out):
 out=Path(out);out.mkdir(parents=True,exist_ok=True)
 cache=out/'source-cache'
 n=int(DURATION*FS);piano=np.zeros((n,2),dtype=np.float32)
 pinputs={};cinputs={};score=[]
 def note(beat,pitch,vel,held,part):
  name=f'INSPiano_Vel0{P.layer(vel)}_{P.note_name(pitch)}_01.ogg'
  file=cache/'piano'/name
  if name not in pinputs:
   sha,size=P.fetch(name,cache/'piano')
   pinputs[name]={'sha256':sha,'bytes':size}
  a,sr=stereo(file)
  if sr!=FS:raise ValueError('sample rate mismatch')
  pan={'bass':-.22,'harmony':-.09,'lead':.13,'reply':.04}[part]
  vol=.48*(.38+.62*(vel/127)**1.65)
  add(piano,a,sec(beat),held*60/BPM[min(7,int(beat//4))],vol,pan,.006,.37)
  score.append({'beat':beat,'pitch':pitch,'velocity':vel,'duration_beats':held,'part':part})
 for bar,voicing in enumerate(CHORDS):
  base=39 if bar in (0,1,4) else 43 if bar in (2,3,6) else 51
  for i,(offset,voice,length) in enumerate(PATTERNS[bar]):
   note(bar*4+offset,voicing[voice],base-[0,6,10,12][i],length,
        'bass' if voice==0 else 'harmony')
 for row in MELODY:note(*row,'lead')
 for row in REPLIES:note(*row,'reply')
 hpf=butter(2,30,fs=FS,btype='highpass',output='sos')
 for ch in range(2):piano[:,ch]=sosfiltfilt(hpf,piano[:,ch]).astype(np.float32)
 f=int(.82*FS);piano[-f:]*=np.linspace(1,0,f,dtype=np.float32)[:,None]
 peak=np.max(np.abs(piano))
 if peak<.002:raise ValueError('silent instrument')
 if peak>.83:piano*=.83/peak
 pa=out/'A_NEW_MELODY_piano-only_REVIEW.wav'
 sf.write(pa,piano,FS,subtype='PCM_24')
 cello=np.zeros_like(piano)
 for beat,target,vel,name,source,held,exp in CELLO:
  src=cache/'cello'/name
  if name not in cinputs:
   src=C.load_recorded(name,cache/'cello')
   cinputs[name]={'sha256':digest(src),'bytes':src.stat().st_size}
  a,sr=stereo(src)
  ratio=FS/sr*2**((source-target)/12)
  f=Fraction(ratio).limit_denominator(1800)
  a=resample_poly(a,f.numerator,f.denominator,axis=0).astype('float32')
  add(cello,a,sec(beat),held*60/BPM[min(7,int(beat//4))],
      .28*(.4+.6*vel/127)*exp,-.24,.165,.33)
 mix=piano+cello
 pk=np.max(np.abs(mix))
 if pk>.83:mix*=.83/pk
 pb=out/'B_NEW_MELODY_piano-cello-answers_REVIEW.wav'
 sf.write(pb,mix,FS,subtype='PCM_24')
 receipt={'schema':'evercraft.music.melodic-composition-study.v2',
  'status':'HUMAN_LISTENING_NOT_APPROVED','commercial_release':False,
  'production_customer_access_approved':False,'source':'recorded real piano and cello notes',
  'source_commits':{'piano':P.SOURCE_SHA,'cello':C.CELLO_REV},
  'source_rights':{'piano':'CC0 1.0','cello':'CC0 1.0'},
  'duration_seconds':round(DURATION,3),'form':'question / development / reply / resolution',
  'tempo_bpm_by_bar':BPM,'harmonies':HARMONY,'melody_events':len(MELODY),
  'bowed_cello_countermelody_events':len(CELLO),
  'note_score':score,'source_digests':{'piano':pinputs,'cello':cinputs},
  'outputs':[{'filename':x.name,'sha256':digest(x),'bytes':x.stat().st_size}
             for x in [pa,pb]],
  'original_piano_reference_preserved_as_prior_review_in_separate_pack':True,
  'human_music_approval':False}
 (out/'composition-proof.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps({'rendered':True,'output_count':2,'duration_seconds':round(DURATION,3),
      'sample_count':len(pinputs)+len(cinputs),'human_approval':False},indent=2))
if __name__=='__main__':
 render(os.environ.get('EVERCRAFT_MUSIC_OUTPUT','artifacts/evercraft-web-composition-v2'))
