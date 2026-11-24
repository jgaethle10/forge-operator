#!/usr/bin/env python3
"""Fallen Studios: private V17 Exotic Chiles original bilingual-accent narrator continuity audition.
Voice reference comes ONLY from the original synthetic C chosen by the founder as a
promising audition. It is not a human performer, celebrity clone, or client recording.
No client photos, videos, messages, or other private media are staged in CI.
"""
import os, sys, json, hashlib, wave, subprocess
from pathlib import Path
REF=Path(os.environ["SYNTHETIC_ORIGINAL_VOICE_REFERENCE"])
EXPECTED="2cf3c6039bd4cd5dc7b1ed492820469c58df4d804f84d09b99664081abb26b97"
REFERENCE_SCRIPT=("Ricky grows these peppers himself. He smokes them slowly, and brings the fire "
                  "to his famous guacamole. Exotic Chiles.")
VOICE_MODEL="/tmp/voice-model/qwen3-tts-12hz-1.7b-base-q8_0.gguf"
CODEC="/tmp/voice-model/qwen3-tts-tokenizer-12hz.gguf"
CUES=[
 ("grow","Ricky grows exotic peppers, smokes them, and grinds them into his own seasoning. But that's only the beginning.",0.43,10.05),
 ("guac","His famous guacamole brings the flavor front and center. Big, fresh, and with a serious kick.",10.42,18.58),
 ("range","Smoked cheeses, spicy candies, and super hot drops. There's more heat to discover.",18.64,24.67),
 ("brand","Exotic Chiles. Grown. Smoked. Crafted.",24.87,29.94),
]
assert REF.is_file()
assert hashlib.sha256(REF.read_bytes()).hexdigest()==EXPECTED,"Synthetic C reference provenance mismatch"
root=Path("original-C-accent-locked-fullcut")
root.mkdir(exist_ok=False)
records=[]
for i,(key,words,start,end) in enumerate(CUES):
 out=root/(key+".wav")
 cmd=["/tmp/crispasr_voice","--backend","qwen3-tts-1.7b-base","-m",VOICE_MODEL,
      "--codec-model",CODEC,"--voice",str(REF),"--ref-text",REFERENCE_SCRIPT,
      "--i-have-rights","--tts",words,"--tts-output",str(out),"--seed",str(8407+83*i)]
 subprocess.run(cmd,check=True,timeout=600)
 with wave.open(str(out),"rb") as wav:
  duration=wav.getnframes()/wav.getframerate()
  rate=wav.getframerate()
 if not 1.0<duration<16.0:raise RuntimeError("Invalid generated cue "+key+": "+str(duration))
 records.append(dict(key=key,script=words,start=start,end=end,file=out.name,
   durationSeconds=round(duration,3),sampleRate=rate,
   sha256=hashlib.sha256(out.read_bytes()).hexdigest()))
receipt=dict(schema="evercraft.fallen.exotic-chiles-original-C-locked-fullcut.v1",
 model="Qwen3-TTS-12Hz 1.7B Base GGUF Q8_0", voiceOrigin="original synthetic bilingual C voice",
 referenceFileName=REF.name, referenceSha256=EXPECTED, referenceText=REFERENCE_SCRIPT,
 customerSourceMediaUsed=False, celebrityOrRealPersonCloned=False,
 mexicanRegionalAccentIndependentVerification=False,
 humanListeningApproved=False, customerSendApproved=False,
 commercialReleaseApproved=False, cues=records)
(root/"receipt.json").write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+"\n")
print(json.dumps({"status":"PASS","lockedOriginalVoice":"C","generatedCues":len(records),
 "durationSeconds":sum(r["durationSeconds"] for r in records)},indent=2))
