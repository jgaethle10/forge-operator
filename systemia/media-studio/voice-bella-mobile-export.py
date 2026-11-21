#!/usr/bin/env python3
"""Build review-only phone MP3 reels from verified Bella factorial native WAVs.

No speech synthesis, normalization, pitch edits or publishing. Exactly four
whole WAV clips per context, separated only by 1.5 seconds digital silence.
MP3s are listening derivatives; original dry WAVs and hashes remain unchanged.
"""
import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import wave

CONTEXTS = ("brand", "story")
GAP_SEC = 1.5
SR = 24000


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check(root):
    root = pathlib.Path(root).resolve(strict=True)
    receipt = json.loads((root / "evidence.json").read_text(encoding="utf8"))
    if not (receipt.get("schema") == "evercraft.voice-foundry.bella-factorial-study.v1"
            and receipt.get("voiceId") == "af_bella"
            and receipt.get("kokoroVersion") == "0.9.4"
            and receipt.get("nativeVoiceUnchanged") is True
            and receipt.get("publishReady") is False
            and receipt.get("founderListeningApproved") is False
            and receipt.get("cloning") is False
            and receipt.get("phonemeOverrides") is False):
        raise RuntimeError("BELLA_SOURCE_OR_APPROVAL_INVALID")
    if set(receipt.get("contexts", {})) != set(CONTEXTS):
        raise RuntimeError("INVALID_CONTEXT_SET")
    sources = {}
    for name in CONTEXTS:
        group = receipt["contexts"][name]
        if len(group) != 4 or {x.get("blindTake") for x in group} != set(range(1, 5)):
            raise RuntimeError("INVALID_BLIND_TAKES_" + name)
        if len({x.get("factorialCell") for x in group}) != 4:
            raise RuntimeError("DUPLICATE_CONDITIONS_" + name)
        files = []
        for index, row in enumerate(sorted(group, key=lambda x: x["blindTake"]), 1):
            expected = f"take-{index:02d}.wav"
            if row.get("wav") != expected:
                raise RuntimeError("SOURCE_FILENAME_INVALID")
            path = root / name / expected
            if not path.is_file() or path.is_symlink() or digest(path) != row.get("wavSha256"):
                raise RuntimeError("SOURCE_AUDIO_HASH_FAILED_" + name)
            with wave.open(str(path), "rb") as wav:
                if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, SR):
                    raise RuntimeError("SOURCE_PCM_FORMAT_FAILED")
                n = wav.getnframes()
                if not 10 <= n / SR <= 34:
                    raise RuntimeError("SOURCE_DURATION_FAILED")
            if abs(n / SR - row.get("audioMetrics", {}).get("durationSec", 0)) > .003:
                raise RuntimeError("SOURCE_DURATION_RECEIPT_MISMATCH")
            files.append(path)
        sources[name] = files
    return sources


def build(root, target):
    root, target = pathlib.Path(root).resolve(), pathlib.Path(target).resolve()
    if target.exists():
        raise RuntimeError("OUTPUT_ALREADY_EXISTS")
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("FFMPEG_NOT_INSTALLED")
    sources = check(root)  # verify ALL inputs before any output side-effect
    target.mkdir(parents=True, exist_ok=False)
    summary = {"schema": "evercraft.bella.mobile-audition.v1",
               "voiceId": "af_bella", "reviewOnly": True,
               "masteringApplied": False, "publishReady": False,
               "gapSec": GAP_SEC, "reels": {}}
    for context in CONTEXTS:
        parts, offsets, clock = [], [], 0.0
        for index, audio in enumerate(sources[context], 1):
            with wave.open(str(audio), "rb") as f:
                seconds = f.getnframes() / SR
                pcm = f.readframes(f.getnframes())
            offsets.append({"take": index, "startSec": round(clock, 3),
                            "endSec": round(clock + seconds, 3),
                            "sourceWavSha256": digest(audio)})
            parts.append(pcm)
            clock += seconds
            if index != 4:
                parts.append(bytes(int(SR * GAP_SEC) * 2))
                clock += GAP_SEC
        temp = target / (context + "_review_temp.wav")
        with wave.open(str(temp), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(SR)
            wav.writeframes(b"".join(parts))
        result = target / (context + "_four_takes.mp3")
        try:
            subprocess.run(
                ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
                 "-n", "-i", str(temp), "-codec:a", "libmp3lame",
                 "-q:a", "2", "-ar", "48000", str(result)],
                timeout=45, check=True, capture_output=True)
        finally:
            temp.unlink(missing_ok=True)
        if not result.is_file() or result.stat().st_size < 5000:
            raise RuntimeError("EMPTY_MP3_OUTPUT")
        summary["reels"][context] = {"file": result.name,
                                     "durationSec": round(clock, 3),
                                     "sha256": digest(result), "takes": offsets}
    (target / "evidence.json").write_text(json.dumps(summary, indent=2) + "\n")
    (target / "README.txt").write_text(
        "Bella V05 private listening only. Four complete native voice takes per reel.\n"
        "1.5 seconds silence between takes; use evidence.json for timestamps.\n"
        "No synthetic announcements, timbre blending, pitch shift or mastering.\n"
        "Passing audio checks do not approve acting quality, voice rights or release.\n")
    print(json.dumps({"status": "PHONE_REVIEW_EXPORTED_NOT_APPROVED",
                      "reels": summary["reels"]}, indent=2))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True)
    p.add_argument("--output", required=True)
    a = p.parse_args()
    build(a.source, a.output)
