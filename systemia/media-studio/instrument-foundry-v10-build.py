#!/usr/bin/env python3
"""Evercraft Instrument Foundry V10: real VSCO CC0 cello and violin note banks.

Builds editable SFZ one-shot instruments. Original WAV bits never altered.
Each recorded dynamic layer is selected discretely; there is NO performed
legato, continuous bow control, new microphone recording, or release approval.
"""
import argparse, hashlib, io, json, math, zipfile
from pathlib import Path
import numpy as np
import soundfile as sf
MANIFEST=Path(__file__).with_name("instrument-foundry-v10-source-bank.json")
SR=44100
def digest(raw):return hashlib.sha256(raw).hexdigest()
def git_object(raw):
 return hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()
def level_db(audio):
 return 20*math.log10(max(1e-12,float(np.sqrt(np.mean(np.square(audio,dtype=np.float64))))))
def verify(raw,spec):
 if digest(raw)!=spec["sha256"] or git_object(raw)!=spec["git_blob_sha1"]:
  raise ValueError("SOURCE_IDENTITY_DRIFT:"+spec["filename"])
 x,sr=sf.read(io.BytesIO(raw),dtype="float64",always_2d=True)
 if sr!=SR or x.shape[1]!=2 or len(x)<SR*8 or not np.isfinite(x).all():
  raise ValueError("invalid_source_audio:"+spec["filename"])
 return x
def build(source_zip,dest):
 data=json.loads(MANIFEST.read_text())
 if data["status"]!="research_not_human_accepted" or data["source_owned_by_evercraft"]:
  raise ValueError("false_rights_or_approval_claim")
 dest=Path(dest);(dest/"samples").mkdir(parents=True,exist_ok=True)
 expected={record["filename"] for record in data["files"]}
 results={}
 with zipfile.ZipFile(source_zip) as z:
  located={Path(path).name:path for path in z.namelist() if path.endswith(".wav")}
  if set(located)!=expected:raise ValueError("not_the_exact_original_bank")
  for record in data["files"]:
   name=record["filename"]
   raw=z.read(located[name]);sample=verify(raw,record)
   x=sample[int(.55*SR):int(2.5*SR)]
   initial_db=level_db(x)
   target=data["targets_dbfs"][record["instrument"]][record["dynamic"]]
   lo,hi=data["gain_limits_db"]["min"],data["gain_limits_db"]["max"]
   gain=max(lo,min(hi,target-initial_db))
   (dest/"samples"/name).write_bytes(raw)
   results[name]={"sha256":digest(raw),"instrument":record["instrument"],
     "pitch":record["pitch"],"dynamic":record["dynamic"],
     "original_sustain_dbfs":round(initial_db,3),"gain_db":round(gain,3),
     "effective_dbfs":round(initial_db+gain,3),
     "gain_limited":abs(gain-(target-initial_db))>1e-6,
     "source_audio_changed":False}
 for part,zones in data["notes"].items():
  lines=["// Evercraft Instrument Foundry V10 / CC0 recorded takes / AUDITION ONLY",
   "// one_shot plays the COMPLETE recording and intentionally ignores note-off.",
   "// No real legato, no loops, no performed transition capture.",
   "<control>","default_path=samples/","<global>",
   "loop_mode=one_shot","amp_veltrack=0"]
  for pitch,(low,high,center) in zones.items():
   if max(abs(low-center),abs(high-center))>2:raise ValueError("unsafe_pitch_zone")
   for layer,lovel,hivel in (("soft",1,64),("strong",65,127)):
    found=[r for r in data["files"] if (r["instrument"],r["pitch"],r["dynamic"])==(part,pitch,layer)]
    if len(found)!=1:raise ValueError("incomplete_recorded_root")
    r=found[0];name=r["filename"];gain=results[name]["gain_db"]
    lines.append(f"<region> sample={name} lokey={low} hikey={high} pitch_keycenter={center} lovel={lovel} hivel={hivel} volume={gain:.3f}")
  (dest/f"Evercraft_V10_{part.capitalize()}_Acoustic_OneShot.sfz").write_text("\n".join(lines)+"\n")
  assert len([x for x in lines if x.startswith("<region>")])==6
 receipt={"schema":"evercraft.instrument-foundry.v10.custody",
  "status":"AUDITION_ONLY_NOT_HUMAN_APPROVED","piano_mutated":False,
  "source_license":"CC0","source_recordings_exclusive_to_evercraft":False,
  "recorded_instruments":2,"recorded_notes":6,"recorded_velocity_layers_per_note":2,
  "genuine_performed_legato":False,"sfz_playback_externally_tested":False,
  "original_source_wav_bit_identity":True,"gain_only":True,
  "instrument_source_records":results}
 (dest/"V10_CI_INSTRUMENT_SOURCE_CUSTODY.json").write_text(json.dumps(receipt,indent=2)+"\n")
 return receipt
if __name__=="__main__":
 p=argparse.ArgumentParser()
 p.add_argument("--sources",required=True,type=Path)
 p.add_argument("--out",required=True,type=Path)
 a=p.parse_args()
 print("SOURCE-BACKED V10",len(build(a.sources,a.out)["instrument_source_records"]),"genuine WAVs")
