#!/usr/bin/env python3
"""PRIVATE Bella expressivity bridge: consent-gated Chatterbox vs native Bella.

No renderer installed, reference copied or model downloaded by the preflight.
A real --render must be explicitly authorized for THIS exact reference SHA-256.
Original Kokoro af_bella dry recordings remain source of truth. Chatterbox
synthesis is an experiment with a NEW engine, not proven identity retention.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import pathlib
import re
import sys
import wave

SCHEMA = "evercraft.bella.reference-authorization.private.v1"
SCRIPT = (
    "You know that moment when everything begins to make sense. "
    "The noise falls away. The next step becomes clear. "
    "And suddenly, you can see where this could go. "
    "That's what we're building at Evercraft. "
    "Something worth paying attention to. Something you'll want to come back to."
)
# Matched text, source reference and seed. Two independent exaggeration
# tests hold guidance constant; a third lowers guidance at same exaggeration.
CONDITIONS = (
    {"id":"control", "exaggeration":0.50, "cfg_weight":0.50},
    {"id":"expressive", "exaggeration":0.70, "cfg_weight":0.50},
    {"id":"patient", "exaggeration":0.70, "cfg_weight":0.30},
)
SEED = 1701
MAX_REF_BYTES = 16 * 1024 * 1024


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1048576), b""):
            h.update(chunk)
    return h.hexdigest()


def validate_design():
    assert len(CONDITIONS) == len({x["id"] for x in CONDITIONS}) == 3
    assert CONDITIONS[0]["cfg_weight"] == CONDITIONS[1]["cfg_weight"]
    assert CONDITIONS[1]["exaggeration"] == CONDITIONS[2]["exaggeration"]
    assert len(re.findall(r"\b[\w']+\b", SCRIPT)) >= 45
    assert not any("[" in SCRIPT or "]" in SCRIPT for _ in [0])
    print("PASS: 3 matched-script authentic expressive-model test conditions")


def wav_ref_check(file):
    if not file.is_file() or file.is_symlink() or file.stat().st_size > MAX_REF_BYTES:
        raise ValueError("REFERENCE_MISSING_SYMLINK_OR_OVERSIZED")
    with wave.open(str(file),"rb") as wav:
        if (wav.getnchannels(),wav.getsampwidth(),wav.getframerate()) != (1,2,24000):
            raise ValueError("REFERENCE_MUST_BE_NATIVE_24KHZ_MONO_PCM16")
        seconds=wav.getnframes()/24000
        if not 6 <= seconds <= 20:
            raise ValueError("REFERENCE_DURATION_OUT_OF_BOUNDS_6_TO_20_SEC")
        pcm=wav.readframes(wav.getnframes())
    # Silence is not a usable voice prompt.
    import array
    samples=array.array("h")
    samples.frombytes(pcm)
    if sys.byteorder=="big":
        samples.byteswap()
    rms=math.sqrt(sum(float(v)*v for v in samples)/len(samples))/32768
    if rms < 0.005:
        raise ValueError("REFERENCE_AUDIO_IS_SILENT")
    return {"sha256":sha256(file),"durationSec":round(seconds,3),
            "rms":round(rms,5),"sampleRate":24000,"channels":1}


def preflight(reference, authorization):
    validate_design()
    ref=pathlib.Path(reference).resolve(strict=True)
    auth_path=pathlib.Path(authorization)
    if not auth_path.is_file() or auth_path.stat().st_size>16000:
        raise ValueError("AUTHORIZATION_MISSING_OR_INVALID")
    auth=json.loads(auth_path.read_text(encoding="utf8"))
    if auth.get("schema") != SCHEMA:
        raise ValueError("WRONG_AUTHORIZATION_SCHEMA")
    if auth.get("referenceKind") != "synthetic_kokoro_af_bella":
        raise ValueError("REFERENCE_MUST_BE_PROVEN_SYNTHETIC_BELLA")
    if auth.get("privateExperimentOnly") is not True or auth.get("noPublicationAuthorized") is not True:
        raise ValueError("PRIVATE_USE_BOUNDS_NOT_CONFIRMED")
    if auth.get("permissionToUseReferenceInExpressiveTest") is not True:
        raise ValueError("REFERENCE_PERMISSION_NOT_GRANTED")
    if not isinstance(auth.get("evidenceRef"),str) or len(auth["evidenceRef"].strip())<12:
        raise ValueError("REFERENCE_PERMISSION_EVIDENCE_REQUIRED")
    if auth.get("commercialReleaseRightsVerified") is not False:
        raise ValueError("COMMERCIAL_RIGHTS_MUST_REMAIN_UNVERIFIED")
    ref_stats=wav_ref_check(ref)
    if auth.get("referenceSha256") != ref_stats["sha256"]:
        raise ValueError("REFERENCE_SHA256_NOT_AUTHORIZED")
    return {"status":"PRIVATE_EXPRESSIVE_REFERENCE_PREFLIGHT_ONLY",
            "schema":"evercraft.bella.expressive-preflight.v1",
            "engine":"resemble-ai/chatterbox:original-english",
            "referenceSha256":ref_stats["sha256"],
            "referenceDurationSec":ref_stats["durationSec"],
            "referenceRms":ref_stats["rms"],
            "authorizationEvidenceRef":auth["evidenceRef"],
            "voiceReferenceIndependentRightsAudit":False,
            "modelCheckpointDigestVerified":False,
            "productionReady":False,
            "reviewOnly":True,
            "conditions":CONDITIONS}


def render(reference, authorization, output, device):
    report=preflight(reference, authorization)
    root=pathlib.Path(output)
    if root.exists():
        raise ValueError("OUTPUT_ALREADY_EXISTS")
    if device not in ("cpu","cuda","mps"):
        raise ValueError("DEVICE_NOT_APPROVED")
    # Imports below the input gates: no remote model download before authorization.
    import torch
    import torchaudio
    from chatterbox.tts import ChatterboxTTS
    model=ChatterboxTTS.from_pretrained(device=device)
    root.mkdir(parents=True, exist_ok=False)
    report["runtimeDevice"]=device
    report["samples"]=[]
    try:
        for i,condition in enumerate(CONDITIONS,1):
            torch.manual_seed(SEED)
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(SEED)
            audio=model.generate(
                SCRIPT,
                audio_prompt_path=str(pathlib.Path(reference).resolve()),
                exaggeration=condition["exaggeration"],
                cfg_weight=condition["cfg_weight"]
            )
            if not isinstance(audio,torch.Tensor):
                raise RuntimeError("NOT_A_REAL_MODEL_AUDIO_TENSOR")
            if audio.ndim==1:
                audio=audio.unsqueeze(0)
            if audio.ndim!=2 or audio.shape[0]!=1 or not torch.isfinite(audio).all():
                raise RuntimeError("INVALID_VOICE_SIGNAL")
            if (audio.abs().max().item()>1.0 or len(audio[0])<int(5*model.sr)
                    or len(audio[0])>int(40*model.sr)):
                raise RuntimeError("SPEECH_TOO_SHORT_LONG_OR_CLIPPED")
            wav=root/f"take-{i:02d}.wav"
            torchaudio.save(str(wav),audio.detach().cpu(),model.sr)
            report["samples"].append({"take":i,**condition,
                "script":SCRIPT,"seed":SEED,"sourceVoiceIdentityNotGuaranteed":True,
                "wav":wav.name,"sha256":sha256(wav),
                "durationSec":round(len(audio[0])/model.sr,3),
                "sampleRate":model.sr})
        report["status"]="RENDERED_PRIVATE_SAMPLES_UNREVIEWED"
        report["modelActuallyLoaded"]=True
        report["humanIdentityListeningApproved"]=False
        report["humanNaturalnessListeningApproved"]=False
        report["publicationAuthorityGranted"]=False
        (root/"evidence.json").write_text(json.dumps(report,indent=2)+"\n")
        print(json.dumps({"status":report["status"],"takes":len(report["samples"]),
                          "productionReady":False}))
    except Exception:
        # An incomplete experiment is NOT evidence; report must remain absent.
        raise


if __name__ == "__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--verify-only",action="store_true")
    p.add_argument("--reference")
    p.add_argument("--authorization")
    p.add_argument("--output")
    p.add_argument("--device",choices=("cpu","cuda","mps"),default="cpu")
    args=p.parse_args()
    if args.verify_only and not any((args.reference,args.authorization,args.output)):
        validate_design()
    elif args.reference and args.authorization:
        if args.output:
            render(args.reference,args.authorization,args.output,args.device)
        else:
            print(json.dumps(preflight(args.reference,args.authorization),indent=2))
    else:
        p.error("Use --verify-only or --reference PATH --authorization PATH [--output NEW_DIR]")
