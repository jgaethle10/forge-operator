#!/usr/bin/env python3
"""Listen computationally to the ORIGINAL V28 native Bella stem before repatching.

Audio source is an artifact already produced inside this same owned repo.
Never uploads founder reference or client footage.
"""
import json
from pathlib import Path
from faster_whisper import WhisperModel

ROOT=Path("pacific-v35-old-source-audit")
ROOT.mkdir(exist_ok=True)
p=Path("source-v28/reference_cadence.wav")
if not p.is_file():raise RuntimeError("MISSING_ORIGINAL_V28_AUDIO")
model=WhisperModel("base.en",device="cpu",compute_type="int8")
segments,info=model.transcribe(str(p),language="en",beam_size=5,word_timestamps=True,
                               vad_filter=False,condition_on_previous_text=False)
rows=[]
for s in segments:
  words=[{"word":w.word,"start":round(w.start,2),"end":round(w.end,2)} for w in s.words]
  row={"text":s.text.strip(),"start":round(s.start,2),"end":round(s.end,2),"words":words}
  print(json.dumps(row),flush=True)
  rows.append(row)
alltext=" ".join(r["text"] for r in rows).lower()
brand="pacific" in alltext
helpfound="help" in alltext
(RootReceipt:=ROOT/"receipt.json").write_text(json.dumps({"input":str(p),
 "asr_model":"base.en","native_source_only":True,
 "brand_recognized":brand,"help_recognized":helpfound,
 "full_text":alltext,"segments":rows,
 "note":"ASR independent estimate, subject to false omissions"},indent=2)+"\n")
print("BRAND_CHECK",brand,"HELP_CHECK",helpfound,flush=True)
