#!/usr/bin/env python3
"""Fallen V22: connected spoken phrases with original Spanish-first synthetic C.
Uses a distinct original vocal identity; no actor recording, imitation, cloning,
or historical advert audio as input. Only textual performance research used.
"""
from pathlib import Path
import hashlib,json,os,subprocess,wave
lane=os.environ["NARRATOR_LANE"]
assert lane in ("understated","fireside")
root=Path("v22-original-c-"+lane);root.mkdir(exist_ok=False)
ref=Path(os.environ["SYNTHETIC_C_REFERENCE"])
sha="2cf3c6039bd4cd5dc7b1ed492820469c58df4d804f84d09b99664081abb26b97"
if hashlib.sha256(ref.read_bytes()).hexdigest()!=sha:raise RuntimeError("Synthetic C source mismatch")
ref_text="Ricky grows these peppers himself. He smokes them slowly, and brings the fire to his famous guacamole. Exotic Chiles."
# Connected natural speech rather than individually stitched words.
# Visual edit timing remains the existing owner-reviewed 30s V13 cut.
scripts={
"understated":[
("opening","Ricky grows exotic peppers. He smokes them... with patience.",0.43,5.89),
("guac","And his famous guacamole? Well, that's a different kind of heat.",10.46,15.07),
("range","Smoked cheeses. Spicy candies. And hot drops... for the brave.",18.65,24.65),
("outro","Exotic Chiles. Grown. Smoked. Crafted.",24.87,29.94)],
"fireside":[
("opening","Ricky grows exotic peppers. He smokes them. With patience.",0.43,5.89),
("guac","And his famous guacamole? Well... that's a different kind of heat.",10.46,15.07),
("range","Smoked cheeses, spicy candies, and hot drops. For the brave.",18.65,24.65),
("outro","Exotic Chiles. Grown. Smoked. Crafted.",24.87,29.94)]
}
records=[]
for idx,(key,words,start,end) in enumerate(scripts[lane]):
 dest=root/(key+".wav")
 cmd=["/tmp/crispasr_voice","--backend","qwen3-tts-1.7b-base",
      "-m","/tmp/voice-model/qwen3-tts-12hz-1.7b-base-q8_0.gguf",
      "--codec-model","/tmp/voice-model/qwen3-tts-tokenizer-12hz.gguf",
      "--voice",str(ref),"--ref-text",ref_text,"--i-have-rights",
      "--tts",words,"--tts-output",str(dest),
      "--seed",str((26017 if lane=="understated" else 32221)+idx*211)]
 subprocess.run(cmd,check=True,timeout=720)
 with wave.open(str(dest),"rb") as wav:
  rate=wav.getframerate();duration=wav.getnframes()/rate
 if not (0.7<duration<14 and rate>=16000):raise RuntimeError("Invalid WAV "+key)
 records.append(dict(cue=key,spoken=words,startSec=start,endSec=end,durationSec=round(duration,3),
                     sampleRate=rate,file=dest.name,sha256=hashlib.sha256(dest.read_bytes()).hexdigest()))
 print(lane,key,round(duration,2),round(end-start,2),flush=True)
(root/"receipt.json").write_text(json.dumps(dict(schema="evercraft.fallen.v22-original-c-connected-performance.v1",
lane=lane,referenceSha256=sha,model="Qwen3-TTS 1.7B Base Q8 GGUF",
actorRecordingUsed=False,celebrityImpersonation=False,
originalSyntheticReferenceOnly=True,
regionalAccentVerifiedByNativeSpeaker=False,ownerCreativeApproval=False,
customerDeliveryAuthorized=False,cues=records),indent=2)+"\n")
print("PASS four connected original narrator performances",flush=True)
