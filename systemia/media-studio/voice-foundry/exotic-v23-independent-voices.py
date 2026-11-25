#!/usr/bin/env python3
"""Original Mexican Spanish first narrator CASTING.
Two independent vocal identities, not regenerated rephrasings of C.
No existing actor recordings, no celebrity samples, no client pictures in CI.
"""
from pathlib import Path
import json,hashlib,os,subprocess,wave
lane=os.environ["VOICE_PERSONA"]
assert lane in ("weathered","velvet")
root=Path("v23-independent-"+lane);root.mkdir(exist_ok=False)
DESIGN="/tmp/voice-model/qwen3-tts-12hz-1.7b-voicedesign-q8_0.gguf"
BASE="/tmp/voice-model/qwen3-tts-12hz-1.7b-base-q8_0.gguf"
CODEC="/tmp/voice-model/qwen3-tts-tokenizer-12hz.gguf"
SPANISH="Mira, estos chiles se cultivan con paciencia. Se ahúman despacito, y ese sabor se queda contigo. Así es Exotic Chiles."
PROMPTS={
 "weathered":("Un narrador mexicano original de setenta y cinco años. Habla español de México como lengua materna. "
 "Voz masculina profunda de pecho, textura vieja, seca y rasposa, con aire ligero y una sonrisa discreta. "
 "Su ritmo es lento y natural, tiene serenidad y autoridad sin levantar la voz. Habla como persona real, "
 "no como locutor de anuncios. Una grabación íntima y sin música. Nada de personajes famosos, imitaciones ni caricaturas."),
 "velvet":("Un hombre mexicano original de sesenta y siete años nacido en Guanajuato. Español mexicano fluido y natural como primer idioma. "
 "Voz cálida de barítono, aterciopelada, muy suave pero llena de carácter, un poco ronca y ligeramente nasal, "
 "habla de manera confidencial con pausas espontáneas y humor seco. No parece locutor de televisión, "
 "ni tiene voz de tráiler. Sin música, sin exagerar acentos regionales, sin imitar a personas conocidas.")
}
# Reuse same content and timing for controlled identity comparison against V22.
CUES=[
 ("opening","Ricky grows exotic peppers. He smokes them... with patience.",0.43,5.89),
 ("grinds","Then grinds them into his own seasoning.",5.96,10.04),
 ("guac","And his famous guacamole? Well, that's a different kind of heat.",10.46,15.07),
 ("bold","Fresh. Bold. Worth remembering.",15.14,18.55),
 ("range","Smoked cheeses. Spicy candies. And hot drops for the brave.",18.65,24.65),
 ("outro","Exotic Chiles. Grown. Smoked. Crafted.",24.87,29.94)
]
def run(args):subprocess.run(args,check=True,timeout=800)
def rec(path):
 with wave.open(str(path),"rb") as f:
  rate=f.getframerate();duration=f.getnframes()/rate
 if not .6<duration<16 or rate<16000:raise RuntimeError("Bad native WAV at "+str(path))
 return dict(file=path.name,durationSeconds=round(duration,3),sampleRate=rate,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
anchor=root/"synthetic_spanish_anchor.wav"
run(["/tmp/crispasr_voice","--backend","qwen3-tts-1.7b-voicedesign","-m",DESIGN,"--codec-model",CODEC,
     "--instruct",PROMPTS[lane],"--tts",SPANISH,"--tts-output",str(anchor),
     "--seed",str(42651 if lane=="weathered" else 67142)])
anchor_rec=rec(anchor)
print("SPANISH ANCHOR",lane,anchor_rec,flush=True)
records=[]
for idx,(key,spoken,start,end) in enumerate(CUES):
 out=root/(key+".wav")
 run(["/tmp/crispasr_voice","--backend","qwen3-tts-1.7b-base","-m",BASE,
      "--codec-model",CODEC,"--voice",str(anchor),"--ref-text",SPANISH,
      "--i-have-rights","--tts",spoken,"--tts-output",str(out),
      "--seed",str((73511 if lane=="weathered" else 83911)+idx*103)])
 r=rec(out)
 r.update(cue=key,spoken=spoken,startSec=start,endSec=end)
 print("ENGLISH CUE",lane,key,round(r['durationSeconds'],2),"allowed",round(end-start,2),flush=True)
 records.append(r)
receipt={
 "schema":"evercraft.fallen.v23-independent-spanish-first-voices.v1",
 "lane":lane,"originalSyntheticReferenceOnly":True,
 "notBasedOnOriginalC":True,"noRealPersonOrFamousVoiceSource":True,
 "noCustomerMedia":True,"accentHumanVerified":False,
 "customerDeliveryAuthorized":False,"designDescription":PROMPTS[lane],
 "anchorSpanishText":SPANISH,"anchor":anchor_rec,"cues":records}
(root/"receipt.json").write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+"\n")
print("PASS",lane,"original Spanish-designed anchor and six distinct English cues",flush=True)
