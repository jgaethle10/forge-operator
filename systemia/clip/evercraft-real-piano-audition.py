#!/usr/bin/env python3
"""Recorded CC0 piano sample audition. Never grants publishing approval."""
import argparse,hashlib,json,math
from pathlib import Path
from urllib.request import Request,urlopen
import numpy as np
import soundfile as sf
from scipy.signal import butter,sosfiltfilt
SOURCE_SHA="251c0be57d5d1b3242b91f53e0cde62ab1cb42d9"
ROOT=f"https://raw.githubusercontent.com/facebookincubator/Meta-open-sound/{SOURCE_SHA}/systems/instruments/meta-piano/ogg/"
FS=48000
NAMES=['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B']
# onset (s), MIDI pitch, expressive velocity, damped sustain (s).
# Phrases and hand movement intentionally deviate from strict quantization.
SCORE=[
 (0.00,45,43,3.20),(0.09,52,51,3.25),(0.25,59,45,2.60),(0.43,60,52,2.00),(0.61,64,46,2.25),
 (1.04,72,72,.88),(1.91,71,52,.91),(2.57,69,55,1.20),
 (3.32,41,44,3.28),(3.40,48,50,3.05),(3.56,52,46,2.70),(3.72,57,42,2.28),
 (4.07,69,62,.99),(4.91,67,52,1.19),(5.66,64,47,1.07),
 (6.41,40,40,3.27),(6.52,48,52,3.32),(6.67,55,43,3.03),(6.85,60,47,2.45),
 (7.36,76,70,.98),(8.33,74,50,.89),(9.11,72,58,.95),
 (9.90,43,42,3.03),(9.99,50,47,2.85),(10.13,57,44,2.69),(10.29,60,47,2.37),
 (10.67,74,61,.87),(11.40,71,53,.91),(12.20,72,61,1.16),
 (13.22,48,49,2.90),(13.34,55,47,2.60),(13.48,60,44,2.19),(13.64,64,42,2.25),
 (13.98,72,61,1.79)]
def note_name(n):
    assert 21<=n<=108
    return NAMES[n%12]+str(n//12-1)
def layer(v):
    if v<46:return 1
    if v<58:return 2
    if v<70:return 3
    return 4
def fetch(name,cache):
    cache.mkdir(parents=True,exist_ok=True)
    p=cache/name
    if not p.exists():
        with urlopen(Request(ROOT+name,headers={'User-Agent':'Evercraft-CC0-audition/1.0'}),timeout=35) as response:
            data=response.read()
        if len(data)<2500 or len(data)>1500000 or data[:4]!=b'OggS':
            raise ValueError("untrusted_source_sample_"+name)
        p.write_bytes(data)
    data=p.read_bytes()
    if data[:4]!=b'OggS':raise ValueError("cache_is_not_ogg")
    return hashlib.sha256(data).hexdigest(),len(data)
def render(dest,style):
    length=int(17.6*FS)
    audio=np.zeros((length,2),dtype=np.float32)
    cache=dest/'source-cache'
    sources={}
    for at,midi,velocity,held in SCORE:
        name=f'INSPiano_Vel0{layer(velocity)}_{note_name(midi)}_01.ogg'
        if name not in sources:
            sh,size=fetch(name,cache)
            sources[name]={'sha256':sh,'bytes':size}
        sample,sr=sf.read(str(cache/name),dtype='float32',always_2d=True)
        if sr!=FS:raise ValueError('wrong_sample_rate')
        if sample.shape[1]==1:sample=np.repeat(sample,2,axis=1)
        if sample.shape[1]!=2:raise ValueError('wrong_channels')
        stop=int(held*FS)
        env=np.ones(len(sample),dtype=np.float32)
        if stop<len(sample):
            t=np.maximum(0,np.arange(len(sample))-stop)/(.34*FS)
            env[stop:]=np.exp(-4.6*t[stop:])
        env[:min(90,len(env))]*=np.linspace(.1,1,min(90,len(env)))
        onset=int(at*FS)
        count=min(len(sample),length-onset)
        gain=.67*(.43+.57*(velocity/127)**1.35)
        pan=(midi-62)/48
        lr=np.array([math.sqrt((1-pan)*.5)*1.414,math.sqrt((1+pan)*.5)*1.414])
        audio[onset:onset+count,:]+=sample[:count,:]*env[:count,None]*gain*lr
    filt=butter(2,35,btype='highpass',fs=FS,output='sos')
    for channel in range(2):audio[:,channel]=sosfiltfilt(filt,audio[:,channel]).astype('float32')
    if style=='room':
        wet=np.zeros_like(audio)
        for seconds,volume,cross in ((.037,.06,False),(.073,.04,True),(.119,.025,False),(.197,.014,True)):
            d=int(seconds*FS)
            wet[d:]+=audio[:-d,::-1 if cross else 1]*volume if cross else audio[:-d]*volume
        audio+=wet
    f=int(.065*FS);audio[:f]*=np.linspace(0,1,f)[:,None]
    f=int(.7*FS);audio[-f:]*=np.linspace(1,0,f)[:,None]
    peak=float(np.max(np.abs(audio)))
    if peak<.008:raise ValueError("missing_recorded_instrument")
    if peak>.71:audio*=.71/peak
    output=dest/f'evercraft-web-real-piano-{style}-UNAPPROVED.wav'
    sf.write(output,audio,FS,subtype='PCM_24')
    return {'file':output.name,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),
            'peak_dbfs':round(float(20*np.log10(np.max(np.abs(audio)))),2),
            'rms_dbfs':round(float(20*np.log10(np.sqrt(np.mean(audio**2))+1e-12)),2),
            'duration_seconds':17.6,'sample_rate':FS,'source_sample_count':len(sources),
            'samples':sources,'style':style,'human_listening_approved':False}
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output-dir',default='artifacts/evercraft-web-piano-audition')
    a=parser.parse_args();p=Path(a.output_dir);p.mkdir(parents=True,exist_ok=True)
    takes=[render(p,'close'),render(p,'room')]
    receipt={'schema':'evercraft.piano-audition.v1','source_revision':SOURCE_SHA,
             'source_project':'Meta Open Sound Piano','source_license':'CC0 1.0',
             'source_url':'https://github.com/facebookincubator/Meta-open-sound/tree/'+SOURCE_SHA+'/systems/instruments/meta-piano',
             'music_composition':'Original Evercraft audition phrase',
             'status':'UNAPPROVED_AUDIO_SOURCE_TEST_NOT_FOR_PUBLICATION',
             'production_release_authority':False,'takes':takes}
    (p/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({'ok':True,'samples':takes[0]['source_sample_count'],
          'styles':[t['style'] for t in takes],
          'release_authority':False},indent=2))
if __name__=='__main__':main()
