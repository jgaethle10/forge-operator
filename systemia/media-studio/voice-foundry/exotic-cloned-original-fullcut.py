#!/usr/bin/env python3
"""Lock ORIGINAL synthetic speaker samples to a single stable commercial voice.
Reference audio generated from original descriptive prompts, not a real person.
No customer footage, original private communications, or actor samples here.
Release blocked pending founder and fluent speaker review.
"""
from pathlib import Path
import os,sys,subprocess,hashlib,json,wave
lane=os.environ["VOICE_LANE"]
assert lane in ("original_a", "grounded_a2")
ref=Path(os.environ["VOICE_REFERENCE_PATH"])
assert ref.exists() and ref.suffix==".wav"
ref_text=({"original_a":"Ricky grows extraordinary peppers. Exotic Chiles brings the fire.",
           "grounded_a2":"Ricky grows his own exotic peppers. He smokes them, grinds them, and brings that fire to his famous guacamole. Exotic Chiles."})[lane]
expected=({"original_a":"da929c9628dd294ba781e3b494a35c5f960fb2222037592a8b57f2e0726a0590",
"grounded_a2":"2366e4f4f54ff6e8b2d909b691d47357b7dcda1f58483194cbb3727628a48a9c"})[lane]
actual=hashlib.sha256(ref.read_bytes()).hexdigest()
if actual!=expected:raise RuntimeError("Synthetic voice reference hash mismatch: "+actual)
CUES=[
 ("grow", "Ricky grows exotic peppers, smokes them, and grinds them into his own seasoning. But that's only the beginning.", 0.43,10.05),
 ("guac","His famous guacamole brings the flavor front and center. Big, fresh, and with a serious kick.",10.42,18.58),
 ("range","Smoked cheeses, spicy candies, and super hot drops. There's more heat to discover.",18.64,24.67),
 ("brand","Exotic Chiles. Grown. Smoked. Crafted.",24.87,29.94),
]
assert len(CUES)==4
root=Path("voice-locked-"+lane)
root.mkdir(parents=True,exist_ok=False)
records=[]
for idx,(key,copy,start,end) in enumerate(CUES):
 dest=root/(key+".wav")
 args=["/tmp/crispasr_voice","--backend","qwen3-tts-1.7b-base","-m",
       "/tmp/voice-model/qwen3-tts-12hz-1.7b-base-q8_0.gguf",
       "--codec-model","/tmp/voice-model/qwen3-tts-tokenizer-12hz.gguf",
       "--voice",str(ref),"--ref-text",ref_text,"--i-have-rights",
       "--tts",copy,"--tts-output",str(dest),"--seed",str(7311+idx)]
 subprocess.run(args,check=True,timeout=600)
 with wave.open(str(dest),"rb") as w:
  dur=w.getnframes()/w.getframerate()
  rate=w.getframerate()
  channels=w.getnchannels()
 if not 1.0<dur<30:raise RuntimeError(f"Bad WAV duration {key} {dur}")
 records.append(dict(key=key,script=copy,file=dest.name,duration=round(dur,3),
   start=start,end=end,rate=rate,channels=channels,sha256=hashlib.sha256(dest.read_bytes()).hexdigest()))
receipt={"schema":"evercraft.fallen.original-voice-locked-fullcut.v1",
 "lane":lane,"model":"Qwen3-TTS 1.7B Base GGUF Q8_0",
 "referenceIsSyntheticOriginal":True,"referenceSha256":actual,"referenceTranscript":ref_text,
 "noCelebrityOrRealPersonVoiceCloned":True,"regionalAccentVerified":False,
 "naturalnessHumanApproved":False,"finalCommercialReleaseAuthorized":False,"cues":records}
(root/"receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
print(json.dumps({"status":"PASS","lane":lane,"cues":len(records),"totalRawSeconds":round(sum(x["duration"] for x in records),2)}))
