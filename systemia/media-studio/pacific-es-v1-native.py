#!/usr/bin/env python3
"""Pacific Service Center, Spanish commercial. Private native TTS only.
Generates neutral Mexican/US Spanish narration; the owner's client and reference
media never enter this CI process.
"""
from pathlib import Path
import hashlib,json
import numpy as np
import soundfile as sf
import torch
from kokoro import KPipeline

OUT=Path("pacific-es-native-voice-private")
LINES=[
  ("opening", "Seguro tienes cosas que hacer."),
  ("other_plans", "Pero tu carro podría tener otros planes."),
  ("relate", "A todos nos ha pasado."),
  ("pacific_intro", "Por suerte, Pacific puede ayudarte."),
  ("crew", "Su equipo encuentra el problema y se pone manos a la obra."),
  ("capabilities", "Del motor a la carrocería, te ayudan a volver al camino."),
  ("visit_mobile", "Visita su taller en Yakima o pregunta por el servicio móvil."),
  ("closing", "Pacific Service Center. Para que Yakima siga en marcha."),
]
def main():
  OUT.mkdir(exist_ok=True)
  pipe=KPipeline(lang_code="e")
  runs=[("conversational",1.15,24340),("measured",1.05,24350)]
  result=[]
  for label,speed,seed in runs:
    for i,(key,text) in enumerate(LINES):
      np.random.seed(seed+i);torch.manual_seed(seed+i)
      pieces=[np.asarray(x.audio,dtype=np.float32) for x in pipe(text,voice="ef_dora",speed=speed)]
      if not pieces:raise RuntimeError("EMPTY_AUDIO "+key)
      audio=np.concatenate(pieces)
      file=OUT/f"{label}_{key}.wav"
      sf.write(file,audio,24000,subtype="PCM_16")
      row={"file":file.name,"key":key,"text":text,"duration_s":round(len(audio)/24000,3),
            "voice":"ef_dora","speed":speed,
            "sha256":hashlib.sha256(file.read_bytes()).hexdigest()}
      print(json.dumps(row,ensure_ascii=False),flush=True)
      result.append(row)
  (OUT/"voice_receipt.json").write_text(json.dumps({
    "schema":"evercraft.fallen.pacific.es.private.v1",
    "runs":runs,"language":"es","lines":result,
    "founder_or_customer_media_uploaded":False,
    "not_sent_to_client":True,
    "human_native_language_signoff_outstanding":True
  },ensure_ascii=False,indent=2)+"\n")
if __name__=="__main__": main()
