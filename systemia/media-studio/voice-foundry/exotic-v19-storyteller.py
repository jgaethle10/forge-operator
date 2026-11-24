#!/usr/bin/env python3
"""Exotic Chiles V19: original synthetic elder storyteller, short intentional phrases.
Only reference is a previously-generated original AI voice approved for further testing,
never a real performer, ad, famous speaker, or the buyer.
Narration written for concise confidence and spaces between lines.
"""
import os,subprocess,hashlib,json,wave
from pathlib import Path
ROOT=Path("v19-original-storyteller-original-C");ROOT.mkdir(exist_ok=False)
REFERENCE=Path(os.environ["SYNTHETIC_REFERENCE"])
REFHASH="2cf3c6039bd4cd5dc7b1ed492820469c58df4d804f84d09b99664081abb26b97"
if hashlib.sha256(REFERENCE.read_bytes()).hexdigest()!=REFHASH:raise RuntimeError("Reference C hash mismatch")
REF_TEXT=("Ricky grows these peppers himself. He smokes them slowly, and brings the fire "
          "to his famous guacamole. Exotic Chiles.")
CUES=[
 ("pepper","Ricky grows exotic peppers.",0.43,2.75),
 ("smokes","He smokes them. Slowly.",2.80,5.65),
 ("grinds","And grinds them into his own seasoning.",5.70,10.05),
 ("guac","His famous guacamole?",10.42,12.55),
 ("different","That's a different kind of heat.",12.60,15.75),
 ("bold","Fresh. Bold. Unforgettable.",15.85,18.58),
 ("cheese","Smoked cheeses. Spicy candies.",18.64,21.35),
 ("drops","And drops with serious heat.",21.45,24.62),
 ("brand","Exotic Chiles.",24.87,27.10),
 ("tag","Grown. Smoked. Crafted.",27.16,29.92),
]
receipts=[]
for i,(key,spoken,start,end) in enumerate(CUES):
 p=ROOT/(key+".wav")
 cmd=["/tmp/crispasr_voice","--backend","qwen3-tts-1.7b-base","-m",
       "/tmp/voice-model/qwen3-tts-12hz-1.7b-base-q8_0.gguf",
       "--codec-model","/tmp/voice-model/qwen3-tts-tokenizer-12hz.gguf",
       "--voice",str(REFERENCE),"--ref-text",REF_TEXT,"--i-have-rights",
       "--tts",spoken,"--tts-output",str(p),"--seed",str(8117+i*79)]
 subprocess.run(cmd,check=True,timeout=600)
 with wave.open(str(p),"rb") as w:
  duration=w.getnframes()/w.getframerate()
  rate=w.getframerate()
 if duration<.35 or duration>14:raise RuntimeError("Invalid audio: "+key)
 receipts.append(dict(cue=key,start=start,end=end,spoken=spoken,sourceDuration=round(duration,3),
                      file=p.name,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),rate=rate))
 print(f"{key}: {duration:.3f}s / available {end-start:.3f}s",flush=True)
receipt={"schema":"evercraft.fallen.v19-original-storyteller-performance.v1",
         "model":"Qwen3-TTS Base 1.7B GGUF Q8",
         "voiceReference":"Original founder-favored synthetic C only",
         "referenceSha256":REFHASH,"referenceText":REF_TEXT,
         "foreignMediaUsedAsSynthesisReference":False,
         "identifiableActorVoiceCloned":False,
         "sourceResearchMediaIncluded":False,
         "customerMediaInGitHub":False,
         "accentIndependentlyVerified":False,
         "clientSendApproved":False,
         "retellingCopyNotClientApproved":True,
         "cues":receipts}
(ROOT/"receipt.json").write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+"\n")
print("PASS: source hash checked; ten original narration clauses synthesized")
