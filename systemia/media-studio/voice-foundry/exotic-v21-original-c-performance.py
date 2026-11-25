#!/usr/bin/env python3
"""Original synthetic C narrator, final-passage auditions. No actor cloning.
Two independent takes of the same vetted V20 promotional copy; in CI only
source-controlled text and our earlier privately generated synthetic C voice.
"""
from pathlib import Path
import hashlib,json,os,subprocess,wave
lane=os.environ["STORYTELLER_LANE"]
assert lane in ("restrained","warm")
ref=Path(os.environ["SYNTHETIC_C_REFERENCE"])
expected="2cf3c6039bd4cd5dc7b1ed492820469c58df4d804f84d09b99664081abb26b97"
if hashlib.sha256(ref.read_bytes()).hexdigest()!=expected:raise RuntimeError("C reference SHA mismatch")
reference_text="Ricky grows these peppers himself. He smokes them slowly, and brings the fire to his famous guacamole. Exotic Chiles."
# Intentionally minimal editing of owner's near-approved V20 copy.
words={
  "smokes":("He smokes them. With patience.","He smokes them... with patience."),
  "guac":("And his famous guacamole?","And his famous guacamole?"),
  "different":("Well... that's a different kind of heat.","Well, that's a different kind of heat."),
  "bold":("Fresh. Bold. Worth remembering.","Fresh. Bold. Worth remembering."),
  "drops":("And hot drops... for the brave.","And hot drops... for the brave."),
  "brand":("Exotic Chiles.","Exotic Chiles."),
  "tag":("Grown. Smoked. Crafted.","Grown. Smoked. Crafted."),
}
index=0 if lane=="restrained" else 1
root=Path("v21-original-c-"+lane);root.mkdir(exist_ok=False)
items=[]
for i,(key,text_variants) in enumerate(words.items()):
    line=text_variants[index]
    dest=root/(key+".wav")
    cmd=["/tmp/crispasr_voice","--backend","qwen3-tts-1.7b-base",
         "-m","/tmp/voice-model/qwen3-tts-12hz-1.7b-base-q8_0.gguf",
         "--codec-model","/tmp/voice-model/qwen3-tts-tokenizer-12hz.gguf",
         "--voice",str(ref),"--ref-text",reference_text,"--i-have-rights",
         "--tts",line,"--tts-output",str(dest),
         "--seed",str((23117 if lane=="restrained" else 31627)+i*149)]
    subprocess.run(cmd,check=True,timeout=600)
    with wave.open(str(dest),"rb") as f:
      dur=f.getnframes()/f.getframerate();sr=f.getframerate()
    if not 0.35<dur<12 or sr<16000:raise RuntimeError("Invalid audio: "+key)
    items.append(dict(cue=key,text=line,durationSec=round(dur,4),sampleRate=sr,
                      sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),file=dest.name))
    print(lane,key,dur,flush=True)
(root/"receipt.json").write_text(json.dumps(dict(
    schema="evercraft.fallen.exotic-v21-original-c-performances.v1",
    lane=lane,voiceReference="Original synthetic Mexican-Spanish-first C candidate",
    referenceSha256=expected,onlyOriginalSyntheticVoice=True,actorOrCelebrityClone=False,
    customerMediaInRepository=False,independentAccentVerification=False,
    humanListeningReview=False,commercialReleaseAuthorized=False,cues=items
),indent=2)+"\n")
print("PASS: 7 real original-voice WAVs with source SHA receipts")
