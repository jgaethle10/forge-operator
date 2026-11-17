#!/usr/bin/env python3
"""The Last Light V7: complete raw acoustic takes, piano is byte-protected.
Source-only mode intentionally cannot fake a piano or a live player.
Research audition only. No processing beyond placement and constant gain.
"""
from __future__ import annotations
import hashlib,io,json,zipfile,argparse
from pathlib import Path
import numpy as np
import soundfile as sf
SR=44100
LENGTH=35
PIANO_SHA="630efc0e8206ec7a6f4f0dac41634ab2a34da7f518f9f90be0b339b4e5a2015e"
# Original VSCO 2 CE git object SHA-1 + independent earlier downloaded SHA-256.
TAKES={
 "cello_E3":{"name":"susvib_E3_v1_1.wav",
  "git_sha1":"63f4d6df3a25fb95f417b5d45b5f8bf6a11107bf",
  "sha256":"d2f961e30bf64021cf4acbd88e0e7a1fd1840943ae78c62a711bcce3d109216e",
  "part":"cello","pitch":"E3"},
 "cello_G3":{"name":"susvib_G3_v1_1.wav",
  "git_sha1":"7880157fbb8e57fb0b7a694b8569701bc0d942ea",
  "sha256":"8d658346b8d2054fd534b3222b5d7a23196d22a83a68c3a04ffb76b21853a3db",
  "part":"cello","pitch":"G3"},
 "violin_G4":{"name":"LLVln_ArcoVib_G4_p.wav",
  "git_sha1":"7324564c663bf239802020287c217b27c76b8142",
  "sha256":"ad1ba8442a6b40919093c9c831a8171c7030f7e651fbe075ab87764665deef88",
  "part":"violin","pitch":"G4"}
}
# Each score event triggers one WHOLE original human-recorded acoustic take,
# including onset, sustain and native bow-off. No scale slicing or truncation.
SCORE=[("cello_E3",8.94,.86),("cello_G3",19.28,.90),("violin_G4",17.04,.92)]
SOURCE_URL_PREFIX="https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings"
PATHS={
 "cello_E3":"Cello%20Section/susvib/susvib_E3_v1_1.wav",
 "cello_G3":"Cello%20Section/susvib/susvib_G3_v1_1.wav",
 "violin_G4":"Solo%20Violin/Arco%20Vib/LLVln_ArcoVib_G4_p.wav"}
def sha(blob):return hashlib.sha256(blob).hexdigest()
def git_sha(blob):return hashlib.sha1(b"blob "+str(len(blob)).encode()+b"\x00"+blob).hexdigest()
def inspect_bank(bankzip):
 result={};receipts=[]
 with zipfile.ZipFile(bankzip) as archive:
  located={Path(n).name:n for n in archive.namelist() if n.endswith(".wav")}
  for ident,info in TAKES.items():
   if info["name"] not in located:raise ValueError("missing_verified_sample:"+ident)
   blob=archive.read(located[info["name"]])
   if sha(blob)!=info["sha256"] or git_sha(blob)!=info["git_sha1"]:
    raise ValueError("source_hash_drift:"+ident)
   recording,sr=sf.read(io.BytesIO(blob),always_2d=True,dtype="float64")
   if sr!=SR or recording.shape[1]!=2 or not np.isfinite(recording).all():
    raise ValueError("invalid_source_pcm:"+ident)
   if not SR*9<len(recording)<SR*20:raise ValueError("recorded_phrase_length_invalid:"+ident)
   result[ident]=recording
   receipts.append(dict(id=ident,pitch=info["pitch"],source_sha256=sha(blob),
       git_blob_sha1=git_sha(blob),source_url=SOURCE_URL_PREFIX+"/"+PATHS[ident],
       frames=len(recording),duration=round(len(recording)/SR,5),rights="CC0"))
 return result,receipts
def stems(bank):
 outputs={part:np.zeros((LENGTH*SR,2),dtype=np.float64) for part in ("cello","violin")}
 events=[]
 for ident,when,gain in SCORE:
  if ident not in bank:raise ValueError("missing_original_recorded_performance")
  audio=bank[ident]
  start=round(when*SR);end=start+len(audio)
  if end>LENGTH*SR:raise ValueError("original_recording_exceeds_song")
  part=TAKES[ident]["part"]
  outputs[part][start:end]+=audio*gain
  events.append(dict(part=part,pitch=TAKES[ident]["pitch"],source_id=ident,
      start_seconds=when,full_recorded_length_s=round(len(audio)/SR,5),
      constant_gain=gain,no_trim=True,no_resample=True,no_synthetic_release=True))
 return outputs,events
def load_piano(path):
 raw=Path(path).read_bytes()
 if sha(raw)!=PIANO_SHA:raise ValueError("protected_piano_byte_mismatch")
 audio,sr=sf.read(io.BytesIO(raw),always_2d=True,dtype="float64")
 if sr!=SR or audio.shape!=(LENGTH*SR,2):raise ValueError("bad_approved_piano_pcm")
 return raw,audio
def mix(piano,parts,violin):
 orchestra=parts["cello"]*1.12+(parts["violin"]*1.8 if violin else 0)
 for _ in range(32):
  candidate=piano+orchestra
  if np.max(np.abs(candidate))<.95:break
  orchestra*=.9
 else:raise ValueError("cannot_preserve_piano_headroom")
 if not np.array_equal(candidate[:int(8.8*SR)],piano[:int(8.8*SR)]):
  raise ValueError("approved_piano_intro_changed")
 if not np.array_equal(candidate[int(32*SR):],piano[int(32*SR):]):
  raise ValueError("approved_piano_outro_changed")
 return candidate
def render(bankzip,out,piano_path=None):
 out=Path(out);out.mkdir(parents=True,exist_ok=True)
 bank,receipts=inspect_bank(bankzip)
 parts,events=stems(bank)
 hashes={}
 for part,audio in parts.items():
  file=out/("Last_Light_V7_native_"+part+".wav")
  sf.write(file,audio,SR,subtype="PCM_24");hashes[file.name]=sha(file.read_bytes())
 if piano_path:
  raw,piano=load_piano(piano_path)
  for name,with_violin in (("cello",False),("cello_and_violin",True)):
   file=out/("Last_Light_V7_approved_piano_"+name+".wav")
   sf.write(file,mix(piano,parts,with_violin),SR,subtype="PCM_24")
   hashes[file.name]=sha(file.read_bytes())
  (out/"The_Last_Light_Canonical_Piano_UNCHANGED.wav").write_bytes(raw)
  hashes["The_Last_Light_Canonical_Piano_UNCHANGED.wav"]=PIANO_SHA
 receipt=dict(schema="evercraft.last-light.native-full-take.v7",status="UNAPPROVED",
    samples=receipts,notes=events,
    original_piano_expected_sha256=PIANO_SHA,
    original_piano_present=(piano_path is not None),
    actual_live_performed_legato=False,original_live_orchestra=False,
    source_audio_evercraft_exclusively_owned=False,commercial_release_approved=False,
    source_library="VSCO2 Community Edition CC0",
    source_changes="NONE; placement and constant gain only",
    output_sha256=hashes)
 (out/"V7_PROVENANCE.json").write_text(json.dumps(receipt,indent=2)+"\n")
 return receipt
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--sources",type=Path,required=True)
 p.add_argument("--out",type=Path,required=True);p.add_argument("--piano",type=Path)
 args=p.parse_args()
 r=render(args.sources,args.out,args.piano)
 print("verified recorded takes",len(r["samples"]),"piano included",r["original_piano_present"])
