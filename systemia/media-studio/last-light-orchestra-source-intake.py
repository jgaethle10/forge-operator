#!/usr/bin/env python3
"""Fetch and fingerprint documented University of Iowa acoustic scales.
Only authentic downloaded AIFF bytes, no General MIDI substitutions.
"""
from pathlib import Path
import hashlib,json,urllib.request,argparse
BASE="https://theremin.music.uiowa.edu/sound%20files/MIS"
SOURCES={
 "violin_pp":"Strings/violin2012/Violin.arco.pp.sulD.D4B4.stereo.aif",
 "violin_mf":"Strings/violin2012/Violin.arco.mf.sulD.D4B4.stereo.aif",
 "viola_pp":"Strings/viola2012/Viola.arco.sulG.pp.C4B4.stereo.aif",
 "cello_pp":"Strings/cello2012/Cello.arco.pp.sulC.C3C4.stereo.aif",
 "cello_mf":"Strings/cello2012/Cello.arco.mf.sulC.C3C4.stereo.aif",
 "bass_pp_low":"Strings/bass2012/Bass.arco.sulE.pp.E1Bb1.stereo.aif",
 "bass_pp_mid":"Strings/bass2012/Bass.arco.sulE.pp.B1Bb2.stereo.aif",
 "flute_pp":"Woodwinds/flute/Flute.vib.pp.C5B5.aiff",
 "horn_pp":"Brass/frenchhorn/Horn.pp.C4B4.aiff",
 "bassoon_pp":"Woodwinds/bassoon/Bassoon.pp.C3B3.aiff",
}
# Hold samples as quarantined immutable source media until pitch/segmentation
# validated in a separate evidence-bearing orchestration render.
def run(root):
 root=Path(root);root.mkdir(parents=True,exist_ok=True)
 inventory=[]
 for role,path in SOURCES.items():
  url=BASE+"/"+path
  request=urllib.request.Request(url,headers={"User-Agent":"Evercraft-Acoustic-Orchestra-Research/1.0"})
  with urllib.request.urlopen(request,timeout=40) as response:
   if response.status!=200:raise RuntimeError("source_missing:"+role)
   blob=response.read(35_000_001)
  if not 50_000<len(blob)<35_000_000:raise RuntimeError("source_bounds_failed:"+role)
  if blob[:4] != b"FORM":raise RuntimeError("source_is_not_AIFF:"+role)
  dest=root/(role+".aif")
  dest.write_bytes(blob)
  row={"role":role,"source_url":url,"original_filename":path.split("/")[-1],
   "sha256":hashlib.sha256(blob).hexdigest(),"byte_count":len(blob),
   "rights_statement":"https://theremin.music.uiowa.edu/MIS.html",
   "source_owned_by_evercraft":False,"commercial_master_approved":False}
  inventory.append(row)
  print("VERIFIED_FETCH",role,row["sha256"][:16],len(blob),flush=True)
 (root/"iowa-orchestra-source-provenance.json").write_text(json.dumps(
 {"schema":"evercraft.iowa-orchestra-source-intake.v1",
 "sources":inventory,"piano_version_1_preservation_required":True,
 "source_rights_not_exclusive":True,
 "recorded_live_ensemble":False,"human_quality_approved":False},indent=2)+"\n")
if __name__=="__main__":
 a=argparse.ArgumentParser();a.add_argument("--out",required=True);args=a.parse_args();run(args.out)
