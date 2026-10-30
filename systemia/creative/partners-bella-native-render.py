#!/usr/bin/env python3
"""Render the owned Evercraft Partners script with original Kokoro af_bella.
CI artifact contains generated dialogue only, no reused client recordings.
"""
from pathlib import Path
import os, json, hashlib, numpy as np, soundfile as sf
from kokoro import KPipeline

OUTPUT=Path("artifacts/evercraft-partners-bella")
OUTPUT.mkdir(parents=True,exist_ok=True)
LINES=[
    "Every day, somebody says, I wish I knew who could help.",
    "Sometimes, all it takes is one person saying, I know someone.",
    "You make the introduction. Evercraft handles the work.",
    "That's Evercraft Partners.",
    "Founding partner applications are open.",
    "Good work travels farther together."
]
p=KPipeline(lang_code="a",device="cpu")
clips=[]
rows=[]
for i,line in enumerate(LINES,1):
    samples=[]
    for graphemes,phonemes,audio in p(line,voice="af_bella",speed=0.97):
        if audio is not None:
            if hasattr(audio,"detach"): audio=audio.detach().cpu().numpy()
            samples.append(np.asarray(audio,dtype=np.float32))
    if not samples: raise RuntimeError(f"No Bella audio for line {i}")
    wave=np.concatenate(samples)
    # 180-ms silence to preserve conversational rhythm without arbitrary DSP pitch shifting
    clips.append(wave)
    clips.append(np.zeros(round(0.18*24000),dtype=np.float32))
    rows.append({"line":i,"text":line,"duration_seconds":round(len(wave)/24000,3)})
    sf.write(OUTPUT/f"bella_line_{i:02}.wav",wave,24000,subtype="PCM_16")
render=np.concatenate(clips)
if len(render)<10*24000 or len(render)>38*24000:
    raise RuntimeError(f"Unexpected narration length {len(render)/24000:.2f}s")
sf.write(OUTPUT/"evercraft_partners_af_bella_narration.wav",render,24000,subtype="PCM_16")
(OUTPUT/"receipt.json").write_text(json.dumps({
    "schema":"evercraft.fallen.studios.native-bella-narration.v1",
    "source":"Kokoro-82M af_bella fresh speech inference",
    "generated_from":"original authorized Evercraft Partners script",
    "speaker":"af_bella",
    "sample_rate":24000,
    "duration_seconds":round(len(render)/24000,3),
    "sha256":hashlib.sha256((OUTPUT/"evercraft_partners_af_bella_narration.wav").read_bytes()).hexdigest(),
    "lines":rows,
    "status":"rendered_not_human_approved",
    "notes":"Requires creative review and mastering before public launch."
},indent=2)+"\n")
print("BELLA_NATIVE_RENDER",round(len(render)/24000,3))
