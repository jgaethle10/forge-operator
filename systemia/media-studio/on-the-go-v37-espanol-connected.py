#!/usr/bin/env python3
"""Fallen Studios Client 001: V37 Spanish connected performances, review only."""
from pathlib import Path
import json,hashlib
import numpy as np,torch,soundfile as sf
from kokoro import KPipeline
out=Path('onthego-v37-espanol-takes');out.mkdir(exist_ok=True)
paragraphs=[
  {'id':'opening','start':0.60,'limit':7.63,'text':'¿Otra vez esperando en el taller? Tu tiempo vale, y tu auto también necesita atención. ¿Y si el servicio viniera a ti?'},
  {'id':'brand','start':7.90,'limit':13.05,'text':'Con On The Go Mobile Quick Lube, ya no tienes que perder tiempo dando vueltas por la ciudad.'},
  {'id':'services','start':13.22,'limit':23.86,'text':'Juan llega a donde estés con cambios de aceite, filtros y servicio de frenos. Trabajo bien hecho, sin que tengas que detener tu día.'},
  {'id':'closing','start':24.04,'limit':29.52,'text':'On The Go Mobile Quick Lube. Tú sigue con lo tuyo. Nosotros vamos hasta ti.'}
]
p=KPipeline(lang_code='e')
outcomes=[]
for i,part in enumerate(paragraphs):
    cands=[]
    for j,speed in enumerate([0.95,1.0,1.06,1.12]):
        torch.manual_seed(37001+i*111+j*29);np.random.seed(37001+i*111+j*29)
        chunks=list(p(part['text'],voice='ef_dora',speed=speed))
        if not chunks:raise RuntimeError('EMPTY_'+part['id'])
        y=np.concatenate([np.asarray(c.audio,dtype=np.float32) for c in chunks]);dur=len(y)/24000
        if not np.isfinite(y).all() or np.max(np.abs(y))>1.001:raise RuntimeError('AUDIO_INVALID')
        cands.append((dur,speed,y,' '.join(str(getattr(c,'phonemes','')) for c in chunks)))
    fit=[c for c in cands if c[0]<part['limit']-part['start']-.14]
    if not fit: raise RuntimeError('NO_NATIVE_TAKE_FITS_'+part['id']+str([(round(c[0],2),c[1])for c in cands]))
    dur,speed,y,phones=fit[0]
    path=out/(part['id']+'.wav');sf.write(path,y,24000,subtype='PCM_16')
    outcomes.append({**part,'duration_sec':round(dur,3),'speed':speed,'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'phonemes':phones})
manifest={'schema':'evercraft.fallen.client001.v37.connected-spanish-takes','customer':'On The Go Mobile Quick Lube','native_voice':'Kokoro ef_dora','owner_review_required':True,'client_review_required':True,'published':False,'parts':outcomes}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'success':True,'parts':[{k:x[k] for k in ('id','start','duration_sec','speed')}for x in outcomes]},ensure_ascii=False,indent=2))
