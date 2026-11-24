#!/usr/bin/env python3
"""V20 original C voice: refine five cue performances, not a celebrity soundalike.
No real human voice reference, no client media, no commercial delivery authorization.
"""
import os,hashlib,json,wave,subprocess
from pathlib import Path
ROOT=Path("exotic-v20-c-natural-storyteller");ROOT.mkdir(exist_ok=False)
REF=Path(os.environ["ORIGINAL_SYNTHETIC_C_WAV"])
REF_HASH="2cf3c6039bd4cd5dc7b1ed492820469c58df4d804f84d09b99664081abb26b97"
assert hashlib.sha256(REF.read_bytes()).hexdigest()==REF_HASH
REFERENCE_SCRIPT=("Ricky grows these peppers himself. He smokes them slowly, and brings the fire "
                  "to his famous guacamole. Exotic Chiles.")
# Re-record the lines needing more natural storytelling; all unchanged clips sourced from V19.
LINES=[
 ("smokes","He smokes them. With patience.",3.05,5.88),
 ("grinds","Then grinds them... into his own seasoning.",5.95,10.05),
 ("guac","And his famous guacamole?",10.42,12.65),
 ("different","Well... that's a different kind of heat.",12.74,15.08),
 ("bold","Fresh. Bold. Worth remembering.",15.10,18.58),
 ("drops","And hot drops... for the brave.",21.76,24.62)
]
receipts=[]
for i,(name,copy,start,end) in enumerate(LINES):
 out=ROOT/(name+".wav")
 cmd=["/tmp/crispasr_voice","--backend","qwen3-tts-1.7b-base",
  "-m","/tmp/voice-model/qwen3-tts-12hz-1.7b-base-q8_0.gguf",
  "--codec-model","/tmp/voice-model/qwen3-tts-tokenizer-12hz.gguf",
  "--voice",str(REF),"--ref-text",REFERENCE_SCRIPT,
  "--i-have-rights","--tts",copy,"--tts-output",str(out),"--seed",str(10570+91*i)]
 subprocess.run(cmd,check=True,timeout=600)
 with wave.open(str(out),"rb") as w:
  dur=w.getnframes()/w.getframerate();rate=w.getframerate()
 assert .4<dur<10, (name,dur)
 receipts.append(dict(name=name,text=copy,start=start,end=end,file=out.name,
   duration=round(dur,3),sampleRate=rate,sha256=hashlib.sha256(out.read_bytes()).hexdigest()))
 print(name,round(dur,2),flush=True)
(ROOT/"receipt.json").write_text(json.dumps(dict(
 schema="evercraft.fallen.exotic-chiles-original-c-storyteller-v20.v1",
 referenceSha256=REF_HASH,voiceReference="original synthetic Spanish-first C",
 noCelebrityOrRealPersonSource=True, customerVideoOrPhotosInCI=False,
 regionalAccentVerified=False, creativeReviewApproved=False,
 customerReleaseApproved=False, tracks=receipts),indent=2)+"\n")
print("PASS:",len(receipts),"new audio takes, original-source verified")
