#!/usr/bin/env python3
"""Evercraft Voice Foundry | offline multilingual text-to-speech workstation.

Generate a NEW dry native WAV + MP3 preview from user-supplied UTF-8 text.
Uses Kokoro voice packs or same-language *synthetic stock-pack blends*.
Only 4 language locales have been provisioned in the current audition lab.
No hosted inference or cloning; no newly trained voice identity. Bella V05
remains excluded here to protect the original production-direction baseline.
Human pronunciation, text rights and audio rights checks gate publication.

Quick starts:
  python voice-foundry-workstation.py --list-voices
  python voice-foundry-workstation.py --voice ef_dora --text-file copy-es.txt --output private-voice-es
  python voice-foundry-workstation.py --voice ember --text-file copy-en.txt --output private-voice-en
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import pathlib
import re
import subprocess
import sys
import wave

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("voice_casting",HERE/"voice-foundry-multilingual-casting.py")
casting=importlib.util.module_from_spec(spec)
spec.loader.exec_module(casting)
spec2=importlib.util.spec_from_file_location("voice_recipes",HERE/"voice-foundry-original-character-recipes.py")
recipes=importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(recipes)
MODEL="Kokoro-82M"
VERSION="0.9.4"
SCHEMA="evercraft.voice-foundry.workstation-private-render.v1"
SR=24000
SEED=1701


def catalog():
    entries={}
    for tag,row in casting.CAST.items():
        voice=row["voice"]
        entries[voice]={"voiceId":voice,"language":row["lang"],"kind":"publishedStockPack",
                        "castLabel":tag,"releasedForEvercraft":False}
    for label,row in recipes.RECIPES.items():
        entries[label]={"voiceId":",".join(row["sources"]),"language":row["language"],
                        "kind":"derivedTwoPackBlend","sources":list(row["sources"]),
                        "releasedForEvercraft":False}
    assert "af_bella" not in entries
    return entries


def validate(voice,text):
    voices=catalog()
    if voice not in voices:
        raise ValueError("UNKNOWN_OR_UNREVIEWED_VOICE_ID")
    if not isinstance(text,str):
        raise ValueError("TEXT_NOT_UTF8_STRING")
    cleaned=text.strip()
    if not (20 <= len(cleaned) <= 1500):
        raise ValueError("TEXT_LENGTH_OUT_OF_BOUNDS_20_TO_1500_CHARS")
    if any(ord(x)<32 and x not in "\n\t" for x in cleaned):
        raise ValueError("HIDDEN_CONTROL_CHARACTER")
    if "<" in cleaned or ">" in cleaned or "[" in cleaned or "]" in cleaned:
        raise ValueError("UNREVIEWED_MARKUP_OR_PHONEME_OVERRIDE")
    if len(casting.words(cleaned)) < 5:
        raise ValueError("TOO_FEW_SPOKEN_WORDS")
    return cleaned,voices[voice]


def short_sha(data):
    return hashlib.sha256(data).hexdigest()


def render(voice,text_file,output):
    text_path=pathlib.Path(text_file)
    if not text_path.is_file() or text_path.stat().st_size>6000:
        raise ValueError("MISSING_OR_LARGE_LOCAL_TEXT_FILE")
    raw_text=text_path.read_bytes()
    text=raw_text.decode("utf8","strict")
    script,profile=validate(voice,text)
    root=pathlib.Path(output)
    if root.exists():
        raise FileExistsError("OUTPUT_ALREADY_EXISTS")
    import torch
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    code=casting.LANGUAGES[profile["language"]]["code"]
    pipeline=KPipeline(lang_code=code)
    chunks=list(pipeline(script,voice=profile["voiceId"],speed=1.0))
    if not chunks:
        raise RuntimeError("NO_REAL_NATIVE_OUTPUT")
    arrays=[]
    for result in chunks:
        if result.audio is None or not result.phonemes:
            raise RuntimeError("UNVERIFIED_NATIVE_CHUNK")
        a=result.audio.detach().float().cpu().numpy()
        if a.ndim!=1 or not np.isfinite(a).all() or not len(a):
            raise RuntimeError("INVALID_AUDIO")
        arrays.append(a)
    audio=np.concatenate(arrays)
    if float(np.max(np.abs(audio))) >= 1:
        raise RuntimeError("CLIPPED_AUDIO")
    root.mkdir(parents=True,exist_ok=False)
    wav=root/"native.wav"
    mp3=root/"preview.mp3"
    sf.write(str(wav),audio,SR,subtype="PCM_16")
    with wave.open(str(wav),"rb") as stream:
        if (stream.getnchannels(),stream.getsampwidth(),stream.getframerate())!=(1,2,SR):
            raise RuntimeError("INCORRECT_NATIVE_PCM")
        seconds=round(stream.getnframes()/SR,3)
    if not (2.0<=seconds<=120.0):
        raise RuntimeError("VOICE_DURATION_OUT_OF_ALLOWED_RANGE")
    cmd=["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-n",
         "-i",str(wav),"-af","loudnorm=I=-19:TP=-2:LRA=10",
         "-c:a","libmp3lame","-q:a","3",str(mp3)]
    p=subprocess.run(cmd,capture_output=True,text=True,timeout=100)
    if p.returncode or not mp3.exists() or mp3.stat().st_size<3000:
        raise RuntimeError("MISSING_PREVIEW_MP3 "+p.stderr[-200:])
    receipt={"schema":SCHEMA,"voiceInput":voice,"resolvedProfile":profile,
        "languageCode":code,"script":script,"sourceTextFileSha256":short_sha(raw_text),
        "normalizedScriptSha256":short_sha(script.encode("utf8")),
        "model":MODEL,"version":VERSION,"seed":SEED,
        "genuineNativeSynthesis":True,"audioDurationSec":seconds,
        "nativeWav":wav.name,"nativeWavSha256":short_sha(wav.read_bytes()),
        "previewMp3":mp3.name,"previewMp3Sha256":short_sha(mp3.read_bytes()),
        "humanPronunciationApproved":False,
        "textRightsVerified":False,"commercialRightsIndependentlyVerified":False,
        "productionReady":False,"releaseAuthorized":False,
        "trainedCustomVoice":False,"humanVoiceCloned":False,
        "bellaOriginalMasterUntouched":True}
    (root/"evidence.json").write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"status":"NATIVE_OFFLINE_DRY_TTS_REVIEW_ONLY",
        "voice":voice,"language":profile["language"],"durationSec":seconds}))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list-voices",action="store_true")
    parser.add_argument("--voice")
    parser.add_argument("--text-file")
    parser.add_argument("--output")
    args=parser.parse_args()
    if args.list_voices and not any((args.voice,args.text_file,args.output)):
        print(json.dumps(catalog(),indent=2,ensure_ascii=False))
    elif args.voice and args.text_file and args.output and not args.list_voices:
        render(args.voice,args.text_file,args.output)
    else:
        parser.error("Use --list-voices or --voice X --text-file COPY.txt --output NEW_DIR")


if __name__=="__main__":
    main()
