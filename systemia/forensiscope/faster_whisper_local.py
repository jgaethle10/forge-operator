#!/usr/bin/env python3
"""Opt-in local-only faster-whisper bridge for ForensiScope's existing ASR contract.

stdout: one JSON object with a segments array.
stderr: bounded error status. Never downloads a model or sends customer media.
Not wired to production by default.
"""
import argparse
import json
import math
import sys
from pathlib import Path

MAX_SEGMENTS = 10000


def require_files(audio_path, model_path):
    audio = Path(audio_path).expanduser().resolve(strict=True)
    model = Path(model_path).expanduser().resolve(strict=True)
    if not audio.is_file() or not model.is_dir():
        raise ValueError("input must be a file and model must be a local directory")
    # The tokenizer check also avoids model loading paths that fetch a tokenizer.
    for name in ("config.json", "model.bin", "tokenizer.json"):
        if not (model / name).is_file():
            raise ValueError("local model directory is missing required model files")
    return audio, model


def transcribe_local(audio_path, model_path, model_factory, language=None):
    """Testable engine boundary. Caller supplies the WhisperModel class."""
    audio, model_dir = require_files(audio_path, model_path)
    model = model_factory(
        str(model_dir), device="cpu", compute_type="int8", local_files_only=True
    )
    options = {"beam_size": 5, "vad_filter": False}
    if language:
        options["language"] = language
    raw_segments, _info = model.transcribe(str(audio), **options)
    segments = []
    # Consumption of this iterator actually executes inference.
    for index, segment in enumerate(raw_segments):
        if index >= MAX_SEGMENTS:
            raise ValueError("transcription exceeded per-shard segment limit")
        try:
            start = float(segment.start)
            end = float(segment.end)
            text = " ".join(str(segment.text).split())
        except (TypeError, ValueError, AttributeError):
            continue
        if not text or not math.isfinite(start) or not math.isfinite(end):
            continue
        if start < 0 or end < start:
            continue
        segments.append({"start": start, "end": end, "text": text})
    return {"segments": segments}


def main(argv=None):
    parser = argparse.ArgumentParser(description="ForensiScope local-only ASR pilot")
    parser.add_argument("--input", required=True, help="ForensiScope prepared audio path")
    parser.add_argument("--model-dir", required=True, help="Pre-installed local CTranslate2 model")
    parser.add_argument("--language", default=None, help="Optional language hint")
    args = parser.parse_args(argv)
    try:
        # Import only after all arguments are parsed. Never install or fetch models.
        from faster_whisper import WhisperModel
        payload = transcribe_local(args.input, args.model_dir, WhisperModel, args.language)
    except Exception as exc:
        # Keep customer media and extracted text out of failure logs.
        print("local ASR pilot failed: " + type(exc).__name__, file=sys.stderr)
        return 1
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, allow_nan=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
