#!/usr/bin/env python3
"""One-off, no-cloud neural TTS audition: real Piper voices, no release authority."""
import array
import hashlib
import html
import json
import math
import pathlib
import subprocess
import sys
import wave

SCRIPT = (
    "Every new world begins with a question. "
    "What if we built something worth believing in? "
    "This is Evercraft. And this is only the beginning."
)
SPEAKERS = (14, 91, 217, 531)
MODEL_CARD = "https://huggingface.co/rhasspy/piper-voices/blob/v1.0.0/en/en_US/libritts/high/MODEL_CARD"


def sha(file):
    hash_ = hashlib.sha256()
    with open(file, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            hash_.update(block)
    return hash_.hexdigest()


def run(argv, script=None):
    subprocess.run(argv, input=script, text=True, check=True, timeout=150)


def audio_metrics(p):
    with wave.open(str(p), "rb") as w:
        rate, width, channels = w.getframerate(), w.getsampwidth(), w.getnchannels()
        duration = w.getnframes() / rate
        b = w.readframes(w.getnframes())
    if not (0.7 < duration < 50 and width == 2 and channels == 1):
        raise RuntimeError("Unexpected model output WAV; holding audition")
    samples = array.array("h")
    samples.frombytes(b)
    rms = math.sqrt(sum(n * n for n in samples) / len(samples)) / 32768
    if rms <= 0.005:
        raise RuntimeError("Audio is silent or invalid; holding audition")
    return {"durationSec": round(duration, 3), "sampleRate": rate, "rms": round(rms, 5)}


def render(model_file, config_file, output_folder):
    if not pathlib.Path(model_file).is_file() or not pathlib.Path(config_file).is_file():
        raise RuntimeError("Pinned neural model/config absent")
    output = pathlib.Path(output_folder)
    output.mkdir(parents=True, exist_ok=False)
    report = {
        "schema": "evercraft.voice-foundry.real-neural-comparison.v1",
        "status": "private_audition_not_approved",
        "script": SCRIPT,
        "model": "Piper en_US-libritts-high",
        "modelCard": MODEL_CARD,
        "modelSha256": sha(model_file),
        "configSha256": sha(config_file),
        "datasetLicense": "CC BY 4.0 (LibriTTS; attribution required)",
        "humanListeningVerified": False,
        "voiceNaturalnessVerified": False,
        "voiceRightsIndependentlyVerified": False,
        "publicationAuthorityGranted": False,
        "candidates": [],
    }
    for i, speaker in enumerate(SPEAKERS, 1):
        name = f"candidate-{i:02d}"
        wav = output / (name + ".wav")
        mp3 = output / (name + ".mp3")
        run(["piper", "--model", model_file, "--config", config_file,
             "--speaker", str(speaker), "--output_file", str(wav)], SCRIPT + "\n")
        metrics = audio_metrics(wav)
        run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
             "-i", str(wav), "-codec:a", "libmp3lame", "-q:a", "3", str(mp3)])
        report["candidates"].append({
            "id": name, "speakerIndex": speaker, "wav": wav.name, "mp3": mp3.name,
            "wavSha256": sha(wav), "mp3Sha256": sha(mp3), **metrics,
        })
    (output / "audition-report.json").write_text(json.dumps(report, indent=2) + "\n")
    players = "".join(
        "<section><h2>" + c["id"] + "</h2><audio controls preload='metadata' src='" +
        c["mp3"] + "'></audio><p>" + str(c["durationSec"]) +
        " seconds. Identity intentionally hidden for listening.</p></section>"
        for c in report["candidates"]
    )
    page = """<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Evercraft Neural Voice Auditions</title>
<style>body{background:#111925;color:#f0f5ff;font:16px system-ui;max-width:750px;margin:40px auto;padding:0 20px}section{border:1px solid #586275;border-radius:15px;padding:20px;margin:17px 0}audio{width:100%}p{line-height:1.5;color:#c0cadb}a{color:#91beff}</style>
<h1>Voice Foundry: real neural voice listening room</h1>
<p>Four independently generated speaker IDs from an actual Piper neural voice model.
Same script, no post-processing illusions, no editing, no release approval.</p>
<p><b>Script:</b> """ + html.escape(SCRIPT) + "</p>" + players + """
<p>Attribution: en_US-libritts-high Piper voice (LibriTTS train-clean-360, CC BY 4.0).
<a href='""" + MODEL_CARD + """'>Source and model card</a>. Final rights review required.</p>
<p>Not a proof of cinematic quality, accent or independently verified consent.</p></html>"""
    (output / "index.html").write_text(page)
    print(json.dumps({"status": report["status"], "generated": len(report["candidates"])}, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: voice-neural-audition-ci.py MODEL CONFIG NEW_OUTPUT_DIR")
    render(*sys.argv[1:])
