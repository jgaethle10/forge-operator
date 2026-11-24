#!/usr/bin/env python3
"""Spanish-language ad narration auditions for Exotic Chiles.
Public advertising copy ONLY. No customer photos, private chats, or media in CI.
Use Kokoro's native Spanish female voice; do not label this as English Bella.
"""
import hashlib, json, pathlib, sys
LINES=[
 ("cultivo","Ricky cultiva chiles exóticos, los ahúma y los muele para preparar su propio sazonador. ¡Y eso apenas comienza!"),
 ("guacamole","Su famoso guacamole es el protagonista: fresco, delicioso y con un toque de fuego."),
 ("productos","También prepara quesos ahumados, dulces picantes y gotas superconcentradas. ¡Mucho sabor por descubrir!"),
 ("marca","Exotic Chiles. Cultivados. Ahumados. Hechos con pasión."),
]
VOICE="ef_dora"
def verify():
 assert len(LINES)==4 and len({k for k,_ in LINES})==4
 assert all(5<=len(text.split())<=22 for _,text in LINES)
 print("PASS: four connected, Spanish-first ad passages, native Spanish voice:",VOICE)
def make(out):
 verify()
 import numpy as np, torch, soundfile as sf
 from kokoro import KPipeline
 pipe=KPipeline(lang_code='e')
 dest=pathlib.Path(out);dest.mkdir(parents=True,exist_ok=False)
 takes=[]
 for n,(key,words) in enumerate(LINES):
  for variant,speed in (("a",1.0),("b",1.09)):
   torch.manual_seed(840+n*17+(0 if variant=="a" else 100))
   np.random.seed(840+n*17+(0 if variant=="a" else 100))
   pieces=[np.asarray(chunk.audio,dtype=np.float32) for chunk in pipe(words,voice=VOICE,speed=speed)]
   if not pieces:raise RuntimeError("NO_SPANISH_AUDIO:"+key)
   fname=f"{key}_{variant}.wav";p=dest/fname
   sf.write(p,np.concatenate(pieces),24000,subtype="PCM_16")
   info=sf.info(p)
   if not 0.8<info.duration<14:raise RuntimeError("IMPLAUSIBLE_DURATION:"+key)
   takes.append(dict(key=key,variant=variant,script=words,filename=fname,voice=VOICE,
      durationSec=round(info.duration,4),rate=info.samplerate,seed=840+n*17+(0 if variant=="a" else 100),
      speed=speed,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
 (dest/"evidence.json").write_text(json.dumps(dict(schema="evercraft.fallen.exotic-chiles-spanish-auditions.v1",
  voiceId=VOICE,language="es",engine="kokoro",engineVersion="0.9.4",auditions=takes,
  humanListeningApproved=False,customerReleaseAuthorized=False,modelWeightsIndependentlyPinned=False),ensure_ascii=False,indent=2)+"\n")
 print("SUCCESS:",len(takes),"native Spanish WAV files")
if __name__=="__main__":
 if len(sys.argv)==2 and sys.argv[1]=="--verify-only":verify()
 elif len(sys.argv)==2:make(sys.argv[1])
 else:raise SystemExit("Usage: python exotic_chiles_spanish.py --verify-only|<output-dir>")
