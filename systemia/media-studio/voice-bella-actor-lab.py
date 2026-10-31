#!/usr/bin/env python3
"""Evercraft Voice Foundry: controlled, native Bella performance auditions.

This is a REVIEW lab, not a released commercial. Original af_bella voice only.
No IPA overrides, voice blending, pitch processing, cloning or speed fitting.
All candidates use identical spoken words; punctuation and small native speed
variations are editorial hypotheses, not demonstrated improvements.
"""
from __future__ import annotations

import array
import hashlib
import html
import json
import pathlib
import re
import sys
import wave

SAMPLE_RATE = 24000
SEED = 1701
VOICE_ID = "af_bella"
MODEL_VERSION = "0.9.4"
CANONICAL = (
    "Here's what changes when the work finally clicks. "
    "You can see the next step. You know who's handling it. "
    "And nobody has to guess what happens next. "
    "It's not about doing more. It's about moving together. "
    "That's the idea behind Evercraft. And we're just getting started."
)
TAKES = {
    "golden_control": {
        "speed": 1.00,
        "text": CANONICAL,
        "direction": "Unmodified native performance at the original golden speed",
    },
    "warm_connected": {
        "speed": 0.99,
        "text": (
            "Here's what changes when the work finally clicks: "
            "you can see the next step; you know who's handling it, "
            "and nobody has to guess what happens next. "
            "It's not about doing more. It's about moving together. "
            "That's the idea behind Evercraft... and we're just getting started."
        ),
        "direction": "Connect thoughts and invite the listener into the sentence",
    },
    "clear_confident": {
        "speed": 1.01,
        "text": (
            "Here's what changes when the work finally clicks. "
            "You can see the next step; you know who's handling it. "
            "And nobody has to guess what happens next. "
            "It's not about doing more; it's about moving together. "
            "That's the idea behind Evercraft. And we're just getting started."
        ),
        "direction": "Shorter transitions with a decisive, unforced closing thought",
    },
}
# The review page never reveals these keys. Do not open evidence.json before rating.
BLIND_ORDER = ("warm_connected", "clear_confident", "golden_control")


def words(text: str) -> list[str]:
    return re.findall(r"[a-z]+(?:'[a-z]+)?", text.casefold())


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify() -> None:
    assert set(TAKES) == {"golden_control", "warm_connected", "clear_confident"}
    assert len(BLIND_ORDER) == len(set(BLIND_ORDER)) == len(TAKES)
    assert set(BLIND_ORDER) == set(TAKES)
    assert len(words(CANONICAL)) >= 40
    for key, spec in TAKES.items():
        assert words(spec["text"]) == words(CANONICAL), f"Spoken words drifted: {key}"
        assert 0.97 <= spec["speed"] <= 1.03
        assert "—" not in spec["text"] and "–" not in spec["text"]
    assert len(set(x["text"] for x in TAKES.values())) == 3
    print("PASS: same spoken words, 3 native af_bella editorial variants, release held")


def inspect_wav(path: pathlib.Path) -> dict:
    """Real-file signal metrics. Diagnostic only, not human quality scores."""
    with wave.open(str(path), "rb") as wav:
        if (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) != (SAMPLE_RATE, 1, 2):
            raise RuntimeError("INVALID_PCM_24K_MONO_16")
        frames = wav.getnframes()
        data = wav.readframes(frames)
    pcm = array.array("h")
    pcm.frombytes(data)
    if sys.byteorder == "big":
        pcm.byteswap()
    if not pcm or len(pcm) != frames:
        raise RuntimeError("EMPTY_OR_TRUNCATED_WAV")
    peak = max(abs(v) for v in pcm) / 32768
    rms = (sum(v * v for v in pcm) / len(pcm)) ** 0.5 / 32768
    duration = frames / SAMPLE_RATE
    if not (10 <= duration <= 34 and 0.008 <= rms < 0.8 and 0 < peak < 1):
        raise RuntimeError(f"AUDIO_QUALITY_GATE: duration={duration:.3f}, rms={rms:.4f}, peak={peak:.4f}")
    # 20 ms windows are more reliable for pauses than treating each zero crossing as silence.
    window = SAMPLE_RATE // 50
    active = []
    for start in range(0, frames, window):
        chunk = pcm[start:start + window]
        level = (sum(v * v for v in chunk) / len(chunk)) ** 0.5 / 32768
        active.append(level > 0.008)
    if not any(active):
        raise RuntimeError("SILENT_AUDIO")
    first = active.index(True)
    last = len(active) - 1 - active[::-1].index(True)
    longest = current = 0
    for on in active[first:last + 1]:
        current = 0 if on else current + 1
        longest = max(longest, current)
    return {
        "durationSec": round(duration, 3),
        "rmsDbfs": round(20 * __import__("math").log10(rms), 2),
        "peakDbfs": round(20 * __import__("math").log10(peak), 2),
        "leadingSilenceSec": round(first / 50, 2),
        "trailingSilenceSec": round((len(active) - 1 - last) / 50, 2),
        "longestInternalPauseSec": round(longest / 50, 2),
    }


def listening_room() -> str:
    items = []
    for i, _ in enumerate(BLIND_ORDER, 1):
        name = f"take-{i:02d}.wav"
        items.append(
            f'<section><h2>Take {i}</h2><audio controls preload="none" src="{name}"></audio>'
            '<p>Score naturalness, emotional credibility, word rhythm, brand pronunciation '
            'and sentence ending from 1 to 5 before revealing the keys.</p></section>'
        )
    script = html.escape(CANONICAL)
    return """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bella | Blind performance review</title>
<style>body{font:17px/1.5 system-ui,sans-serif;max-width:740px;margin:3rem auto;
padding:0 1rem;background:#14151b;color:#f3f2f0}section{padding:1rem 1.4rem;
border:1px solid #5a5a66;border-radius:12px;margin:1.2rem 0}
audio{width:100%}small{color:#bbb}</style></head><body>
<h1>Bella: three blind takes</h1>
<p>Same words. Same original Kokoro voice. No pitch shift or clone.
Listen on headphones, level-match playback manually, score before reading evidence.json.
A differently paced voice is not automatically a better voice.</p>
<p><strong>Locked copy:</strong> """ + script + "</p>" + "".join(items) + """
<small>REVIEW ONLY. No creative approval, rights clearance or release authorization.</small>
</body></html>"""


def generate(where: str) -> None:
    verify()
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline

    root = pathlib.Path(where)
    root.mkdir(parents=True, exist_ok=False)
    pipe = KPipeline(lang_code="a")
    records = []
    for index, key in enumerate(BLIND_ORDER, 1):
        spec = TAKES[key]
        torch.manual_seed(SEED)
        np.random.seed(SEED)
        chunks = [np.asarray(t.audio, dtype=np.float32)
                  for t in pipe(spec["text"], voice=VOICE_ID, speed=spec["speed"])]
        if not chunks:
            raise RuntimeError(f"NO_NATIVE_AUDIO: {key}")
        sound = np.concatenate(chunks)
        if sound.ndim != 1 or not np.all(np.isfinite(sound)) or np.max(np.abs(sound)) >= 1:
            raise RuntimeError(f"INVALID_AUDIO: {key}")
        path = root / f"take-{index:02d}.wav"
        sf.write(path, sound, SAMPLE_RATE, subtype="PCM_16")
        metrics = inspect_wav(path)
        records.append({
            "blindTake": index,
            "key": key,
            "text": spec["text"],
            "spokenWordCount": len(words(spec["text"])),
            "editorialHypothesis": spec["direction"],
            "nativeSpeed": spec["speed"],
            "seed": SEED,
            "filename": path.name,
            "sha256": sha256(path),
            "signal": metrics,
        })
    if len({x["sha256"] for x in records}) != 3:
        raise RuntimeError("NO_DISTINCT_PERFORMANCES")
    durations = [x["signal"]["durationSec"] for x in records]
    if max(durations) / min(durations) > 1.2:
        raise RuntimeError("DURATION_VARIATION_REVIEW_HOLD")
    evidence = {
        "schema": "evercraft.voice-foundry.bella-actor-lab.v1",
        "voiceId": VOICE_ID,
        "model": "Kokoro-82M",
        "kokoroVersion": MODEL_VERSION,
        "reference": "Native af_bella voice, original speech generation",
        "sameSpokenWords": True,
        "nativeProsodyOnly": True,
        "pitchShift": False,
        "voiceBlending": False,
        "phonemeOverrides": False,
        "modelWeightsIndependentlyPinned": False,
        "humanListeningApproved": False,
        "brandPronunciationApproved": False,
        "commercialRightsIndependentlyVerified": False,
        "customerApproved": False,
        "published": False,
        "masteringApplied": False,
        "signalMetricsAreNotPerceptualRatings": True,
        "blindTakes": records,
    }
    (root / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    (root / "index.html").write_text(listening_room(), encoding="utf-8")
    print(json.dumps({"status": "GENERATED_REVIEW_ONLY", "takeCount": len(records),
                      "wavDigests": [x["sha256"] for x in records]}, indent=2))


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--verify-only":
        verify()
    elif len(sys.argv) == 2:
        generate(sys.argv[1])
    else:
        raise SystemExit("Usage: voice-bella-actor-lab.py <new-out-dir> | --verify-only")
