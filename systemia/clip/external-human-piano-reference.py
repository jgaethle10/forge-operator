#!/usr/bin/env python3
"""CC BY 3.0 HUMAN-performance reference. Never original Evercraft music."""
import hashlib,io,json
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import Request,urlopen
import numpy as np
import soundfile as sf
OUT=Path("artifacts/evercraft-human-played-reference")
URL="https://upload.wikimedia.org/wikipedia/commons/b/be/Clair_de_lune_%28Claude_Debussy%29_Suite_bergamasque.ogg"
PAGE="https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg"
LICENSE="https://creativecommons.org/licenses/by/3.0/"
with urlopen(Request(URL,headers={"User-Agent":"EvercraftPerformanceReference/0.1 (educational comparison, contact Github jgaethle10/forge-operator)"}),timeout=60) as stream:
    data=stream.read(22000001)
if not 500000<len(data)<22000000 or not data.startswith(b"OggS"):
    raise RuntimeError("source_unverified_or_invalid")
with sf.SoundFile(io.BytesIO(data)) as f:
    start=67.0;duration=13.5
    if f.frames/f.samplerate<start+duration:raise RuntimeError("unexpected_source_duration")
    sample_rate=f.samplerate;f.seek(int(start*sample_rate))
    sound=f.read(int(duration*sample_rate),dtype="float32",always_2d=True)
fade=int(.12*sample_rate)
sound[:fade]*=np.linspace(0,1,fade)[:,None]
sound[-fade:]*=np.linspace(1,0,fade)[:,None]
OUT.mkdir(parents=True,exist_ok=True)
p=OUT/"REAL_PIANIST_REFERENCE_NOT_EVERCRAFT_COMPOSITION.wav"
sf.write(p,sound,sample_rate,subtype="PCM_16")
receipt={"schema":"evercraft.external-performer-listening-reference.v1",
    "performer":"Laurens Goedhart","composition":"Claude Debussy - Clair de lune",
    "source_url":PAGE,"source_file":URL,
    "recording_license":"Creative Commons Attribution 3.0",
    "license_url":LICENSE,
    "changes":"13.5-second excerpt from 1:07.0 with 0.12s entry and exit fades",
    "source_sha256":hashlib.sha256(data).hexdigest(),
    "excerpt_sha256":hashlib.sha256(p.read_bytes()).hexdigest(),
    "downloaded_at":datetime.now(timezone.utc).isoformat(),
    "musical_quality":"Not quantified by waveform metrics; human listening required",
    "evercraft_original_composition":False,"production_release_authority":False,
    "commercial_use_approved_by_evercraft":False,"human_listening_reference_only":True}
(OUT/"source_rights_and_hash.json").write_text(json.dumps(receipt,indent=2)+"\n")
print(json.dumps({"success":True,"performer":"Laurens Goedhart",
    "duration":duration,"sha256":receipt["excerpt_sha256"],
    "evercraft_music":False,"release":False}))
