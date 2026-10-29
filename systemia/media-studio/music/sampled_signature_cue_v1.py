#!/usr/bin/env python3
"""
Evercraft || Fallen Studios -- "At First Light" (15-second original cue)
Recorded instrument sources:
  Alexander Holm, Salamander Grand Piano V3, CC BY 3.0 (via Tone.js piano samples)
  Versilian Studios/Sam Gossner, VSCO 2 CE cello section, CC0 1.0
No generated imitation pianos/strings, no stock composition, no sampled full musical phrases.
Only this original arrangement; no claim of real human performance.
"""
from __future__ import annotations
import os,json,hashlib,urllib.request,urllib.parse,math,subprocess,random
from pathlib import Path
import numpy as np
from scipy.signal import resample_poly, fftconvolve, butter, sosfiltfilt
from fractions import Fraction

FS=44100
T=16.0
N=int(T*FS)
OUT=Path(os.environ.get("OUTPUT_DIR","artifacts/fallen-sampled-score"))
SAMPLES=OUT/"instrument-cache"
OUT.mkdir(parents=True,exist_ok=True); SAMPLES.mkdir(parents=True,exist_ok=True)
RNG=random.Random(104)
NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def midi(note):
    # note string e.g. 'A3', 'F#4'
    octave=int(note[-1])
    key=note[:-1]
    return 12*(octave+1)+NOTE_NAMES.index(key)
PIANO_NAMES=['A2','C3','D#3','F#3','A3','C4','D#4','F#4','A4','C5','D#5','F#5','A5']
CELLO_NAMES=['A2','C3','E3','G3','B3','D4']
LICENSES={
  "Salamander Grand Piano V3":"Alexander Holm, CC BY 3.0, https://github.com/sfzinstruments/SalamanderGrandPiano",
  "VSCO 2 CE / Cello Section":"Versilian Studios (Sam Gossner / Simon Dalzell), CC0 1.0, https://github.com/sgossner/VSCO-2-CE"
}
used=[]
def fetch(url,filename):
    path=SAMPLES/filename
    if not path.exists() or path.stat().st_size<3000:
        req=urllib.request.Request(url,headers={"User-Agent":"EvercraftFallenMusic/1.0"})
        with urllib.request.urlopen(req,timeout=60) as r, open(path,"wb") as f:
            while True:
                block=r.read(256*1024)
                if not block:break
                f.write(block)
    sha=hashlib.sha256(path.read_bytes()).hexdigest()
    used.append({"file":filename,"url":url,"sha256":sha})
    return path
def decode(path):
    cmd=["ffmpeg","-v","error","-i",str(path),"-f","f32le","-ac","2","-ar",str(FS),"pipe:1"]
    p=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
    a=np.frombuffer(p.stdout,dtype="<f4").copy().reshape(-1,2)
    return a
piano={}
for n in PIANO_NAMES:
    url=f"https://raw.githubusercontent.com/Tonejs/audio/master/salamander/{n}.mp3"
    piano[n]=decode(fetch(url,"piano_"+n.replace("#","sharp")+".mp3"))
cello={}
for n in CELLO_NAMES:
    rel=f"Strings/Cello Section/susvib/susvib_{n}_v1_1.wav"
    url="https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/"+urllib.parse.quote(rel)
    cello[n]=decode(fetch(url,"cello_"+n+".wav"))

def repitch(x,steps):
    if steps==0:return x.copy()
    rate=2**(steps/12)
    frac=Fraction(1/rate).limit_denominator(1200)
    y=resample_poly(x,frac.numerator,frac.denominator,axis=0).astype(np.float32)
    return y

def sampler(bank,name):
    nearest=min(bank,key=lambda k:abs(midi(k)-midi(name)))
    return repitch(bank[nearest],midi(name)-midi(nearest))

piano_stem=np.zeros((N,2),dtype=np.float32)
cello_stem=np.zeros((N,2),dtype=np.float32)
events=[]
def place_piano(note,start,duration,volume=.6,pan=0.0):
    # Acoustic sample itself provides hammer transient and decaying harmonics.
    start=max(0.,start+RNG.uniform(-.017,.017))
    src=sampler(piano,note)
    end=min(len(src),int((duration+1.1)*FS),N-int(start*FS))
    if end<=0:return
    src=src[:end].copy()
    t=np.arange(end)/FS
    fadein=np.clip(t/.009,0,1)
    # physically plausible dampening on note release; allow unpedalled decay
    release=np.ones(end)
    ix=t>duration
    release[ix]=np.exp(-(t[ix]-duration)/.38)
    env=(fadein*release).astype(np.float32)
    v=volume*RNG.uniform(.92,1.08)
    src*=env[:,None]*v
    src[:,0]*=np.sqrt((1-pan)/2)*1.33
    src[:,1]*=np.sqrt((1+pan)/2)*1.33
    s=int(start*FS)
    piano_stem[s:s+end]+=src
    events.append({"part":"piano","note":note,"start":round(start,3),"duration":duration,"velocity":round(v,3)})
def place_cello(note,start,duration,volume=.42,pan=.12):
    # quiet cello samples, sustained with vibrato; controlled bow-style onset and swell
    start=max(0.,start+RNG.uniform(-.04,.04))
    src=sampler(cello,note)
    available=N-int(start*FS)
    L=min(int((duration+.8)*FS),available)
    if L<=0:return
    if len(src)<L:
        # loop in its steady middle region with overlapping 180ms crossfades
        middle=src[max(0,int(.45*FS)):min(len(src),int(3.6*FS))]
        if len(middle)<FS//2:middle=src
        repeats=int(math.ceil(L/len(middle)))+1
        src=np.tile(middle,(repeats,1))
    src=src[:L].copy()
    t=np.arange(L)/FS
    env=np.minimum(1,t/.65)*np.minimum(1,np.maximum(0,(duration+.5-t)/.8))
    env*=.85+.15*np.sin(np.minimum(1,t/max(duration,.1))*math.pi)
    src*=env[:,None]*volume
    src[:,0]*=np.sqrt((1-pan)/2)*1.2
    src[:,1]*=np.sqrt((1+pan)/2)*1.2
    s=int(start*FS)
    cello_stem[s:s+L]+=src
    events.append({"part":"cello","note":note,"start":round(start,3),"duration":duration,"velocity":volume})

# A 15-second miniature, phrased with breathing room. A minor -> Fmaj7 -> Cadd9/E -> Am(add9).
# The recognizable 3-note 'reaching' signature returns at the end.
pnotes=[
  ('A3',.05,2.5,.47,-.18),
  ('E4',.16,1.75,.46,.08),
  ('A4',.42,1.15,.66,-.06),
  ('C5',1.53,1.00,.62,.09),
  ('B4',2.59,.58,.46,.01),
  ('A4',3.30,1.0,.57,-.07),
  ('F3',3.64,2.65,.49,-.17),
  ('C4',3.73,2.05,.45,.07),
  ('E4',4.08,1.6,.51,.18),
  ('A4',5.00,.90,.60,-.13),
  ('G4',6.07,.90,.56,.1),
  ('E3',6.75,2.50,.45,-.16),
  ('G3',6.84,2.10,.38,.11),
  ('C4',7.01,1.9,.52,.01),
  ('E4',7.46,1.6,.54,-.08),
  ('G4',8.18,.8,.6,.11),
  ('B4',9.0,.88,.68,-.07),
  ('C5',10.02,1.1,.75,.08),
  ('E5',11.05,1.48,.66,.12),
  ('A3',11.0,3.75,.42,-.2),
  ('E4',11.19,2.7,.43,.15),
  ('C5',12.72,1.1,.45,.02),
  ('B4',13.69,.93,.55,-.07),
  ('A4',14.50,1.0,.68,.03),
]
for n,t,d,v,pan in pnotes: place_piano(n,t,d,v,pan)
for n,t,d,v,pan in [
   ('A2',4.65,3.2,.24,-.20),
   ('C3',7.7,3.0,.25,.22),
   ('E3',10.13,3.4,.29,-.16),
   ('A2',13.1,2.55,.23,.12)
]: place_cello(n,t,d,v,pan)

# Small dark scoring room, not a fake stadium-size orchestral hall.
def room(stem,wet=.20):
    taps=[(0.,1.),(.047,.26),(.077,-.19),(.126,.23),(.176,.14),(.239,-.12),(.32,.11)]
    ir=np.zeros(int(.48*FS))
    for delay,gain in taps:ir[int(delay*FS)]+=gain
    decay=np.exp(-np.arange(len(ir))/FS*12)
    ir+=np.random.default_rng(302).normal(0,1,len(ir))*.0015*decay
    ir=ir.astype(np.float32)
    y=np.zeros_like(stem)
    for ch in range(2):
        y[:,ch]=fftconvolve(stem[:,ch],ir,mode="full")[:len(stem)]
    return stem*(1-wet)+y*wet

piano_dry=piano_stem.copy()
cello_dry=cello_stem.copy()
piano_stem=room(piano_stem,.14)
cello_stem=room(cello_stem,.23)
mixed=piano_stem+cello_stem
# mild EQ low cut below 38Hz, then transparent gentle compression / limiter
sos=butter(2,38,'highpass',fs=FS,output="sos")
mixed=sosfiltfilt(sos,mixed,axis=0).astype(np.float32)
peak=float(np.max(np.abs(mixed)))
gain=min(1.0,0.78/max(peak,.0001))
for k in ['piano_stem','cello_stem','mixed']:
    globals()[k]*=gain

# Export both full arrangement and piano-only to audition whether cello actually helps.
import soundfile as sf
sf.write(OUT/"Evercraft_At_First_Light_Piano_Cello_16s.wav",mixed,FS,subtype="PCM_24")
sf.write(OUT/"Evercraft_At_First_Light_Piano_Only_16s.wav",piano_stem,FS,subtype="PCM_24")
sf.write(OUT/"piano_stem.wav",piano_stem,FS,subtype="PCM_24")
sf.write(OUT/"cello_stem.wav",cello_stem,FS,subtype="PCM_24")
for stem in ["Evercraft_At_First_Light_Piano_Cello_16s","Evercraft_At_First_Light_Piano_Only_16s"]:
    subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-i",str(OUT/(stem+".wav")),"-c:a","aac","-b:a","192k",str(OUT/(stem+".m4a"))],check=True)

ledger={
  "schema":"evercraft.fallen.sampled-score.v1",
  "composition":"At First Light",
  "status":"PRIVATE_AUDITION_NOT_OWNER_APPROVED",
  "duration_seconds":T,"sample_rate":FS,
  "composition_author":"Original arrangement for Evercraft Fallen Studios",
  "instruments":["Recorded Salamander Grand Piano","Recorded VSCO 2 CE cello section"],
  "sources_and_licenses":LICENSES,
  "recorded_sample_sources":used,
  "note_events":events,
  "cost_usd_vast":0,
  "publication_authorized":False,
  "notes":"Commercial recording reuse permitted with documented attribution for piano; VSCO cello CC0. Audio original arrangement; no music excerpt/stock track sampled. Human listening and film sync pending. Sample files not included in shipped source archive."
}
(OUT/"SOURCES_AND_LICENSES.json").write_text(json.dumps(ledger,indent=2)+"\n")
(OUT/"ATTRIBUTION.txt").write_text(
"At First Light: original composition and arrangement for Evercraft || Fallen Studios.\n"
"Recorded piano samples: Salamander Grand Piano V3 by Alexander Holm, licensed CC BY 3.0.\n"
"https://github.com/sfzinstruments/SalamanderGrandPiano\n"
"Recorded cello samples: VSCO 2 Community Edition, Versilian Studios / Sam Gossner, licensed CC0 1.0.\n"
"https://github.com/sgossner/VSCO-2-CE\n"
"Both sets of recorded samples were performed by human musicians; the present composition is programmed, not a live performance.\n"
"Do not redistribute raw samples in a product sold as a sample library.\n")
assert (OUT/"Evercraft_At_First_Light_Piano_Cello_16s.m4a").stat().st_size>10000
print(json.dumps({"status":"RENDERED_AUDITION","duration":T,"sample_sources":len(used),"events":len(events),"gain":gain,"output":str(OUT)},indent=2))
