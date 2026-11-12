#!/usr/bin/env python3
"""Pacific client preview: original native Evercraft Bella (Kokoro af_bella) narration.
Private listening review only. No cloned/recast voice or publication approval.
"""
import hashlib
import json
from pathlib import Path
import sys
import wave

SEED = 2411
SAMPLE_RATE = 24000
SCENE_END = 30.208333
LINES = [
    ("p01", "When your vehicle needs attention, every detail matters.", 0.50),
    ("p02", "The right tools. The right experience. And people who care about getting it right.", 4.85),
    ("p03", "From the engine bay to the finishing touches, Pacific puts the work first.", 10.65),
    ("p04", "Real repairs. Real craftsmanship. Right here in Yakima.", 16.35),
    ("p05", "Visit the service center, or let our mobile mechanics come to you.", 20.65),
    ("p06", "Pacific. Keeping Yakima moving.", 26.80),
]

def verify():
    assert len(LINES) == 6
    assert all(0 <= start < SCENE_END for _, _, start in LINES)
    assert all("—" not in text and "–" not in text for _, text, _ in LINES)
    print("Pacific Bella native V05 private preview verified")

def render(destination):
    verify()
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline
    root = Path(destination)
    root.mkdir(parents=True, exist_ok=False)
    pipeline = KPipeline(lang_code="a")
    receipts = []
    for i, (ident, text, start) in enumerate(LINES):
        torch.manual_seed(SEED + i)
        np.random.seed(SEED + i)
        segments = [np.asarray(chunk.audio, dtype=np.float32)
                    for chunk in pipeline(text, voice="af_bella", speed=1.0)]
        if not segments:
            raise RuntimeError(f"No audio generated for {ident}")
        audio = np.concatenate(segments)
        path = root / f"{ident}.wav"
        sf.write(path, audio, SAMPLE_RATE, subtype="PCM_16")
        with wave.open(str(path), "rb") as w:
            assert w.getnchannels() == 1 and w.getframerate() == SAMPLE_RATE
            duration = w.getnframes() / SAMPLE_RATE
        upper = LINES[i+1][2] if i+1 < len(LINES) else SCENE_END
        receipts.append({
            "id": ident, "text": text, "startSec": start,
            "durationSec": round(duration, 3), "windowEndSec": upper,
            "fitsWindow": duration <= upper - start, "filename": path.name,
            "sampleRate": SAMPLE_RATE,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()
        })
    evidence = {
        "schema": "evercraft.pacific.bella-v05.private-review.v1",
        "voice": "af_bella", "voiceFamily": "Kokoro-82M",
        "kokoroVersion": "0.9.4", "freshSynthesis": True,
        "source": "Pacific service center client creative draft",
        "phonemeOverrides": False, "timbreBlends": False,
        "nativeVoice": True, "sceneEndSec": SCENE_END,
        "reviewOnly": True, "publicReleaseApproved": False,
        "humanListeningApproved": False, "commercialMediaRightsReconciled": False,
        "notes": "Requires human listening, timing and brand approval. This artifact is audio-only; it does not claim a completed commercial.",
        "lines": receipts
    }
    (root / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps({"clips": len(receipts), "allFit": all(x["fitsWindow"] for x in receipts)}))

if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--verify-only":
        verify()
    elif len(sys.argv) == 2:
        render(sys.argv[1])
    else:
        raise SystemExit("Usage: pacific-bella-v05-private.py <outdir>|--verify-only")
