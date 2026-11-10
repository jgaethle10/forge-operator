#!/usr/bin/env python3
"""An internal, source-pinned Iowa Steinway expressive performance study.

Not an original instrument recording, final master, or human quality approval.
"""
import argparse, hashlib, json, math
from pathlib import Path
import numpy as np
import soundfile as sf

FS=44100
DURATION=35.0
TARGET_ATTACK_RMS_DB={'pp':-33.5,'mf':-29.8}
SOURCE_SHA256={
'Piano.mf.A4.aiff':'800a6be43a44125bda75f7907aba2f6299287b4060d67e85efcf32a226757563',
'Piano.mf.B4.aiff':'9607371977074f8c2f926d3cf6bd4ad5f5d02ae988fcb1d2f308d15967ced2ca',
'Piano.mf.C5.aiff':'68c231a437a0d54004427c723d136814358deea8f913516bee6095ea6c407937',
'Piano.mf.D5.aiff':'8ae26cd843c218e456bd51a4d4494b833e460d2409e36b4e8ed2e72001697bce',
'Piano.mf.G4.aiff':'0bf10e0279d77cec93fe3c6cc47c53c4bab6b650e342b7c4badfa9bc11b9c3e3',
'Piano.pp.B3.aiff':'ce1c8b3c1a4b3619052a7d235ed2a4f5175eeb4fef787cb401f72121897da9f4',
'Piano.pp.B4.aiff':'d7eeac8cf49be7dafb3b15cad5709b158bce7e0f279158cdac16d7dc6efec01d',
'Piano.pp.C4.aiff':'94540df460e6f4b1517d9ae0bb1a1cc5b4b28ffd61106eda3e89475544ee545d',
'Piano.pp.E3.aiff':'0ffda603c58580ffb4ff1245213a5b8a571c040f73c87fba40a99a493d93b9e7',
'Piano.pp.E4.aiff':'3dfb2e26042b3c3352dd0d2911ac37ec9506dc42941cc7d9c89b345bc024e03c',
'Piano.pp.G4.aiff':'b791b4ee88662169f6b5b33e0fc278a7159a4aa9b3f25af3301af1687f10be90',
'Piano.pp.Gb4.aiff':'ec2c76e9b1a1d303b4c2f81c977532a78d1dd64ebbd91346c26b45a07ead8b7d',
}
# 31 authored note events: intentional repetitions transformed rather than
# quantized or repeated 4-chord loops. Physical tempo differences are explicit.
# start, pitch, recording, touch, key-held seconds, overlap, phrase role
EVENTS=[
(.38,'E4','pp',.60,1.23,True,'question'),
(1.83,'G4','pp',.68,.82,True,'question'),
(2.90,'B4','pp',.75,1.80,True,'question'),
(5.10,'A4','mf',.44,.84,False,'delayed-answer'),
(6.09,'Gb4','pp',.45,.56,True,'neighbor'),
(6.83,'G4','pp',.66,1.48,False,'partial-resolution'),
(8.95,'E3','pp',.33,2.72,True,'understatement'),
(9.10,'B3','pp',.27,2.33,True,'understatement'),
(9.28,'E4','pp',.55,.84,True,'motif'),
(10.38,'G4','pp',.59,.75,True,'motif'),
(11.31,'B4','pp',.66,.75,True,'motif'),
(12.21,'C5','mf',.46,.78,True,'turn'),
(13.25,'B4','pp',.59,1.12,False,'turn'),
(14.73,'A4','mf',.44,1.05,False,'unsettled'),
(15.95,'C4','pp',.34,2.67,True,'color-change'),
(16.09,'G4','pp',.47,1.31,True,'color-change'),
(17.60,'B4','mf',.70,.90,True,'reach'),
(18.65,'C5','mf',.64,.62,True,'reach'),
(19.40,'D5','mf',.71,1.89,False,'apex'),
(21.89,'B4','mf',.56,.97,False,'settle'),
(23.09,'A4','mf',.50,.70,False,'settle'),
(24.00,'G4','mf',.56,1.38,False,'settle'),
(25.50,'E3','pp',.31,3.42,True,'home'),
(25.67,'B3','pp',.26,2.20,True,'home'),
(25.85,'E4','pp',.58,1.49,True,'return'),
(27.65,'G4','pp',.57,.76,True,'return'),
(28.62,'A4','mf',.33,.78,True,'passing'),
(29.58,'G4','pp',.50,1.16,False,'return'),
(31.18,'E4','pp',.63,3.13,True,'resolution'),
(31.03,'E3','pp',.26,3.20,True,'resolution'),
(31.30,'B3','pp',.19,2.60,True,'resolution'),
]
def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as f:
  for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
 return h.hexdigest()
def db(value):return 20*math.log10(max(float(value),1e-12))
def onset_start(signal,sr):
 mono=np.mean(signal,axis=1)
 step=round(.006*sr)
 peaks=[]
 for i in range(0,min(len(mono),sr)-step,step):
  x=mono[i:i+step].astype(np.float64)
  peaks.append(math.sqrt(float(np.mean(x*x))))
 x=np.asarray(peaks)
 if not len(x) or not np.isfinite(x).all() or x.max()<1e-6:raise ValueError('source_silent')
 threshold=max(float(x.max())*.13,float(np.median(x[:12]))*7)
 for i in range(len(x)-2):
  if np.all(x[i:i+3]>threshold):
   return max(0,i*step/sr-.012)
 raise ValueError('source_onset_unresolved')
def inspect_sources(source_dir,original_receipt):
 registered={r['sample']:r['sha256'] for r in original_receipt['source_receipts']}
 samples={};calibration={}
 for layer,pitch in sorted({(event[2],event[1]) for event in EVENTS}):
  name=f'Piano.{layer}.{pitch}.aiff';file=Path(source_dir)/name
  if not file.exists() or name not in SOURCE_SHA256 or name not in registered:raise ValueError('source_missing:'+name)
  digest=sha(file)
  if digest!=SOURCE_SHA256[name] or digest!=registered[name]:raise ValueError('source_hash_drift:'+name)
  audio,sr=sf.read(file,always_2d=True,dtype='float32')
  if sr!=FS or audio.shape[1]!=2 or not np.isfinite(audio).all():raise ValueError('invalid_audio:'+name)
  if len(audio)<sr*3:raise ValueError('audio_too_short:'+name)
  early=audio[:int(.12*sr)].astype(np.float64)
  noise=math.sqrt(float(np.mean(early*early)))
  trim=onset_start(audio,sr)
  audio=audio[round(trim*sr):]
  start=audio[int(.10*sr):int(.92*sr)].astype(np.float64)
  rms=math.sqrt(float(np.mean(start*start)))
  margin=db(rms)-db(noise)
  if margin<18:raise ValueError('recording_noise_dominates:'+name)
  gain_db=TARGET_ATTACK_RMS_DB[layer]-db(rms)
  if abs(gain_db)>32:raise ValueError('excessive_sample_gain:'+name)
  gain=10**(gain_db/20)
  samples[layer,pitch]=audio
  calibration[name]={'sha256':digest,'source_onset_trim_ms':round(trim*1000,2),
    'source_attack_rms_db':round(db(rms),2),
    'source_noise_margin_db':round(margin,2),
    'recording_gain_db':round(gain_db,2),
    'gain_linear':round(gain,6)}
 return samples,calibration
def render(samples,calibration,events=EVENTS,duration=DURATION):
 if len(events)<12 or not (1<=duration<=120):raise ValueError('score_invalid')
 out=np.zeros((int(duration*FS),2),dtype=np.float64)
 for t,pitch,layer,touch,held,overlap,_role in events:
  if not (0<=t<duration and .04<=touch<=1 and .15<=held<=5):raise ValueError('event_invalid')
  key=(layer,pitch)
  if key not in samples:raise ValueError('missing_actual_note_recording')
  audio=samples[key];start=round(t*FS)
  release=1.6 if overlap else .58
  count=min(len(audio),len(out)-start,round((held+release*2.8)*FS))
  env=np.ones(count,dtype=np.float64)
  attack=min(round(.005*FS),count)
  if attack:env[:attack]*=np.sin(np.linspace(0,np.pi/2,attack))
  keyoff=min(count,round(held*FS))
  if keyoff<count:
   elapsed=np.arange(count-keyoff)/FS
   env[keyoff:]=np.exp(-3.7*elapsed/release)
  gain=calibration[f'Piano.{layer}.{pitch}.aiff']['gain_linear']*touch*.58
  out[start:start+count]+=audio[:count].astype(np.float64)*gain*env[:,None]
 peak=float(np.max(np.abs(out)))
 if peak<1e-4:raise ValueError('silent_render')
 gain=min(1,.84/peak) if peak>=.28 else min(4,.84/peak)
 out*=gain
 fade=min(round(.3*FS),len(out))
 out[-fade:]*=np.linspace(1,0,fade)[:,None]
 return out.astype(np.float32),{'master_gain_db':round(db(gain),2),
     'peak_after':round(float(np.max(abs(out))),6)}
def main():
 p=argparse.ArgumentParser()
 p.add_argument('--sources',required=True,type=Path)
 p.add_argument('--original-receipt',required=True,type=Path)
 p.add_argument('--out',required=True,type=Path)
 a=p.parse_args()
 old=json.loads(a.original_receipt.read_text())
 bank,cal=inspect_sources(a.sources,old)
 audio,measure=render(bank,cal)
 a.out.mkdir(parents=True,exist_ok=True)
 output=a.out/'Evercraft_The_Last_Light_Real_Steinway_V2.wav'
 sf.write(output,audio,FS,subtype='PCM_24')
 receipt={'schema':'evercraft.sound.recorded-steinway-phrasing-v2.v1',
 'title':'The Last Light / 35s internal acoustic-performance experiment',
 'instrument':'recorded University of Iowa Steinway Model B',
 'source_owned_exclusively_by_evercraft':False,
 'source_page':'https://theremin.music.uiowa.edu/MISPiano.html',
 'source_rights_page':'https://theremin.music.uiowa.edu/MIS.html',
 'reference_changed':False,'human_listening_accepted':False,
 'commercial_release_approved':False,'output_sha256':sha(output),
 'sources':cal,'score':[{'time':e[0],'note':e[1],'dynamic':e[2],
        'touch':e[3],'hold':e[4],'pedal_like_overlap':e[5],'phrase':e[6]} for e in EVENTS],
 'render_measure':measure}
 (a.out/'v2-performance-custody.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print('rendered',output,'sha256',receipt['output_sha256'])
if __name__=='__main__':main()
