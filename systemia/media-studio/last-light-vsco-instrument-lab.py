#!/usr/bin/env python3
"""The Last Light: recorded multisample instrument R&D, not a concert recording.

This instrument audition is independent of the Iowa chromatic-scale sampler.
Piano V1 is protected by exact SHA-256. VSCO 2 Community Edition acoustic
samples (CC0) are verified against their original GitHub git-blob object IDs.
"""
from __future__ import annotations
import argparse,hashlib,io,json,math,urllib.request
from fractions import Fraction
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
SR=44100
DURATION=35.0
PIANO_SHA="630efc0e8206ec7a6f4f0dac41634ab2a34da7f518f9f90be0b339b4e5a2015e"
BASE="https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings"
# Source SHA is the ORIGINAL Git blob SHA1, not a hash of re-rendered audio.
SOURCES={
 "cello":{"root":"Cello%20Section/susvib","prefix":"susvib","suffix":"_1.wav",
  "layers":{"C3":{"soft":"73ccb5dc2cc2a07926a1c41aa3c5621b19f420bf","strong":"a192845091cb8e669c72d3ff4a88eb1c5968e626"},
            "E3":{"soft":"63f4d6df3a25fb95f417b5d45b5f8bf6a11107bf","strong":"7711cb67795d692b0d732eb8fd234c41d5980f42"},
            "G3":{"soft":"7880157fbb8e57fb0b7a694b8569701bc0d942ea","strong":"732d0c80596fdfc593f55b5a24f65c07cd3191cd"}}},
 "violin":{"root":"Solo%20Violin/Arco%20Vib","prefix":"LLVln_ArcoVib","suffix":".wav",
  "layers":{"E4":{"soft":"99279ebc21258ab48aae6eb63d1eb7538f28d306","strong":"6b1bcdf57513dd089a2172adc0ddbac4a335b3a0"},
            "G4":{"soft":"7324564c663bf239802020287c217b27c76b8142","strong":"f9c1a5547a7e062eb34ee6bef09e559d3839f46e"},
            "C5":{"soft":"71f0671d77cf8b79ce1a18ba20d9661e24f086fc","strong":"93e9a2cf8106acc5e49ba18dab112c947473917f"}}}
}
# Phrase choices stay separate from sample-bank identity. No scale slicing,
# ensemble doubling, default MIDI substitutes, fake sustain loop or compression.
SCORE={
 "cello":[(8.10,"E3",1.8,.43),(10.70,"G3",1.75,.40),(13.55,"F3",1.8,.42),
          (16.20,"C3",2.20,.55),(19.05,"G3",2.20,.65),(22.15,"E3",1.65,.45),
          (26.55,"G3",1.65,.37)],
 "violin":[(12.10,"G4",1.45,.33),(14.30,"B4",1.55,.36),(17.70,"E4",1.53,.43),
           (19.80,"G4",2.30,.62),(22.75,"Gb4",1.80,.39),(26.18,"B4",1.55,.31)]
}
SEATS={"cello":(.12,-37.5),"violin":(-.26,-41.5)}
NOTE={"C":0,"Db":1,"D":2,"Eb":3,"E":4,"F":5,"Gb":6,"G":7,"Ab":8,"A":9,"Bb":10,"B":11}
def midi(n):
 for k in sorted(NOTE,key=len,reverse=True):
  if n.startswith(k) and n[len(k):].isdigit():
   return (int(n[len(k):])+1)*12+NOTE[k]
 raise ValueError("invalid_note:"+str(n))
def sha256(data):return hashlib.sha256(data).hexdigest()
def git_blob_sha(data):
 return hashlib.sha1(b"blob "+str(len(data)).encode()+b"\x00"+data).hexdigest()
def source_filename(part,pitch,dynamic):
 s=SOURCES[part]
 if part=="cello":
  name=f"susvib_{pitch}_v{1 if dynamic=='soft' else 3}_1.wav"
 else:
  name=f"LLVln_ArcoVib_{pitch}_{'p' if dynamic=='soft' else 'f'}.wav"
 return name
def prepare_audio(blob):
 audio,sr=sf.read(io.BytesIO(blob),always_2d=True,dtype="float32")
 if not 1<=audio.shape[1]<=2 or not np.isfinite(audio).all() or len(audio)<sr*.7:
  raise ValueError("source_invalid_waveform")
 if sr not in (44100,48000,96000):raise ValueError("unexpected_source_sample_rate")
 if sr!=SR:audio=resample_poly(audio,SR,sr,axis=0)
 if audio.shape[1]==1:audio=np.repeat(audio,2,axis=1)
 # Remove DC; trim only proven leading silence. Preserve recorded bow attack.
 audio=audio.astype(np.float64)-np.mean(audio[:min(len(audio),int(.20*SR))],axis=0)*.2
 width=int(.008*SR)
 windows=np.array([np.sqrt(np.mean(audio[i:i+width]**2)) for i in range(0,min(len(audio)-width,int(.5*SR)),width)])
 if len(windows) and np.max(windows)>0:
  threshold=max(np.max(windows)*.055,.000045)
  indices=np.where(windows>=threshold)[0]
  if len(indices):
   onset=max(0,int(indices[0]*width)-int(.012*SR))
   if onset<=int(.32*SR):audio=audio[onset:]
 return audio
def acquire(cache_dir):
 """Require all 12 pinned acoustic recordings; no fallback soundfonts."""
 cache_dir=Path(cache_dir);cache_dir.mkdir(parents=True,exist_ok=True)
 bank={};receipt=[]
 for part,spec in SOURCES.items():
  for pitch,layers in spec["layers"].items():
   for dynamic,expected in layers.items():
    filename=source_filename(part,pitch,dynamic)
    url=f"{BASE}/{spec['root']}/{filename}"
    local=cache_dir/filename
    if local.exists():blob=local.read_bytes()
    else:
     request=urllib.request.Request(url,headers={"User-Agent":"Evercraft-Internal-Orchestra-QA/1.0"})
     with urllib.request.urlopen(request,timeout=35) as response:
      if response.status!=200:raise RuntimeError("source_download_status_invalid")
      blob=response.read(7_000_001)
    if not 50000<len(blob)<7_000_000 or git_blob_sha(blob)!=expected:
     raise ValueError("recorded_source_identity_failed:"+filename)
    audio=prepare_audio(blob)
    local.write_bytes(blob)
    bank[part,pitch,dynamic]=audio
    receipt.append({"part":part,"pitch":pitch,"dynamic":dynamic,"url":url,
                    "sha256":sha256(blob),"git_blob_sha1":expected,
                    "frames":len(audio),"channels":audio.shape[1]})
    print("source_verified",part,pitch,dynamic,sha256(blob)[:14],flush=True)
 return bank,receipt
def choose(bank,part,note,touch):
 roots=SOURCES[part]["layers"].keys()
 dest=midi(note)
 ranked=sorted(roots,key=lambda root:(abs(midi(root)-dest),root))
 nearest=ranked[0]; semitones=dest-midi(nearest)
 if abs(semitones)>2:raise ValueError("instrument_pitch_coverage_missing")
 layer="strong" if touch>=.55 else "soft"
 if (part,nearest,layer) not in bank:raise ValueError("recorded_layer_missing")
 return bank[part,nearest,layer],nearest,layer,semitones
def measure_rms(audio):
 return float(np.sqrt(np.mean(np.square(audio.astype(np.float64)))))
def rendered_note(audio,part,held,touch,semitones):
 if not .1<=touch<=1 or not .3<=held<=3.5 or abs(semitones)>2:
  raise ValueError("invalid_phrasing")
 ratio=2**(semitones/12)
 if semitones:
  frac=Fraction(1/ratio).limit_denominator(512)
  audio=resample_poly(audio,frac.numerator,frac.denominator,axis=0)
 # The recording itself must contain enough genuine bow sustain.
 release=.40 if part=="cello" else .33
 frames=int(round((held+release)*SR))
 if frames>len(audio):raise ValueError("source_too_short_for_phrase")
 x=audio[:frames].copy()
 n=len(x);env=np.ones(n,dtype=np.float64)
 # Never fade a bow attack for hundreds of milliseconds like a string pad.
 attack=min(round(.022*SR),round(.08*n))
 env[:attack]=np.sin(np.linspace(0,math.pi/2,attack))**1.0
 tail=int(release*SR)
 env[-tail:]=np.cos(np.linspace(0,math.pi/2,tail))**2
 # Gentle phrase swells on only the recorded waveform, not manufactured vibrato.
 span=int(min(held,1.8)*SR);t=np.linspace(0,1,span)
 env[:span]*=.88+.12*np.sin(math.pi*t)
 measured=measure_rms(x[int(.15*SR):min(len(x),int(.85*SR))])
 if measured<1e-5:raise ValueError("recording_silent")
 target_db=SEATS[part][1]
 gain_db=max(-12,min(13,target_db-20*math.log10(measured)))
 x=x*env[:,None]*(10**(gain_db/20))*touch
 return x,round(gain_db,3)
def voices(bank,score=SCORE):
 parts={};note_receipts=[]
 for part,events in score.items():
  out=np.zeros((int(DURATION*SR),2),dtype=np.float64)
  for when,note,held,touch in events:
   sample,root,layer,transposition=choose(bank,part,note,touch)
   audio,gain_db=rendered_note(sample,part,held,touch,transposition)
   start=int(round(when*SR));end=min(len(out),start+len(audio))
   if start>=len(out) or end<=start:raise ValueError("score_outside_canvas")
   pan=SEATS[part][0];theta=(pan+1)*math.pi/4
   out[start:end,0]+=audio[:end-start,0]*math.cos(theta)*1.414
   out[start:end,1]+=audio[:end-start,1]*math.sin(theta)*1.414
   note_receipts.append({"part":part,"start":when,"pitch":note,"recorded_root":root,
                         "layer":layer,"semitones":transposition,
                         "source_gain_db":gain_db,"held":held})
  parts[part]=out
 return parts,note_receipts
def mix(piano,parts):
 p=piano.astype(np.float64)
 if p.shape!=(int(DURATION*SR),2):raise ValueError("piano_length_invalid")
 # Keep 0-7.5s and 32s-end mathematically IDENTICAL to the piano signal.
 gate=np.zeros(len(p))
 a=int(7.5*SR);b=int(9.6*SR);c=int(27.6*SR);d=int(32*SR)
 gate[a:b]=np.sin(np.linspace(0,math.pi/2,b-a))**2
 gate[b:c]=1
 gate[c:d]=np.cos(np.linspace(0,math.pi/2,d-c))**2
 variants={}
 for key,scale in [("cello_focus",{"cello":1,"violin":0}),
                   ("duet",{"cello":1,"violin":.57})]:
  strings=sum((scale[k]*parts[k] for k in parts),np.zeros_like(p))
  strings*=gate[:,None]
  # If original piano + strings would clip, ONLY the strings retreat.
  candidate=p+strings
  strength=1
  peak=np.max(np.abs(candidate))
  if peak>.94:
   for _ in range(35):
    strength*=.90
    candidate=p+strength*strings
    if np.max(np.abs(candidate))<=.94:break
   else:raise ValueError("orchestra_cannot_fit_below_ceiling")
  if not np.array_equal(candidate[:a],p[:a]) or not np.array_equal(candidate[d:],p[d:]):
   raise ValueError("protected_piano_regions_modified")
  variants[key]=(candidate,strength)
 return variants
def render(piano_path,cache,out_path):
 piano_path=Path(piano_path);cache=Path(cache);out_path=Path(out_path)
 raw=piano_path.read_bytes()
 if sha256(raw)!=PIANO_SHA:raise ValueError("protected_piano_sha_mismatch")
 p,sr=sf.read(io.BytesIO(raw),always_2d=True,dtype="float32")
 if sr!=SR:raise ValueError("piano_rate_invalid")
 bank,sources=acquire(cache)
 parts,events=voices(bank)
 mixes=mix(p,parts)
 out_path.mkdir(parents=True,exist_ok=True)
 files={}
 for part,clip in parts.items():
  filename=f"isolated_{part}_VSCO_CC0.wav"
  sf.write(out_path/filename,clip,SR,subtype="PCM_24")
  files[filename]=sha256((out_path/filename).read_bytes())
 for name,(data,strength) in mixes.items():
  filename=f"Last_Light_Instrument_Lab_{name}.wav"
  sf.write(out_path/filename,data,SR,subtype="PCM_24")
  files[filename]=sha256((out_path/filename).read_bytes())
 # This is the exact unchanged 35s source byte stream, not a new piano master.
 (out_path/"LAST_LIGHT_PIANO_ORIGINAL_UNMODIFIED.wav").write_bytes(raw)
 files["LAST_LIGHT_PIANO_ORIGINAL_UNMODIFIED.wav"]=PIANO_SHA
 receipt={"schema":"evercraft.last-light.instrument-lab.v1",
          "source_library":"Versilian Studios VSCO 2 Community Edition",
          "license_url":"https://github.com/sgossner/VSCO-2-CE/blob/master/LICENSE",
          "source_license":"CC0-1.0",
          "source_samples_exclusive_property_of_evercraft":False,
          "human_orchestra_recorded":False,"human_listening_approved":False,
          "public_release_approved":False,"original_piano_sha256":PIANO_SHA,
          "piano_original_byte_identical":True,"source_provenance":sources,
          "musical_notes":events,"output_sha256":files,
          "limitations":["two instruments only","sample-triggered not live ensemble",
                         "non-legato samples may expose note boundary",
                         "no true bow portamento or performed phrase transitions",
                         "no modeled piano sympathetic resonance"]}
 (out_path/"instrument-lab-provenance.json").write_text(json.dumps(receipt,indent=2)+"\n")
 (out_path/"LISTEN_FIRST.txt").write_text(
   "INTERNAL, REJECTABLE INSTRUMENT AUDITION. Original Last Light piano untouched.\n"+
   "First audition isolated_cello and isolated_violin, THEN piano cello_focus and duet.\n"+
   "These are VSCO2 CE CC0 recorded multisamples, not a live orchestra.\n"+
   "Do not use for public release until human artistic approval.\n")
 return receipt

def render_stems_only(cache,out_path):
 """Produce record-backed instruments WITHOUT importing or regenerating piano.

 The founder-approved, checksum-protected piano is mixed afterwards from
 its exact original binary WAV; rebuilding it from score is not equivalent.
 """
 cache=Path(cache);out_path=Path(out_path)
 bank,sources=acquire(cache)
 parts,events=voices(bank)
 out_path.mkdir(parents=True,exist_ok=True)
 files={}
 for part,clip in parts.items():
  fn=f"isolated_{part}_VSCO_CC0.wav"
  sf.write(out_path/fn,clip,SR,subtype="PCM_24")
  files[fn]=sha256((out_path/fn).read_bytes())
 receipt={"schema":"evercraft.last-light.instrument-stems-only.v1",
    "expected_canonical_piano_sha256":PIANO_SHA,
    "piano_included":False,"piano_reconstructed_or_modified":False,
    "source_library":"Versilian Studios VSCO 2 Community Edition",
    "source_license":"CC0-1.0",
    "source_provenance":sources,"musical_notes":events,"output_sha256":files,
    "human_listening_approved":False,"public_release_approved":False,
    "performed_live_ensemble":False,"independently_recorded_instrument_samples":True}
 (out_path/"instrument-lab-provenance.json").write_text(json.dumps(receipt,indent=2)+"\n")
 (out_path/"LISTEN_FIRST.txt").write_text(
  "Piano deliberately omitted. These are dry isolated sampled acoustic instruments.\n"+
  "Mix exclusively against an independently sha256-verified original The Last Light piano WAV.\n"+
  "Human artistic approval pending; no public release.\n")
 return receipt

if __name__=="__main__":
 parser=argparse.ArgumentParser()
 parser.add_argument("--piano",type=Path)
 parser.add_argument("--stems-only",action="store_true")
 parser.add_argument("--cache",required=True,type=Path)
 parser.add_argument("--out",required=True,type=Path)
 options=parser.parse_args()
 if options.stems_only:
  result=render_stems_only(options.cache,options.out)
 else:
  if options.piano is None:parser.error("--piano is required unless --stems-only")
  result=render(options.piano,options.cache,options.out)
 print("verified_outputs",list(result["output_sha256"]))
