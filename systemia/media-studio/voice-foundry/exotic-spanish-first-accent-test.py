#!/usr/bin/env python3
"""Original consent-free synthetic voice design using Spanish-first conditioning.
No actor reference audio, real person's sample, customer media, or private information.
This test does NOT assert that the resulting accent is Mexican until fluent review.
"""
import os, subprocess, hashlib, json, wave
from pathlib import Path
ROOT=Path("spanish-first-mexican-accent-auditions")
ROOT.mkdir(parents=True,exist_ok=False)
CODEC="/tmp/voice-model/qwen3-tts-tokenizer-12hz.gguf"
VOICE_MODEL="/tmp/voice-model/qwen3-tts-12hz-1.7b-voicedesign-q8_0.gguf"
CLONE_MODEL="/tmp/voice-model/qwen3-tts-12hz-1.7b-base-q8_0.gguf"
SPANISH="Mira, estos chiles se cultivan con paciencia. Se ahúman despacito, y ese sabor se queda contigo. Así es Exotic Chiles."
ENGLISH="Ricky grows these peppers himself. He smokes them slowly, and brings the fire to his famous guacamole. Exotic Chiles."
BILINGUAL="Mira, esto se hace con paciencia. Ricky grows these peppers himself. He smokes them slowly, and brings the fire to his famous guacamole. Exotic Chiles."
DESIGN_ES=("Un hombre mexicano original de unos sesenta y cinco años, nacido y criado en el centro de México. "
 "Habla en español mexicano cotidiano, con naturalidad y sin exagerar un acento regional. "
 "Voz masculina grave, cálida, ligeramente rasposa por la edad, pausas humanas y una sonrisa contenida. "
 "Cuenta una historia en voz baja, cerca del micrófono. Nada de tono publicitario, nada de caricatura, ninguna imitación de un actor.")
DESIGN_EN=("Original bilingual Mexican man in his late sixties whose first language is Mexican Spanish, now speaking clear conversational English with a noticeable but natural Spanish-influenced Mexican accent. "
 "Age-worn low chest resonance, slight dry rasp, expressive cadence, simple warmth and subtle confidence; speak like a friendly older man talking to a neighbor, NOT like an American TV announcer. "
 "Native Mexican Spanish rhythm carries naturally into English; do not exaggerate vowels or invent comic pronunciations. No impersonation of any recognizable speaker.")
DESIGN_BI=("Hombre mexicano bilingüe de unos sesenta y cinco años. Su idioma materno es el español de México y cuando habla inglés mantiene naturalmente su cadencia mexicana. "
 "Habla con voz grave, cálida, ligeramente rasposa y relajada, sin locución de radio; pronunciación clara y natural. "
 "Cambia entre español e inglés de manera espontánea, sin caricatura ni imitar a ninguna persona real.")
TAKES=[
("00_native_mexican_spanish_anchor", "qwen3-tts-1.7b-voicedesign",VOICE_MODEL,DESIGN_ES,SPANISH,42),
("01_english_spanish_first_direct","qwen3-tts-1.7b-voicedesign",VOICE_MODEL,DESIGN_EN,ENGLISH,44),
("02_bilingual_spanish_first_direct","qwen3-tts-1.7b-voicedesign",VOICE_MODEL,DESIGN_BI,BILINGUAL,46),
]
def run(args):
 subprocess.run(args,check=True,timeout=800)
def wav_record(path):
 with wave.open(str(path),"rb") as w:
  duration=w.getnframes()/w.getframerate()
  rate=w.getframerate()
  channels=w.getnchannels()
 if duration<3 or duration>35 or rate<16000: raise RuntimeError("Implausible audio: "+str(path)+":"+str(duration))
 return dict(file=path.name,durationSeconds=round(duration,2),sampleRate=rate,channels=channels,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
records=[]
for key,backend,model,instruct,spoken,seed in TAKES:
 output=ROOT/(key+".wav")
 run(["/tmp/crispasr_voice","--backend",backend,"-m",model,"--codec-model",CODEC,
      "--instruct",instruct,"--tts",spoken,"--tts-output",str(output),"--seed",str(seed)])
 records.append(dict(name=key,languageMode="Spanish" if key.startswith("00") else ("bilingual" if key.startswith("02") else "English"),
   model=backend,instruct=instruct,text=spoken,seed=seed,**wav_record(output)))
# Voice cloning from a wholly ORIGINAL synthetic Spanish-language reference.
output=ROOT/"03_english_cloned_from_spanish_anchor.wav"
run(["/tmp/crispasr_voice","--backend","qwen3-tts-1.7b-base","-m",CLONE_MODEL,
     "--codec-model",CODEC,"--voice",str(ROOT/(TAKES[0][0]+".wav")),"--ref-text",SPANISH,
     "--i-have-rights","--tts",ENGLISH,"--tts-output",str(output),"--seed","47"])
records.append(dict(name="03_english_cloned_from_spanish_anchor",languageMode="English-from-Spanish-reference",model="qwen3-tts-1.7b-base",
  referenceSource="original synthetic 00_native_mexican_spanish_anchor.wav",referenceText=SPANISH,text=ENGLISH,seed=47,**wav_record(output)))
receipt={"schema":"evercraft.fallen.original-mexican-spanish-first-accent-test.v1",
 "modelEngine":"CrispASR / Qwen3-TTS VoiceDesign 1.7B Q8 + Base 1.7B Q8",
 "originalSyntheticReferenceOnly":True,"actorOrRealPersonClone":False,
 "accentMexicanIndependentlyVerified":False,
 "humanListeningApproved":False,"commercialReleaseAllowed":False,
 "samples":records}
(ROOT/"receipt.json").write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+"\n")
print("PASS: ",len(records),"authentic audio WAVs & hashes generated; subjective accent/voice quality pending")
