#!/usr/bin/env python3
"""Listen-first cadence lab: same Piper voices and WORDS, phrasing variants only."""
import array
import hashlib
import html
import json
import math
import pathlib
import re
import subprocess
import sys
import wave

ORIGINAL = (
    "Every new world begins with a question. "
    "What if we built something worth believing in? "
    "This is Evercraft. And this is only the beginning."
)
JOINED = (
    "Every new world begins with a question. "
    "What if we built something worth believing in? "
    "This is Evercraft, and this is only the beginning."
)
CONNECTED = (
    "Every new world begins with a question: "
    "what if we built something worth believing in? "
    "This is Evercraft, and this is only the beginning."
)
# A (14), C (217). These are the user's two preferred speaker identities.
SPEAKERS = (("A", 14), ("C", 217))
VARIANTS = (
    ("original", ORIGINAL, 1.00, 0.20),
    ("joined", JOINED, 1.00, 0.20),
    ("flow", JOINED, 1.08, 0.07),
    ("connected", CONNECTED, 1.04, 0.12),
)
MODEL_CARD = "https://huggingface.co/rhasspy/piper-voices/blob/v1.0.0/en/en_US/libritts/high/MODEL_CARD"


def word_tokens(s):
    return re.findall(r"[^\W_]+(?:'[^\W_]+)?", s.casefold(), re.UNICODE)


def verify_variants():
    reference = word_tokens(ORIGINAL)
    assert len(reference) >= 20
    assert len(VARIANTS) == 4
    for name, text, scale, silence in VARIANTS:
        if word_tokens(text) != reference:
            raise RuntimeError("Script changed spoken words: " + name)
        if not (0.92 <= scale <= 1.12 and 0.0 <= silence <= 0.25):
            raise RuntimeError("Cadence control outside conservative audition limits")


def digest(file):
    h = hashlib.sha256()
    with open(file, "rb") as f:
        for chunk in iter(lambda: f.read(1048576), b""):
            h.update(chunk)
    return h.hexdigest()


def run(args, stdin=None):
    subprocess.run(args, input=stdin, text=True, timeout=150, check=True)


def metrics(file):
    with wave.open(str(file), "rb") as wav:
        rate = wav.getframerate()
        width = wav.getsampwidth()
        channels = wav.getnchannels()
        duration = wav.getnframes() / rate
        values = array.array("h")
        values.frombytes(wav.readframes(wav.getnframes()))
    if width != 2 or channels != 1 or not (3 < duration < 24):
        raise RuntimeError("Audio format or duration failed objective admission")
    rms = math.sqrt(sum(float(x)*x for x in values)/len(values))/32768
    if rms < .005:
        raise RuntimeError("Silent or nearly silent take held")
    # Basic envelope analysis. Does NOT identify breath or naturalness.
    chunk = max(1, int(rate*.02))
    quiet = []
    for i in range(0, len(values)-chunk, chunk):
        part = values[i:i+chunk]
        envelope = math.sqrt(sum(float(x)*x for x in part)/len(part))/32768
        quiet.append(envelope < .012)
    stretches = []
    start = None
    for i, isquiet in enumerate(quiet):
        if isquiet and start is None:
            start = i
        if start is not None and (not isquiet or i == len(quiet)-1):
            end = i if not isquiet else i+1
            if end-start >= 6:
                stretches.append([round(start*.02, 2), round(end*.02, 2)])
            start = None
    return {
        "durationSec": round(duration,3), "rms": round(rms,5), "sampleRate": rate,
        "quietIntervalsSec": stretches,
        "automatedEmotionalQualityVerified": False,
        "humanSentenceEndingsApproved": False,
    }


def render(model_file, config_file, out_dir):
    verify_variants()
    model = pathlib.Path(model_file)
    config = pathlib.Path(config_file)
    if not model.is_file() or not config.is_file():
        raise RuntimeError("Downloaded pinned neural voice model unavailable")
    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=False)
    report = {
        "schema": "evercraft.voice-foundry.cadence-lab.v1",
        "status": "PRIVATE_AUDITION_NOT_APPROVED",
        "model": "Piper en_US-libritts-high",
        "modelCard": MODEL_CARD,
        "modelSha256": digest(model),
        "configSha256": digest(config),
        "originalSpokenWordsSha256": hashlib.sha256(" ".join(word_tokens(ORIGINAL)).encode()).hexdigest(),
        "originalText": ORIGINAL,
        "speakerRankingFromOwner": ["A", "C", "D", "B"],
        "scope": "A and C only; controlled punctuation, phrasing, and modest length_scale/sentence_silence",
        "realNeuralSynthesisPerformed": True,
        "humanProsodyReviewed": False,
        "commercialLicenseIndependentlyVerified": False,
        "publicationAuthorityGranted": False,
        "candidates": [],
    }
    for label, speaker in SPEAKERS:
        for variant, text, pace, silence in VARIANTS:
            ident = label+"-"+variant
            wav = out/(ident+".wav")
            mp3 = out/(ident+".mp3")
            run([
                "piper", "--model", str(model), "--config", str(config),
                "--speaker", str(speaker), "--length_scale", str(pace),
                "--sentence_silence", str(silence), "--output_file", str(wav)
            ], text+"\n")
            m = metrics(wav)
            run(["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-y",
                 "-i",str(wav),"-codec:a","libmp3lame","-q:a","3",str(mp3)])
            report["candidates"].append({
                "id": ident, "speaker": label,"speakerIndex": speaker,
                "variant": variant,"synthesisText":text,
                "lengthScale":pace,"sentenceSilenceSec":silence,
                "wav":wav.name,"mp3":mp3.name,
                "wavSha256":digest(wav),"mp3Sha256":digest(mp3), **m
            })
    (out/"cadence-report.json").write_text(json.dumps(report,indent=2)+"\n")
    sections = []
    for label, _ in SPEAKERS:
        cards = []
        for c in report["candidates"]:
            if c["speaker"] != label:
                continue
            cards.append("<section><h3>"+html.escape(c["variant"])+"</h3>"
                "<audio controls preload='metadata' src='"+c["mp3"]+"'></audio>"
                "<p>Duration: "+str(c["durationSec"])+" sec | "
                "Rate scale: "+str(c["lengthScale"])+" | "
                "Sentence silence: "+str(c["sentenceSilenceSec"])+" sec</p>"
                "</section>")
        sections.append("<h2>Speaker "+label+"</h2>"+"".join(cards))
    page = """<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Evercraft Voice Foundry: Cadence Lab</title>
<style>body{background:#111620;color:#edf3ff;font:16px/1.5 system-ui;max-width:850px;margin:35px auto;padding:0 18px}
section{padding:15px 22px;border:1px solid #596577;border-radius:14px;margin:10px 0 22px}
audio{width:100%}p{color:#bdcad9}h1{line-height:1.2}
kbd{padding:3px 7px;background:#253048;border-radius:4px}a{color:#a1cbff}
</style>
<h1>Evercraft Voice Foundry | Cadence Lab</h1>
<p>Owner preference: A first, C second. These eight neural auditions use their <b>exact same speaker identities and words</b>; only phrasing punctuation and conservative runtime pacing parameters vary.</p>
<p><b>Words (unchanged):</b> """+html.escape(ORIGINAL)+"""</p>
<p>Listen for two defects independently: (1) unnaturally evenly-spaced syllables and (2) the last three words sounding clipped, upward, artificial or disconnected.
No reverb, music, pitch replacement or fake breathing was added.</p>"""+ "".join(sections)+"""
<p>All files are <b>private experimental takes</b>. Comparison of timings does not establish naturalness. LibriTTS CC BY 4.0 attribution and independent license review required.
<a href='"""+MODEL_CARD+"""'>Source model card</a>.</p>
</html>"""
    (out/"index.html").write_text(page)
    print(json.dumps({"rendered":len(report["candidates"]), "status":report["status"]},indent=2))


if __name__ == "__main__":
    if "--verify-only" in sys.argv:
        verify_variants()
        print("Cadence plan validated: eight candidate settings; words unchanged")
    elif len(sys.argv)==4:
        render(*sys.argv[1:])
    else:
        raise SystemExit("Usage: voice-cadence-lab-ci.py MODEL CONFIG NEW_OUTPUT_DIR | --verify-only")
