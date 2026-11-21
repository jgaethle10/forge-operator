#!/usr/bin/env python3
"""Evercraft Client 001: Spanish narration takes for On The Go.
Private review, no publishing or delivery. Natural Spanish voice ef_dora, Kokoro 0.9.4.
"""
from pathlib import Path
import json, hashlib
import torch, numpy as np, soundfile as sf
from kokoro import KPipeline
root=Path("onthego-v36-espanol-native")
root.mkdir(exist_ok=True)
segments=[
 {"id":"hook","start":0.74,"latest_end":7.55,"text":"¿Sigues esperando? Tu tiempo vale. No pierdas el día en el taller."},
 {"id":"brand_intro","start":8.40,"latest_end":12.85,"text":"On The Go Mobile Quick Lube va hasta donde estés."},
 {"id":"real_service","start":13.15,"latest_end":17.55,"text":"Servicio de verdad, directamente donde tú lo necesitas."},
 {"id":"oil_filters","start":17.67,"latest_end":20.90,"text":"Cambios de aceite y filtros."},
 {"id":"brakes","start":21.05,"latest_end":23.58,"text":"También servicio de frenos."},
 {"id":"closing","start":24.06,"latest_end":29.58,"text":"On The Go Mobile Quick Lube. ¡Déjanos ir hasta ti!"}
]
pipe=KPipeline(lang_code='e')
results=[]
for i,seg in enumerate(segments):
    candidates=[]
    for j,speed in enumerate([1.02,1.10,1.18]):
        torch.manual_seed(36000+i*101+j*19)
        np.random.seed(36000+i*101+j*19)
        parts=list(pipe(seg["text"],voice="ef_dora",speed=speed))
        if not parts:raise RuntimeError("TTS_EMPTY "+seg["id"])
        audio=np.concatenate([np.asarray(p.audio,dtype=np.float32) for p in parts])
        if not np.isfinite(audio).all() or np.max(np.abs(audio))>1.0001:raise RuntimeError("TTS_BAD_AUDIO "+seg["id"])
        duration=len(audio)/24000
        candidates.append({"speed":speed,"duration":duration,"audio":audio,"phonemes":" ".join(str(getattr(p,'phonemes','')) for p in parts)})
    good=[c for c in candidates if c["duration"] <= seg["latest_end"]-seg["start"]-0.08]
    if not good:
        raise RuntimeError("VOICE_DOES_NOT_FIT "+seg["id"]+" "+str([(c["speed"],round(c["duration"],2)) for c in candidates]))
    chosen=good[0]
    dest=root/(seg["id"]+".wav")
    sf.write(dest,chosen["audio"],24000,subtype="PCM_16")
    results.append({"id":seg["id"],"start":seg["start"],"latest_end":seg["latest_end"],
      "text":seg["text"],"duration":round(chosen["duration"],3),"speed":chosen["speed"],
      "voice":"ef_dora","lang_code":"e","phonemes":chosen["phonemes"],
      "filename":dest.name,"sha256":hashlib.sha256(dest.read_bytes()).hexdigest()})
manifest={"schema":"evercraft.fallen-studios.onthego.v36-spanish-voice-review",
  "client_id":"CLIENT-001","target":"30-second full Spanish commercial",
  "approved_video_source":"On The Go V35 30 sec HD picture",
  "speech_model":"Kokoro-82M 0.9.4","voice":"ef_dora",
  "linguistic_review":"pending","phone_listening":"pending","client_approval":"pending",
  "external_delivery":False,"published":False,"segments":results}
(root/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
print(json.dumps({"status":"GENERATED_FOR_REVIEW","segments":[{"id":r["id"],"start":r["start"],"duration":r["duration"],"speed":r["speed"]}for r in results]},indent=2))
