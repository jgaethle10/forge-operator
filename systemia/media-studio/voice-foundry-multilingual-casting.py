#!/usr/bin/env python3
"""Evercraft Voice Foundry | multilingual casting audition (private R&D).

Renders REAL Kokoro 0.9.4 native voices in their CORRECT language frontends.
These are licensed-model stock voice packs with original Evercraft character
directions, NOT trained or cloned "proprietary voice identities".
Bella af_bella V05 is protected and never overwritten in this workflow.

Requirements for --render: kokoro==0.9.4, torch, numpy, soundfile, ffmpeg,
espeak-ng. Voice output is review-only and rights scope must be validated
separately before customer deployment. No hosted inference API.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import pathlib
import re
import subprocess
import sys
import wave

SCHEMA = "evercraft.voice-foundry.multilingual-audition.v1"
SAMPLE_RATE = 24000
SEED = 1701
SPEED = 1.0
LANGUAGES = {
    "en-US": {"code": "a", "name": "American English"},
    "en-GB": {"code": "b", "name": "British English"},
    "es-ES": {"code": "e", "name": "Spanish"},
    "pt-BR": {"code": "p", "name": "Brazilian Portuguese"},
}
SCRIPTS = {
    "en-US": (
        "Every great idea begins with a question. What could be simpler, clearer, or more useful? "
        "At Evercraft, we build tools that help people turn complicated work into meaningful progress. "
        "Good technology should feel calm, capable, and human. That is a future worth creating."
    ),
    "en-GB": (
        "Every great idea begins with a question. What could be simpler, clearer, or more useful? "
        "At Evercraft, we build tools that help people turn complicated work into meaningful progress. "
        "Good technology should feel calm, capable, and human. That is a future worth creating."
    ),
    "es-ES": (
        "Cada gran idea comienza con una pregunta. ¿Qué podemos hacer más sencillo, claro y útil? "
        "En Evercraft creamos herramientas para transformar el trabajo complicado en resultados reales. "
        "La buena tecnología debe ser cercana, confiable y humana. "
        "Nuestro propósito es construir soluciones que merezcan tu confianza."
    ),
    "pt-BR": (
        "Toda grande ideia começa com uma pergunta. O que podemos tornar mais simples, claro e útil? "
        "Na Evercraft, criamos ferramentas que transformam trabalhos complexos em resultados reais. "
        "A boa tecnologia deve ser próxima, confiável e humana. "
        "Nosso propósito é construir soluções que mereçam sua confiança."
    ),
}
# Brand characters are CASTING LABELS, not claims of owning a unique model voice.
CAST = {
    "01-nicole": {"lang": "en-US", "voice": "af_nicole", "role": "calm explainer"},
    "02-michael": {"lang": "en-US", "voice": "am_michael", "role": "confident narrator"},
    "03-emma": {"lang": "en-GB", "voice": "bf_emma", "role": "thoughtful storyteller"},
    "04-fable": {"lang": "en-GB", "voice": "bm_fable", "role": "dramatic narrator"},
    "05-dora-es": {"lang": "es-ES", "voice": "ef_dora", "role": "Spanish commercial narrator"},
    "06-alex-es": {"lang": "es-ES", "voice": "em_alex", "role": "Spanish documentary narrator"},
    "07-dora-pt": {"lang": "pt-BR", "voice": "pf_dora", "role": "Portuguese commercial narrator"},
    "08-alex-pt": {"lang": "pt-BR", "voice": "pm_alex", "role": "Portuguese documentary narrator"},
}
PROTECTED_BELLA = "af_bella"


def digest(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def words(text):
    return re.findall(r"[^\W_]+(?:[’'][^\W_]+)*", text, re.UNICODE)


def preflight():
    assert len(CAST) == len(set(x["voice"] for x in CAST.values())) == 8
    assert set(LANGUAGES) == set(SCRIPTS)
    assert all(x["lang"] in LANGUAGES for x in CAST.values())
    assert all(x["voice"][0] == LANGUAGES[x["lang"]]["code"] for x in CAST.values())
    assert PROTECTED_BELLA not in [x["voice"] for x in CAST.values()]
    assert all(len(words(script)) >= 35 and len(script) < 900
               and "Evercraft" in script for script in SCRIPTS.values())
    assert "¿" in SCRIPTS["es-ES"] and "ç" in SCRIPTS["pt-BR"]
    assert all(not s.endswith((" to.", " a.", " para.", " de.")) for s in SCRIPTS.values())
    print("PASS: 8 pre-existing model voices, 4 matching G2P languages; Bella V05 excluded")


def make_page():
    parts = []
    for label, entry in CAST.items():
        parts.append(
            "<section><h2>"+html.escape(label)+"</h2><p>"
            +html.escape(LANGUAGES[entry["lang"]]["name"]+" · "+entry["role"])
            +"</p><audio controls preload='none' src='"+label+".mp3'></audio>"
            +"<p>Pronunciation / naturalness / identity / clarity:</p>"
            +"<label>Notes <textarea placeholder='Include exact word and timestamp' rows='2'></textarea></label></section>"
        )
    return """<!doctype html><html lang="en"><meta charset="utf-8"><meta
name="viewport" content="width=device-width,initial-scale=1">
<title>Evercraft Voice Foundry | Private multilingual casting</title>
<style>body{font:16px/1.5 system-ui;background:#11151e;color:#faf7f5;
max-width:740px;margin:auto;padding:20px}section{padding:15px;border:1px solid #566171;
border-radius:12px;margin:15px 0}audio{width:100%}textarea{width:95%;padding:8px;
background:#202631;color:#fff;border:1px solid #778495}h1{font-size:29px}</style>
<h1>Voice Foundry | Casting Room</h1><p>Eight real model-pack voices.
Spanish and Portuguese need native-speaker review. These are **not** bespoke
voice clones or commercial-ready talent. Bella V05 is not in this audition.</p>""" + "".join(parts) + """
<p>Human listening review and rights clearance are required before publication.
Audio does not leave this page. No network feedback collection.</p></html>"""


def validate_wav(path):
    with wave.open(str(path), "rb") as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1,2,SAMPLE_RATE):
            raise RuntimeError("PCM_EXPECTED_24K_MONO_16BIT")
        seconds = wav.getnframes()/SAMPLE_RATE
    if not 7 < seconds < 40:
        raise RuntimeError("UNREASONABLE_VOICE_DURATION")
    return round(seconds,3)


def synthesize(output, only=None):
    preflight()
    root=pathlib.Path(output)
    if root.exists():
        raise FileExistsError("OUTPUT_ALREADY_EXISTS")
    if only and only not in CAST:
        raise ValueError("UNKNOWN_CAST_MEMBER")
    from kokoro import KPipeline, KModel
    import numpy as np
    import soundfile as sf
    import torch

    selected = {k:v for k,v in CAST.items() if only is None or k==only}
    shared_model=KModel()
    pipelines={}
    root.mkdir(parents=True,exist_ok=False)
    takes=[]
    for name, entry in selected.items():
        lang=entry["lang"]
        code=LANGUAGES[lang]["code"]
        if code not in pipelines:
            pipelines[code]=KPipeline(lang_code=code, model=shared_model)
        torch.manual_seed(SEED)
        np.random.seed(SEED)
        rendered=list(pipelines[code](SCRIPTS[lang],voice=entry["voice"],speed=SPEED))
        if not rendered:
            raise RuntimeError("NO_REAL_NEURAL_AUDIO_"+name)
        arrays=[]
        phonemes=[]
        graphemes=[]
        for r in rendered:
            if r.audio is None or not r.phonemes:
                raise RuntimeError("MODEL_RESULT_INCOMPLETE_"+name)
            a=r.audio.detach().float().cpu().numpy()
            if a.ndim != 1 or len(a) < SAMPLE_RATE or not np.isfinite(a).all():
                raise RuntimeError("NONFINITE_OR_TOO_SHORT_AUDIO_"+name)
            arrays.append(a)
            phonemes.append(r.phonemes)
            graphemes.append(r.graphemes)
        audio=np.concatenate(arrays)
        if float(np.max(np.abs(audio))) >= 1:
            raise RuntimeError("CLIPPED_NATIVE_AUDIO_"+name)
        wav=root/(name+".wav")
        mp3=root/(name+".mp3")
        sf.write(str(wav), audio, SAMPLE_RATE, subtype="PCM_16")
        duration=validate_wav(wav)
        p=subprocess.run(["ffmpeg","-nostdin","-hide_banner","-loglevel","error",
            "-n","-i",str(wav),"-af","loudnorm=I=-19:TP=-2:LRA=10",
            "-c:a","libmp3lame","-q:a","3",str(mp3)],
            capture_output=True,text=True,timeout=100)
        if p.returncode or not mp3.is_file() or mp3.stat().st_size < 9000:
            raise RuntimeError("MP3_PREVIEW_FAILURE_"+name+" "+p.stderr[-200:])
        takes.append({
            "castId":name,"voiceId":entry["voice"],"language":lang,
            "languageCode":code,"intendedRole":entry["role"],
            "script":SCRIPTS[lang],"scriptSha256":hashlib.sha256(SCRIPTS[lang].encode("utf8")).hexdigest(),
            "nativeModel":True,"stockVoicePack":True,"trainedCustomVoice":False,
            "wordsTranscribedIndependently":False,"nativePronunciationReviewed":False,
            "chunkCount":len(rendered),"nativeGraphemes":graphemes,
            "nativePhonemesSha256":hashlib.sha256(" ".join(phonemes).encode("utf8")).hexdigest(),
            "durationSec":duration,"wav":wav.name,"wavSha256":digest(wav),
            "mp3":mp3.name,"mp3Sha256":digest(mp3),
        })
        print("RENDERED",name,lang,entry["voice"],duration,flush=True)
    evidence={
        "schema":SCHEMA,"engine":"Kokoro-82M","kokoroLibraryVersion":"0.9.4",
        "protectedLegacyBellaVoice":PROTECTED_BELLA,"originalBellaMasterUnchanged":True,
        "seed":SEED,"speed":SPEED,"sampleRateHz":SAMPLE_RATE,
        "productionReady":False,"humanListeningApproved":False,
        "nativeSpeakerPronunciationApproved":False,
        "publicReleaseAuthorized":False,"independentCommercialRightsAudit":False,
        "allVoiceIdentitiesAlreadyPresentInModel":True,
        "audioProducedByRealModel":True,"cast":takes
    }
    (root/"evidence.json").write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+"\n")
    (root/"index.html").write_text(make_page(),encoding="utf8")
    print(json.dumps({"status":"EIGHT_REAL_VOICE_AUDITIONS_REVIEW_ONLY",
                      "voiceCount":len(takes),"languages":list(sorted(set(x["language"] for x in takes))),
                      "productionReady":False}))


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--verify-only", action="store_true")
    p.add_argument("--output")
    p.add_argument("--only",choices=list(CAST))
    args=p.parse_args()
    if args.verify_only and not args.output and not args.only:
        preflight()
    elif args.output and not args.verify_only:
        synthesize(args.output,args.only)
    else:
        p.error("Use --verify-only or --output NEW_DIR [--only CAST_ID]")


if __name__ == "__main__":
    main()
