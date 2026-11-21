#!/usr/bin/env python3
"""Replay a CAPTURED human MIDI take with CC0 recorded piano samples.
Does not compose, quantize, invent notes, approve music or publish anything.
Microphone recordings remain the preferred direct record of acoustic performance.
"""
import argparse,hashlib,json,math
from collections import defaultdict,deque
from pathlib import Path
from urllib.request import Request,urlopen
import numpy as np
import soundfile as sf

FS=48000
REV='251c0be57d5d1b3242b91f53e0cde62ab1cb42d9'
ROOT='https://raw.githubusercontent.com/facebookincubator/Meta-open-sound/'+REV+'/systems/instruments/meta-piano/ogg/'
NAMES=['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B']
def sha(data):return hashlib.sha256(data).hexdigest()
def sample_name(n,v):
    layer=1 if v<46 else 2 if v<58 else 3 if v<70 else 4
    return f'INSPiano_Vel0{layer}_{NAMES[n%12]}{n//12-1}_01.ogg'
def pair_events(take):
    if take.get('schema')!='evercraft.performance.take.v1':raise ValueError('invalid_take_schema')
    end=float(take.get('duration_ms',0))
    if not (0<end<=90500):raise ValueError('invalid_take_duration')
    raw=take.get('midi_events')
    if not isinstance(raw,list) or len(raw)>16000:raise ValueError('invalid_event_count')
    events=[]
    for i,e in enumerate(raw):
        if not isinstance(e,dict):raise ValueError('malformed_event')
        kind=e.get('kind')
        if kind not in ('note_on','note_off','pedal'):continue
        ms=float(e.get('ms',-1));n=e.get('note');v=e.get('value');ch=e.get('channel',0);src=e.get('source','unknown')
        if not math.isfinite(ms) or not 0<=ms<=end+20:raise ValueError('invalid_event_timestamp')
        if not isinstance(v,int) or not 0<=v<=127:raise ValueError('invalid_controller_value')
        if not isinstance(ch,int) or not 0<=ch<=15:raise ValueError('invalid_channel')
        if not isinstance(src,str) or len(src)>128:raise ValueError('invalid_source_id')
        if kind=='pedal':
            if n!=64:raise ValueError('unsupported_controller')
        elif not isinstance(n,int) or not 21<=n<=108:raise ValueError('note_out_of_range')
        events.append((ms,i,kind,n,v,ch,src))
    events.sort(key=lambda x:(x[0],x[1]))
    active=defaultdict(deque);pedals=defaultdict(bool);held=defaultdict(list);completed=[]
    def finish(note,time):
        if note['end_ms'] is None:
            note['end_ms']=min(end,max(note['start_ms']+30,time))
            completed.append(note)
    for ms,_,kind,n,vel,ch,src in events:
        route=(src,ch)
        if kind=='pedal':
            prev=pedals[route];pedals[route]=vel>=64
            if prev and not pedals[route]:
                for note in held[route]:finish(note,ms)
                held[route].clear()
            continue
        key=(src,ch,n)
        if kind=='note_on' and vel>0:
            active[key].append({'start_ms':ms,'end_ms':None,'midi_note':n,'velocity':vel,'source':src,'channel':ch})
        elif active[key]:
            note=active[key].popleft()
            if pedals[route]:held[route].append(note)
            else:finish(note,ms)
    for notes in list(active.values())+list(held.values()):
        for note in notes:finish(note,end)
    return sorted(completed,key=lambda x:x['start_ms'])
def render(input_path,output_dir):
    path=Path(input_path);output_dir=Path(output_dir)
    if path.stat().st_size>3_000_000:raise ValueError('take_too_large')
    take=json.loads(path.read_text())
    voices=pair_events(take)
    if not voices:raise ValueError('no_live_note_events')
    length=math.ceil((float(take['duration_ms'])/1000+2.0)*FS)
    out=np.zeros((length,2),dtype=np.float32)
    cache=output_dir/'recorded_source_cache';cache.mkdir(parents=True,exist_ok=True)
    used={}
    for voice in voices:
        n=voice['midi_note'];v=voice['velocity'];name=sample_name(n,v);file=cache/name
        if not file.exists():
            with urlopen(Request(ROOT+name,headers={'User-Agent':'Evercraft-human-take-replay/0.2'}),timeout=30) as f:
                data=f.read(1500001)
            if not 2000<len(data)<1500000 or data[:4]!=b'OggS':raise ValueError('recorded_sample_invalid')
            file.write_bytes(data)
        sample,sr=sf.read(file,always_2d=True,dtype='float32')
        if sr!=FS:raise ValueError('recording_sample_rate_unexpected')
        if sample.shape[1]==1:sample=np.repeat(sample,2,axis=1)
        if sample.shape[1]!=2:raise ValueError('sample_channels_unexpected')
        used[name]=sha(file.read_bytes())
        start=int(voice['start_ms']/1000*FS)
        stop=int(voice['end_ms']/1000*FS)
        count=min(len(sample),length-start)
        if count<=0:continue
        env=np.ones(count,dtype=np.float32)
        if stop<start+count:
            f=np.arange(count-(stop-start),dtype=np.float32)
            env[stop-start:]=np.exp(-4.5*f/(.24*FS))
        pan=(n-60)/65
        stereo=np.array([math.sqrt(1-pan),math.sqrt(1+pan)],dtype=np.float32)
        gain=.61*(.4+.6*(v/127)**1.4)
        out[start:start+count]+=sample[:count]*env[:,None]*gain*stereo[None,:]
    peak=float(np.max(np.abs(out)))
    if peak<.001:raise ValueError('silent_render')
    safe_gain=min(1,.84/peak)
    out*=safe_gain
    output=output_dir/'REAL_TAKE_piano_sample_playback_REVIEW.wav'
    sf.write(output,out,FS,subtype='PCM_24')
    proof={'schema':'evercraft.performance.sample-replay.v1','status':'UNAPPROVED',
        'human_performance_source':take.get('source_types',[]),
        'not_acoustic_piano_microphone_recording':True,
        'recorded_CC0_sample_source_commit':REV,
        'source_sample_sha256':used,'input_take_sha256':sha(path.read_bytes()),
        'output_wav_sha256':sha(output.read_bytes()),
        'played_note_count':len(voices),
        'event_voices':voices,'safety_trim':safe_gain,
        'human_music_approved':False,'production_release_authority':False}
    (output_dir/'replay_proof.json').write_text(json.dumps(proof,indent=2)+'\n')
    print(json.dumps({'rendered':output.name,'played_notes':len(voices),'recorded_sample_count':len(used),'approved':False}))
    return output
if __name__=='__main__':
    a=argparse.ArgumentParser()
    a.add_argument('take_json')
    a.add_argument('--output-dir',default='evercraft-human-replay')
    opts=a.parse_args()
    render(opts.take_json,opts.output_dir)
