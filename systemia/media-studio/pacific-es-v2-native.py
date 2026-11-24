#!/usr/bin/env python3
"""Private pronunciation repair auditions for Pacific bilingual 30s commercial."""
from pathlib import Path
import hashlib,json,numpy as np,soundfile as sf,torch
from kokoro import KPipeline
OUT=Path("pacific-es-native-pronunciation-private")
PHRASES=[
 ("relate","Nos ha pasado a todos."),
 ("intro_pasifik","Por suerte, Pasífik puede ayudarte."),
 ("intro_pacific","Por suerte, Pacífic puede ayudarte."),
 ("capabilities","Desde el motor hasta la carrocería, te ayudan a volver al camino."),
 ("visit_mobile","Visita su taller en Yákima o pregunta por el servicio móvil."),
 ("closing_pasifik","Pasífik Sérvis Sénter. Para que Yákima siga en marcha."),
 ("closing_pacific","Pacífic Sérvis Sénter. Para que Yákima siga en marcha."),
]
def main():
 OUT.mkdir(exist_ok=True)
 pipe=KPipeline(lang_code="e")
 rows=[]
 for i,(key,line) in enumerate(PHRASES):
  torch.manual_seed(40000+i);np.random.seed(40000+i)
  parts=[np.asarray(x.audio,dtype=np.float32) for x in pipe(line,voice="ef_dora",speed=1.15)]
  if not parts:raise RuntimeError("Empty native Spanish audio: "+key)
  wav=np.concatenate(parts)
  file=OUT/f"{key}.wav"
  sf.write(file,wav,24000,subtype="PCM_16")
  row={"key":key,"spoken_input":line,"file":file.name,"duration_s":round(len(wav)/24000,3),"sha256":hashlib.sha256(file.read_bytes()).hexdigest()}
  print(json.dumps(row,ensure_ascii=False),flush=True)
  rows.append(row)
 (OUT/"native_receipt.json").write_text(json.dumps({"schema":"pacific.es.v2.phonetic-brand-audit","voice":"ef_dora","language":"es","client_media_uploaded":False,"takes":rows},ensure_ascii=False,indent=2))
if __name__=="__main__":main()
