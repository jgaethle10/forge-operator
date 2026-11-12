#!/usr/bin/env python3
"""Evercraft Voice Foundry | experimental ORIGINAL-character tone recipes.

Create four *new synthetic blend profiles* by averaging two existing Kokoro
voice packs within the SAME language, using the official KPipeline.load_voice.
A blend is not a separately trained model, a human clone, a new licensed actor,
or guaranteed to have clear pronunciation. No Bella V05 input or overrides.
All synthesis is private, SHA-receipted, native, and human-review gated.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import wave

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location(
    "voice_casting",HERE/"voice-foundry-multilingual-casting.py")
casting=importlib.util.module_from_spec(spec)
spec.loader.exec_module(casting)

MODEL = "Kokoro-82M"
VERSION = "0.9.4"
SEED = 1701
SPEED = 1.0
SCHEMA = "evercraft.voice-foundry.synthetic-blend.v1"
# Each recipe has compatible language, published source voice packs, and an
# independent character name. These names are WORKING character labels.
RECIPES = {
    "ember": {"language":"en-US", "sources":("af_nicole","af_sarah"),
              "direction":"gentle articulate explainer"},
    "granite": {"language":"en-US", "sources":("am_michael","am_fenrir"),
                "direction":"steady confident documentary narrator"},
    "brisa": {"language":"es-ES", "sources":("em_alex","em_santa"),
              "direction":"Spanish language cinematic presenter"},
    "rio": {"language":"pt-BR", "sources":("pm_alex","pm_santa"),
            "direction":"Brazilian Portuguese energetic narrator"},
}


def sha(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def checks():
    casting.preflight()
    assert set(RECIPES) == {"ember","granite","brisa","rio"}
    assert len(set(tuple(x["sources"]) for x in RECIPES.values())) == len(RECIPES)
    assert all(len(x["sources"]) == 2 and len(set(x["sources"])) == 2 for x in RECIPES.values())
    for label,record in RECIPES.items():
        lang=record["language"]
        expected=casting.LANGUAGES[lang]["code"]
        assert all(v.startswith(expected) for v in record["sources"]),label
        assert "af_bella" not in record["sources"]
        assert all("/" not in v and "\\" not in v and "," not in v for v in record["sources"])
        assert casting.SCRIPTS.get(lang),label
    print("PASS: four original character recipes with same-language compatible voice packs, Bella excluded")


def create(output, only=None):
    checks()
    root=pathlib.Path(output)
    if root.exists():
        raise FileExistsError("OUTPUT_ALREADY_EXISTS")
    if only and only not in RECIPES:
        raise ValueError("UNKNOWN_CHARACTER")
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KModel, KPipeline

    root.mkdir(parents=True,exist_ok=False)
    shared=KModel()
    pipes={}
    results=[]
    selected={k:v for k,v in RECIPES.items() if not only or only==k}
    for name,entry in selected.items():
        lang=entry["language"]
        code=casting.LANGUAGES[lang]["code"]
        if code not in pipes:
            pipes[code]=KPipeline(lang_code=code,model=shared)
        pipeline=pipes[code]
        voice_ids=",".join(entry["sources"])
        # Official pipeline averages the two tensors, no phoneme surgery.
        pack=pipeline.load_voice(voice_ids)
        if not isinstance(pack,torch.Tensor) or pack.ndim<2 or not torch.isfinite(pack).all():
            raise ValueError("BLENDED_PACK_INVALID")
        pack_digest=hashlib.sha256(pack.detach().cpu().contiguous().numpy().tobytes()).hexdigest()
        torch.manual_seed(SEED)
        np.random.seed(SEED)
        chunks=list(pipeline(casting.SCRIPTS[lang],voice=voice_ids,speed=SPEED))
        if not chunks:
            raise RuntimeError("NO_REAL_NATIVE_AUDIO_"+name)
        arrays=[]
        for item in chunks:
            if item.audio is None or not item.phonemes:
                raise RuntimeError("MODEL_INCOMPLETE_"+name)
            a=item.audio.detach().float().cpu().numpy()
            if a.ndim!=1 or not np.isfinite(a).all() or len(a)<casting.SAMPLE_RATE:
                raise RuntimeError("BAD_AUDIO_"+name)
            arrays.append(a)
        out=np.concatenate(arrays)
        if np.max(np.abs(out))>=1:
            raise RuntimeError("CLIPPED_AUDIO_"+name)
        wav=root/(name+".wav");mp3=root/(name+".mp3")
        sf.write(str(wav),out,casting.SAMPLE_RATE,subtype="PCM_16")
        sec=casting.validate_wav(wav)
        p=subprocess.run(["ffmpeg","-nostdin","-hide_banner","-loglevel","error",
            "-n","-i",str(wav),"-af","loudnorm=I=-19:TP=-2:LRA=10",
            "-c:a","libmp3lame","-q:a","3",str(mp3)],
            capture_output=True,text=True,timeout=100)
        if p.returncode or not mp3.exists() or mp3.stat().st_size<9000:
            raise RuntimeError("PREVIEW_MP3_FAILED_"+name+" "+p.stderr[-180:])
        results.append({"character":name,"language":lang,"languageCode":code,
            "sources":list(entry["sources"]),"direction":entry["direction"],
            "blendAlgorithm":"KPipeline.load_voice arithmetic mean of two native packs",
            "sourcePackCount":2,"newCharacterIsNotNewTrainedModel":True,
            "voiceClone":False,"preservedBella":True,
            "blendedPackTensorSha256":pack_digest,
            "script":casting.SCRIPTS[lang],"native":True,
            "durationSec":sec,"wav":wav.name,"wavSha256":sha(wav),
            "mp3":mp3.name,"mp3Sha256":sha(mp3),
            "nativeSpeakerApproved":False,"humanQualityApproved":False})
        print("REAL BLENDED CHARACTER",name,voice_ids,sec,flush=True)
    receipt={"schema":SCHEMA,"model":MODEL,"version":VERSION,
        "voiceIdentityMethod":"published pack arithmetic mean, not novel training",
        "stockPackProvenance":True,"bellaOriginalV05Untouched":True,
        "humanQualityApproved":False,"nativeSpeakerApproved":False,
        "commercialPermissionIndependentlyVerified":False,"productionReady":False,
        "releaseAuthorized":False,"characters":results}
    (root/"evidence.json").write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"status":"RENDERED_PRIVATE_DERIVED_VOICE_RECIPES",
        "characterCount":len(results),"commercialApproved":False}))


if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--verify-only",action="store_true")
    p.add_argument("--output")
    p.add_argument("--only",choices=list(RECIPES))
    a=p.parse_args()
    if a.verify_only and not a.output and not a.only:
        checks()
    elif a.output and not a.verify_only:
        create(a.output,a.only)
    else:
        p.error("Use --verify-only OR --output NEW_DIR [--only CHARACTER]")
