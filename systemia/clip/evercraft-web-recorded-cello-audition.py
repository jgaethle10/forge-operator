#!/usr/bin/env python3
"""Human-audition-only real cello layering. Original piano SHA hard pinned and verified."""
import hashlib,importlib.util,json,math
from pathlib import Path
from urllib.request import Request,urlopen
from fractions import Fraction
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

FS=48000
CELLO_REV="6fd75fbfc1dbb3109bf26220ba1adea46188a18b"
CELLO_BASE=f"https://raw.githubusercontent.com/sfzinstruments/karoryfer-bigcat.cello/{CELLO_REV}/Samples/sus/"
LICENSE="https://raw.githubusercontent.com/sfzinstruments/karoryfer-bigcat.cello/"+CELLO_REV+"/LICENSE"
EXPECTED_PIANO={
 "close":"43682c9b950379b74bcddf97420cd6f815f97b6d4169ac697229083f346d1bdb",
 "room":"367d937ad6fc2183d55b133a4ae4667fc67fe083dfd3f68373ba36afc21c7400"
}
# start, source sample, target MIDI pitch, source MIDI pitch, duration, relative expression
# All notes follow the original piano chord changes. No sustained synthetic pad.
CELLO_NOTES=[
 (0.85,"A2_p_g.wav",45,45,2.12,.72),
 (3.87,"Gb2_p_d.wav",41,42,2.16,.68),
 (6.94,"Eb2_mp_g.wav",40,39,2.12,.56),
 (10.36,"Gb2_mp_d.wav",43,42,2.22,.62),
 (13.99,"C3_p_g.wav",48,48,2.27,.71),
]
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load_recorded(name,cache):
 cache.mkdir(exist_ok=True,parents=True)
 p=cache/name
 if not p.exists():
  url=CELLO_BASE+name
  with urlopen(Request(url,headers={"User-Agent":"Evercraft-film-source-audit/1.0"}),timeout=45) as r:
   buf=r.read()
  if not(15000<len(buf)<3500000 and buf[:4] in [b"RIFF",b"RF64"]):
   raise ValueError("invalid_sample_audio:"+name)
  p.write_bytes(buf)
 return p
def mix_cello(templates,cache,length):
 buffer=np.zeros((length,2),dtype=np.float32)
 sources={}
 for start,name,target,root,sec,expr in templates:
  p=load_recorded(name,cache)
  raw,sr=sf.read(p,dtype="float32",always_2d=True)
  if raw.shape[1]==1: raw=np.repeat(raw,2,axis=1)
  if raw.shape[1]!=2:raise ValueError("unexpected_cello_channels")
  ratio=(FS/sr)/2**((target-root)/12)
  f=Fraction(ratio).limit_denominator(2500)
  raw=resample_poly(raw,f.numerator,f.denominator,axis=0).astype(np.float32)
  n=min(int(sec*FS),len(raw))
  raw=raw[:n]
  if n<int(.55*FS): raise ValueError("cello_sample_too_short:"+name)
  env=np.ones(n,dtype=np.float32)
  attack=min(n//4,int(.19*FS))
  release=min(n//3,int(.38*FS))
  # Detailed dynamic swells with the recorded bow as foundation, not oscillator vibrato.
  env[:attack]*=np.linspace(.025,1,attack)
  env[-release:]*=np.cos(np.linspace(0,math.pi/2,release))**2
  env*=.86+.14*np.sin(np.linspace(0,math.pi,n))**2
  onset=int(start*FS); n=min(n,length-onset)
  # Recorded cello is slightly left of the piano center; do not fake section size.
  pan=np.array([1.03,.91],dtype=np.float32)
  buffer[onset:onset+n]+=raw[:n]*env[:n,None]*pan[None,:]*expr
  sources[name]={"sha256":sha(p),"bytes":p.stat().st_size,"source_pitch":root,"target_pitch":target}
 return buffer,sources
def write_mix(root,piano_name,cello,style):
 piano,sr=sf.read(root/f"evercraft-web-real-piano-{piano_name}-UNAPPROVED.wav",dtype="float32",always_2d=True)
 if sr!=FS or piano.shape!=cello.shape:raise ValueError("piano_reference_format_changed")
 variant={
  "subtle":(.31,"close"),
  "intimate":(.47,"room")
 }[style]
 gain,expected=variant
 if piano_name!=expected:raise ValueError("incorrect_reference_piano_variant")
 # Track gain changes only on cello. Piano bytes and score remain unchanged in sources.
 raw=piano + cello*gain
 peak=float(np.max(np.abs(raw)))
 trim=min(1,.84/max(peak,1e-10))
 raw*=trim
 out=root/f"evercraft-web-piano-real-cello-{style}-UNAPPROVED.wav"
 sf.write(out,raw,FS,subtype="PCM_24")
 return {"file":out.name,"sha256":sha(out),"piano_reference_sha256":EXPECTED_PIANO[piano_name],
         "unchanged_piano_used":True,"cello_gain":gain,"safety_trim":trim,
         "peak_dbfs":round(20*math.log10(max(float(np.max(np.abs(raw))),1e-10)),2),
         "rms_dbfs":round(20*math.log10(max(float(np.sqrt(np.mean(raw**2))),1e-10)),2)}
def main():
 root=Path("artifacts/evercraft-web-real-cello-audition");root.mkdir(parents=True,exist_ok=True)
 # Import the *exact* piano renderer from the previous positive user audition.
 path=Path(__file__).with_name("evercraft-real-piano-audition.py")
 spec=importlib.util.spec_from_file_location("piano_approved_reference",path)
 mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
 for style in ("close","room"):
  mod.render(root,style)
  actual=sha(root/f"evercraft-web-real-piano-{style}-UNAPPROVED.wav")
  if actual!=EXPECTED_PIANO[style]:raise ValueError("piano_reference_sha_mismatch:"+style)
 length=int(17.6*FS)
 cello,sources=mix_cello(CELLO_NOTES,root/"cello-source-cache",length)
 result=[write_mix(root,"close",cello,"subtle"),
         write_mix(root,"room",cello,"intimate")]
 receipt={
  "schema":"evercraft.web.cello-audition.v1",
  "product":"Evercraft Web",
  "status":"UNAPPROVED_LISTENING_TEST",
  "piano":"identical recorded performance and reference hashes from positively received previous audition",
  "cello_source":"Karoryfer x bigcat Cello real bowed sustain recording by Kamila Borowiak",
  "cello_cc0_license":LICENSE,
  "cello_repository":"https://github.com/sfzinstruments/karoryfer-bigcat.cello",
  "cello_source_revision":CELLO_REV,
  "samples":sources,"takes":result,"intentionally_unmodified_piano_refs":EXPECTED_PIANO,
  "human_listening_approval":False,"production_release_authority":False,
  "no_voice_or_sfx":True,"production_customer_fetch_verified":False
 }
 (root/"proof.json").write_text(json.dumps(receipt,indent=2)+"\n")
 print(json.dumps({"ok":True,"takes":[r["file"] for r in result],
                    "source_samples":len(sources),"piano_refs_verified":True,
                    "release_authority":False},indent=2))
if __name__=="__main__":main()
