#!/usr/bin/env python3
"""Private/local Kokoro auditions for Fallen Voice Foundry.

Renders original text only. Never approves commercial rights, casting, identity,
blind ratings or release. No external API calls are performed by this script.
The operator must preinstall Kokoro and have its model weights available.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

PROFILE_ID = "evercraft-male-magnetic-audition-v1"
VOICES = (
    "am_michael", "am_fenrir", "am_eric", "am_liam", "am_puck",
    "am_onyx", "am_echo", "am_adam", "bm_fable", "bm_daniel",
    "bm_george", "bm_lewis",
)

def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def plan_digest(plan):
    canonical = {k: v for k, v in plan.items() if k != "planDigest"}
    raw = json.dumps(canonical, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()

def render(plan_path, output_dir, voices, speed):
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    if (plan.get("schema") != "evercraft.fallen.voice-audition-plan.v1"
            or plan.get("profile", {}).get("id") != PROFILE_ID
            or not isinstance(plan.get("planDigest"), str)
            or plan["planDigest"] != plan_digest(plan)):
        raise ValueError("Invalid or mismatched Voice Foundry audition plan")
    reads = plan.get("reads")
    if not isinstance(reads, list) or len(reads) != 3 or any(
        not isinstance(r.get("text"), str) or not r.get("text") or
        r.get("id") not in ("curiosity", "trust", "wonder") for r in reads
    ) or len({r["id"] for r in reads}) != 3:
        raise ValueError("Unexpected read manifest")
    if len(voices) < 2 or len(set(voices)) != len(voices) or any(v not in VOICES for v in voices):
        raise ValueError("Choose at least two distinct supported male Kokoro voices")
    if not 0.85 <= speed <= 1.1:
        raise ValueError("Speed must be within natural audition bounds (0.85 to 1.10)")
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError("Output directory must be empty to protect existing audition evidence")
    # Force offline loading. Missing cached weights fail rather than being fetched.
    for name in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_DATASETS_OFFLINE"):
        os.environ[name] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    try:
        import numpy as np
        import soundfile as sf
        from kokoro import KPipeline
    except ImportError as exc:
        raise RuntimeError("Local numpy, soundfile, and kokoro are required; no model was downloaded") from exc
    output_dir.mkdir(parents=True, exist_ok=True)
    pipelines = {}
    candidates = []
    for voice in voices:
        lang = voice[0]
        if lang not in pipelines:
            pipelines[lang] = KPipeline(lang_code=lang)
        candidate_dir = output_dir / voice
        candidate_dir.mkdir()
        files = []
        for read in reads:
            # Preserve natural punctuation. No fake inhalations or seductive effects.
            parts = []
            for _, _, audio in pipelines[lang](read["text"], voice=voice, speed=speed):
                audio = np.asarray(audio, dtype="float32").reshape(-1)
                if audio.size:
                    if parts:
                        parts.append(np.zeros(2400, dtype="float32"))
                    parts.append(audio)
            if not parts:
                raise RuntimeError(f"Kokoro returned no audio for {voice}/{read['id']}")
            audio = np.concatenate(parts)
            if audio.size < 24000 or not np.isfinite(audio).all() or float(np.max(np.abs(audio))) > 1.0:
                raise ValueError(f"Invalid audio for {voice}/{read['id']}")
            file_path = candidate_dir / (read["id"] + ".wav")
            sf.write(str(file_path), audio, 24000, subtype="PCM_16")
            files.append({
                "readId": read["id"], "scriptText": read["text"],
                "filePath": str(file_path.resolve()), "sha256": sha256(file_path),
            })
        candidates.append({
            "candidateId": voice, "voiceProfileId": PROFILE_ID,
            "providerModel": "local-kokoro-82m/" + voice,
            "samples": files,
            "rights": {"source": "pending_operator_license_review", "commercialUseVerified": False, "evidenceRef": ""},
            "identity": {"consentedToVoiceUse": False, "realPersonImpersonation": False},
            "ratings": [],
        })
    review = {
        "schema": "evercraft.fallen.voice-audition-review.v1",
        "planDigest": plan["planDigest"], "candidates": candidates,
    }
    review_path = output_dir / "REVIEW-INCOMPLETE.json"
    review_path.write_text(json.dumps(review, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": "rendered_pending_rights_and_blind_listening",
        "candidateCount": len(candidates), "reviewPath": str(review_path.resolve()),
        "note": "No rating, commercial rights, consent, or production approval is implied"}, indent=2))
    return review_path

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--plan", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--voices", nargs="+", default=["am_michael", "am_fenrir", "bm_fable"])
    p.add_argument("--speed", type=float, default=1.0)
    args = p.parse_args()
    try:
        render(args.plan.expanduser().resolve(), args.out.expanduser().resolve(), args.voices, args.speed)
    except Exception as exc:
        print(f"Voice Foundry render blocked: {exc}", file=sys.stderr)
        sys.exit(2)

if __name__ == "__main__":
    main()
