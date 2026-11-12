#!/usr/bin/env python3
"""Evercraft Relay | Bella native V05 fresh narration for private review.
Preserves the Relay script, locked scene starts and native Kokoro voice identity.
No phoneme overrides, blends, cloned voice, pitch shifts or automatic release.
"""
import hashlib
import json
from pathlib import Path
import sys
import wave

SEED = 1701
SAMPLE_RATE = 24000
SCENE_END = 31.033333
LINES = [
    ("a01", "Everyone leaves the meeting feeling certain.", 1.15),
    ("a02", "Until the same date means two different things.", 6.55),
    ("a03", "One plan begins. Another waits for permits.", 10.05),
    ("a04", "Most mistakes don't announce themselves.", 14.25),
    ("a05", "Relay finds the difference while there's still time to fix it.", 18.25),
    ("a06", "One clear decision. Shared by everyone.", 23.35),
    ("a07", "Relay. Clarity before consequences.", 26.55),
]

def verify():
    assert len(LINES) == 7
    assert [ident for ident, *_ in LINES] == [f"a{i:02d}" for i in range(1, 8)]
    assert all(0 <= start < SCENE_END for _, _, start in LINES)
    assert all("—" not in text and "–" not in text for _, text, _ in LINES)
    print("Relay native Bella V05 preview script verified")

def render(destination):
    verify()
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline

    root = Path(destination)
    root.mkdir(parents=True, exist_ok=False)
    pipeline = KPipeline(lang_code="a")
    result = []
    for i, (ident, text, start) in enumerate(LINES):
        torch.manual_seed(SEED + i)
        np.random.seed(SEED + i)
        segments = [np.asarray(chunk.audio, dtype=np.float32)
                    for chunk in pipeline(text, voice="af_bella", speed=1.0)]
        if not segments:
            raise RuntimeError(f"Missing native Bella audio: {ident}")
        audio = np.concatenate(segments)
        path = root / f"{ident}.wav"
        sf.write(path, audio, SAMPLE_RATE, subtype="PCM_16")
        with wave.open(str(path), "rb") as recorded:
            assert recorded.getnchannels() == 1
            assert recorded.getframerate() == SAMPLE_RATE
            duration = recorded.getnframes() / SAMPLE_RATE
        upper = LINES[i+1][2] if i+1 < len(LINES) else SCENE_END
        result.append({
            "id": ident, "text": text, "startSec": start,
            "durationSec": round(duration, 3), "windowEndSec": upper,
            "fitsWindow": duration <= upper - start,
            "filename": path.name, "sampleRate": SAMPLE_RATE,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()
        })
    evidence = {
        "schema": "evercraft.relay.bella-refresh.review.v1",
        "source": "Evercraft legacy Relay native V05 seven-line script",
        "videoSource": "RC34 recovered master (not bundled)",
        "voice": "af_bella", "voiceFamily": "Kokoro-82M",
        "kokoroVersion": "0.9.4", "freshSynthesis": True,
        "originalNativeVoice": True, "phonemeOverrides": False,
        "timbreBlends": False, "modelWeightsIndependentlyPinned": False,
        "sceneEndSec": SCENE_END, "reviewOnly": True,
        "humanListeningApproved": False, "publicReleaseApproved": False,
        "commercialMediaRightsReconciled": False,
        "notes": "Updated QA process, NOT an independently verified new Bella engine. Review pronunciation, semantic emphasis, and fit before soundtrack replacement.",
        "lines": result
    }
    (root / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps({"clips": len(result), "allFit": all(x["fitsWindow"] for x in result)}))

if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--verify-only":
        verify()
    elif len(sys.argv) == 2:
        render(sys.argv[1])
    else:
        raise SystemExit("Usage: relay-bella-refresh-20261111.py <outdir>|--verify-only")
