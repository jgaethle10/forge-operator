#!/usr/bin/env python3
"""Voice Foundry: real Kokoro voice audition integrated into a signed World Engine film.
Provisional; no cast/rights/factual/creative/publication approval or model-pin claim.
"""
import hashlib, json, pathlib, subprocess, sys, wave
CUES=[
 ("am_michael",0.40,"May twenty-fourth, nineteen forty-one. Warships meet in the Denmark Strait."),
 ("af_bella",5.30,"Hood and Prince of Wales intercept Bismarck and Prinz Eugen."),
 ("am_michael",10.20,"Just before six, the British ships open fire."),
 ("af_bella",14.55,"Bismarck's guns answer across the cold Atlantic."),
 ("am_michael",19.25,"Around six, Hood is lost in a catastrophic explosion."),
 ("af_bella",24.15,"Of fourteen hundred eighteen aboard, only three survived.")
]
SOURCES=[
 {"title":"Royal Navy, Eightieth anniversary of HMS Hood","url":"https://www.royalnavy.mod.uk/news/2021/may/24/20210524-loss-hood"},
 {"title":"HMS Hood Association, career timeline","url":"https://www.hmshood.org.uk/history/timeline4.htm"},
 {"title":"HMS Hood Association, Denmark Strait engagement analysis","url":"https://www.hmshood.org.uk/history/denmarkstrait/bonomi_denstrait1.htm"}
]
def digest(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def run(a,timeout=220):
 r=subprocess.run(a,capture_output=True,timeout=timeout)
 if r.returncode:raise RuntimeError('command_failed '+str(a[:4])+' '+r.stderr.decode('utf8','replace')[-1200:])
 return r.stdout
def render(silent, out):
 import numpy as np
 import soundfile as sf
 from kokoro import KPipeline
 out.mkdir(parents=True,exist_ok=False)
 silent_receipt=json.loads((silent.parent/'receipt.json').read_text())
 assert silent_receipt['publicationAuthority'] is False
 assert silent_receipt['output']['sha256']==digest(silent)
 assert silent_receipt['output']['durationSec']==30
 assert silent_receipt['output']['frames']==720
 assert len(silent_receipt['sourceProofs'])==3
 assert silent_receipt['pixelQc']['blackFrames']==0
 engine=KPipeline(lang_code='a')
 takes=[]
 for i,(voice,start,words) in enumerate(CUES):
  pieces=[np.asarray(a,dtype=np.float32) for _,_,a in engine(words,voice=voice,speed=1.0)]
  if not pieces:raise RuntimeError('no_neural_audio_'+str(i))
  parts=[]
  for j,p in enumerate(pieces):
   if j:parts.append(np.zeros(2400,dtype=np.float32))
   parts.append(p)
  wav=out/('take-%02d.wav'%(i+1));sf.write(wav,np.concatenate(parts),24000,subtype='PCM_16')
  with wave.open(str(wav),'rb') as f:duration=f.getnframes()/f.getframerate()
  if not 1.0<duration<7.9:raise RuntimeError('invalid_narration_duration_'+str(i)+'_'+str(duration))
  # Neural durations are observed, not assumed. Keep the original authored cue
  # target but slide an overlong take after the previous one, never overlap voices.
  actual_start=max(start, takes[-1]['cueEndSec']+.18 if takes else 0)
  actual_end=actual_start+duration
  print('MEASURED_VOICE_CUE',i,voice,'duration',round(duration,3),'start',round(actual_start,3),'end',round(actual_end,3),flush=True)
  if actual_end>29.85:raise RuntimeError('narration_does_not_fit_30s_review')
  takes.append({'voice':voice,'authoredStartSec':start,'cueSec':round(actual_start,4),'cueEndSec':round(actual_end,4),
   'script':words,'durationSec':round(duration,4),'wav':wav.name,'sha256':digest(wav),'castApproval':False})
 # Combine clean dry speech with NO MUSIC, preserving preview approval gates.
 graph=[]
 for i,item in enumerate(takes):
  ms=int(round(item['cueSec']*1000))
  graph.append('[%d:a]aresample=48000,adelay=%d|%d,aformat=channel_layouts=stereo[s%d];'%(i+1,ms,ms,i))
 graph.append(''.join('[s%d]'%i for i in range(len(CUES)))+'amix=inputs=%d:duration=longest:normalize=0,atrim=0:30,apad=whole_dur=30,loudnorm=I=-16:TP=-1.5:LRA=11[mix]'%len(CUES))
 film=out/'denmark-strait-world-engine-voice-review.mp4'
 args=['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-i',str(silent)]
 for take in takes:args+=['-i',str(out/take['wav'])]
 args+=['-filter_complex',''.join(graph),'-map','0:v:0','-map','[mix]','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-t','30','-movflags','+faststart',str(film)]
 run(args,300)
 info=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(film)]))
 v=next(s for s in info['streams'] if s['codec_type']=='video')
 a=next(s for s in info['streams'] if s['codec_type']=='audio')
 if (v['codec_name']!='h264' or int(v.get('nb_frames',0))!=720 or int(v['width'])!=640 or int(v['height'])!=360 or a['codec_name']!='aac' or int(a['sample_rate'])!=48000 or int(a['channels'])!=2 or abs(float(info['format']['duration'])-30)>.15):raise RuntimeError('final_audiovisual_contract')
 receipt={
  'schema':'evercraft.documentary.denmark-strait.voice-preview.v1',
  'historicalEvent':{'name':'Battle of the Denmark Strait','date':'1941-05-24',
   'principalShips':['HMS Hood','HMS Prince of Wales','Bismarck','Prinz Eugen'],
   'documentedFacts':['British ships engaged German vessels in the early morning','Hood sank after catastrophic explosion','1418 aboard; 3 survived'],
   'approximateClaims':['British fire opened around 05:52','German return fire around 05:55','Hood was lost around 06:00'],
   'notReconstructed':['historically exact individual ship meshes','actual trajectories or maneuver geometry','muzzle flashes, penetrations, explosion mechanism'],
   'references':SOURCES},
  'pictureState':'original_WORLD_ENGINE_WebGPU_pixels_but_GENERIC_PROCEDURAL_SHIP_proxy_only',
  'sourceFilmSha256':digest(silent),'sourceProofs':silent_receipt['sourceProofs'],
  'voiceEngine':'Evercraft Voice Foundry experimental Kokoro KPipeline',
  'voiceModelCheckpointPinned':False,'speakerRightsVerified':False,'narrationScriptAccuracyHumanReviewed':False,
  'narrationTakes':takes,'finishedFilm':{'file':film.name,'sha256':digest(film),'durationSec':30,'fps':24,'frames':720,'resolution':'640x360','audio':'48kHz stereo AAC no score'},
  'creativeApproval':False,'historicalApproval':False,'clientApproval':False,'publicationAuthority':False,
  'limitations':['Original scene geometry is NOT authentic to the four named vessels',
                 'Repeated existing GPU angles, not a simulated four-ship battle',
                 'No approved acting or soundtrack; model/dataset voice rights unresolved',
                 'Low-resolution educational preview, not a commercial master']
 }
 (out/'historical-narration-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps({'status':'internal_voice_enabled_documentary_preview','film':receipt['finishedFilm'],'publicationAuthority':False}))
if __name__=='__main__':
 if sys.argv[1:]==['--verify-plan']:
  assert len(CUES)==6 and len(SOURCES)==3 and all(v in ('af_bella','am_michael') and 0<=s<30 and 4<len(t.split())<20 for v,s,t in CUES)
  print('DOCUMENTARY_PLAN_OK 6 historical voice cues 2 founder-shortlisted speakers');sys.exit(0)
 if len(sys.argv)!=3:raise SystemExit('USAGE: script.py signed_silent_timeline.mp4 NEW_DIRECTORY')
 render(pathlib.Path(sys.argv[1]).resolve(),pathlib.Path(sys.argv[2]).resolve())
