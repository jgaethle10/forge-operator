#!/usr/bin/env python3
"""Private Bella V05: inspect REAL Kokoro duration predictor and token timestamps.

Unlike the G2P-only pass, this invokes untouched native Kokoro 0.9.4
af_bella inference. Audition-only. No phoneme override or waveform retiming.
The model's per-token predicted timestamps are NOT independent ASR alignment,
vowel boundaries, perceived emphasis, or proof of a pronunciation defect.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re

VOICE = "af_bella"
SAMPLE_RATE = 24000
DURATION_FRAMES_PER_SECOND = 40
SEED = 1701
SCHEMA = "evercraft.bella.native-duration-study.v1"
G2P_BASELINE_SHA256 = "b609c9bb842a59167dd2eb0319d3e9cabfce0ccdc56a060ef71e456581dac70d"
BASE = (
    "You know that moment when everything begins to make sense. "
    "The noise falls away. The next step becomes clear. "
    "And suddenly, you can see where this could go. "
    "That's what we're building at Evercraft. "
    "Something worth paying attention to. Something you'll want to come back to."
)
CONNECTED = (
    "You know that moment when everything begins to make sense? "
    "The noise falls away... the next step becomes clear, "
    "and suddenly, you can see where this could go. "
    "That's what we're building at Evercraft: "
    "something worth paying attention to. Something you'll want to come back to."
)
CONDITIONS = {"original": BASE, "connected": CONNECTED}
WATCH_WORDS = {"that", "that's", "evercraft", "to", "what", "at", "the", "you"}


def words(text):
    return re.findall(r"[a-z]+(?:'[a-z]+)?", text.casefold())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def preflight():
    if set(CONDITIONS) != {"original", "connected"}:
        raise ValueError("BAD_CONDITIONS")
    if words(BASE) != words(CONNECTED) or len(words(BASE)) < 40:
        raise ValueError("SPOKEN_WORDS_DIFFER")
    if VOICE != "af_bella" or SEED != 1701:
        raise ValueError("ORIGINAL_NATIVE_IDENTITY_NOT_LOCKED")
    print("PASS: same words, original Bella, no phoneme/audio edits")


def inspect_result(result, expected_script):
    """Read native model output, without manufacturing inferred speech times."""
    ps = result.phonemes
    if not isinstance(ps, str) or not ps.strip():
        raise ValueError("NO_REAL_MODEL_PHONEMES")
    pred = result.pred_dur
    if pred is None:
        raise ValueError("MODEL_PREDICTED_DURATIONS_NOT_EXPOSED")
    frame_counts = [int(x) for x in pred.tolist() if True]
    if not frame_counts or min(frame_counts) < 1:
        raise ValueError("INVALID_DURATION_PREDICTIONS")
    if len(frame_counts) < 3:
        raise ValueError("NOT_ENOUGH_PREDICTED_TOKENS")
    audio = result.audio
    if audio is None or len(audio) < 2*SAMPLE_RATE:
        raise ValueError("NO_NATIVE_GENERATED_AUDIO")
    duration = len(audio) / SAMPLE_RATE
    source_words = words(expected_script)
    extracted = []
    covered = []
    prev = -1.0
    monotonic = True
    for token in result.tokens or []:
        text = str(getattr(token, "text", "") or "")
        ph = str(getattr(token, "phonemes", "") or "")
        start = getattr(token, "start_ts", None)
        end = getattr(token, "end_ts", None)
        normalized = words(text)
        if not normalized:
            continue
        covered.extend(normalized)
        valid = (isinstance(start, (int, float)) and
                 isinstance(end, (int, float)) and
                 0 <= start < end and start >= prev-0.003 and
                 end <= duration+0.75)
        if valid:
            prev = float(end)
        else:
            monotonic = False
        extracted.append({
            "text": text, "normalized": normalized,
            "phonemes": ph, "lexicalStressMarks": ph.count("ˈ"),
            "predictedStartSec": round(float(start), 3) if valid else None,
            "predictedEndSec": round(float(end), 3) if valid else None,
            "predictedTotalWordSec": round(float(end-start), 3) if valid else None,
            "isIndependentAudioAlignment": False,
        })
    exact = covered == source_words
    full_timing = monotonic and exact and all(
        x["predictedTotalWordSec"] is not None for x in extracted)
    return {
        "predictedTokenDurationsFrames": frame_counts,
        "durationFrameRateHz": DURATION_FRAMES_PER_SECOND,
        "totalPredictedModelTimeSec": round(sum(frame_counts)/DURATION_FRAMES_PER_SECOND, 3),
        "actualWavDurationSec": round(duration, 3),
        "nativeInputPhonemeSha256": sha(ps.encode("utf8")),
        "wordCoverageMatchesScript": exact,
        "nativeTokenTimesUsable": full_timing,
        "tokenTimingSource": "kokoro.KPipeline.Result.tokens.start_ts/end_ts",
        "tokenTimesAreModelDerivedNotIndependentAlignments": True,
        "predictedWordRecords": extracted,
        "modelWordCount": len(covered),
        "expectedWordCount": len(source_words),
    }


def compare(original, connected):
    if not (original["wordCoverageMatchesScript"] and
            connected["wordCoverageMatchesScript"] and
            original["nativeTokenTimesUsable"] and
            connected["nativeTokenTimesUsable"]):
        return {"comparisonAvailable": False, "reason": "NO_VERIFIED_NATIVE_WORD_COVERAGE",
                "candidateDifferences": []}
    a = original["predictedWordRecords"]
    b = connected["predictedWordRecords"]
    if len(a) != len(b) or any(x["normalized"] != y["normalized"] for x,y in zip(a,b)):
        return {"comparisonAvailable": False, "reason": "TOKENS_NOT_PAIRWISE_ALIGNED",
                "candidateDifferences": []}
    flagged = []
    for index,(x,y) in enumerate(zip(a,b)):
        name = " ".join(x["normalized"])
        diff = round(y["predictedTotalWordSec"]-x["predictedTotalWordSec"],3)
        if (abs(diff) >= 0.07 or
            (name in WATCH_WORDS and max(x["predictedTotalWordSec"],y["predictedTotalWordSec"])>=0.30)):
            flagged.append({
                "wordIndex": index, "word": x["text"],
                "originalPredictedSec": x["predictedTotalWordSec"],
                "connectedPredictedSec": y["predictedTotalWordSec"],
                "deltaSec": diff, "targetWord": name in WATCH_WORDS,
                "humanDefectConfirmed": False,
            })
    return {"comparisonAvailable": True,
            "candidateDifferences": sorted(flagged,key=lambda d:abs(d["deltaSec"]),reverse=True),
            "meaning": "Only native token duration differences, NOT corrected emphasis or vowels"}


def render(out):
    preflight()
    root = pathlib.Path(out)
    if root.exists():
        raise FileExistsError("OUTPUT_ALREADY_EXISTS")
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline
    # Fresh untouched voice model, no IPA or text overrides.
    pipeline = KPipeline(lang_code="a")
    root.mkdir(parents=True, exist_ok=False)
    observations = {}
    outputs = {}
    for label,script in CONDITIONS.items():
        torch.manual_seed(SEED)
        np.random.seed(SEED)
        results = list(pipeline(script,voice=VOICE,speed=1.0))
        if len(results) != 1:
            raise ValueError("UNEXPECTED_MODEL_CHUNK_COUNT")
        result = results[0]
        if result.graphemes.strip() != script.strip():
            raise ValueError("NATIVE_SCRIPT_DRIFT")
        measurement = inspect_result(result, script)
        if label == "original" and measurement["nativeInputPhonemeSha256"] != G2P_BASELINE_SHA256:
            raise ValueError("NATIVE_G2P_REGRESSION_VS_VERIFIED_NOV5_BASELINE")
        values = result.audio.detach().float().cpu().numpy()
        if values.ndim != 1 or not np.all(np.isfinite(values)) or np.max(np.abs(values)) >= 1:
            raise ValueError("INVALID_WAVEFORM")
        wav = root/(label+".wav")
        sf.write(str(wav),values,SAMPLE_RATE,subtype="PCM_16")
        measurement["dryNativeWavSha256"] = sha(wav.read_bytes())
        measurement["dryNativeWavFile"] = wav.name
        measurement["script"] = script
        measurement["scriptSha256"] = sha(script.encode("utf8"))
        measurement["seed"] = SEED
        observations[label] = measurement
        outputs[label] = wav.name
    evidence = {
        "schema": SCHEMA, "voiceId":VOICE, "model":"Kokoro-82M",
        "libraryVersion":"0.9.4", "speed":1.0,
        "identicalSpokenWords": True, "controlVsPunctuationOnly": True,
        "phonemeOverrideApplied":False,"waveformRetimingApplied":False,
        "voiceCloningPerformed":False,
        "independentASRAlignmentPerformed":False,
        "lexicalStressIsNotSemanticEmphasis":True,
        "audioTimeEstimatesAreModelDerived":True,
        "humanAudioImprovementConfirmed":False,
        "commercialRightsIndependentlyVerified":False,
        "modelCheckpointPinned":False,
        "productionApproved":False,
        "observations":observations,
        "comparison": compare(observations["original"], observations["connected"]),
    }
    (root/"evidence.json").write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+"\n")
    print(json.dumps({"status":"REAL_NATIVE_MODEL_DURATION_AUDIT_NOT_RELEASED",
                      "wordTimingAvailable":{k:v["nativeTokenTimesUsable"] for k,v in observations.items()},
                      "comparisonCandidates":len(evidence["comparison"]["candidateDifferences"])}))


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--verify-only",action="store_true")
    p.add_argument("--output")
    args=p.parse_args()
    if args.verify_only and not args.output:
        preflight()
    elif args.output and not args.verify_only:
        render(args.output)
    else:
        p.error("Use --verify-only OR --output NEW_FOLDER")


if __name__=="__main__":
    main()
