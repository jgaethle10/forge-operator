#!/usr/bin/env python3
"""Read native Kokoro phoneme-symbol duration frames, without editing Bella.

Inputs are real private native-duration artifact and separately retained G2P
receipt. Never guess missing phonemes or align audio from word indices alone.
Output is model-prediction evidence, NOT vowel acoustics or approved correction.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import zipfile

SCHEMA="evercraft.bella.native-phoneme-duration-audit.v1"
EXPECTED_NATIVE="evercraft.bella.native-duration-study.v1"
EXPECTED_FRONTEND="evercraft.bella.lexical-frontend-inspection.v1"
VOICE="af_bella"
RATE=40


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def inspect(native, frontend):
    if native.get("schema") != EXPECTED_NATIVE or frontend.get("schema") != EXPECTED_FRONTEND:
        raise ValueError("UNEXPECTED_EVIDENCE_SCHEMAS")
    if native.get("voiceId") != VOICE or frontend.get("voiceId") != VOICE:
        raise ValueError("VOICE_ID_DRIFT")
    if native.get("productionApproved") is not False or native.get("phonemeOverrideApplied") is not False:
        raise ValueError("NATIVE_REVIEW_HOLDS_UNVERIFIED")
    if frontend.get("originalBellaVoiceUntouched") is not True:
        raise ValueError("ORIGINAL_G2P_VOICE_NOT_LOCKED")
    record=native["observations"]["original"]
    phonemes=frontend["chunks"][0]["phonemes"]
    if not isinstance(phonemes,str) or sha(phonemes.encode("utf8")) != record["nativeInputPhonemeSha256"]:
        raise ValueError("G2P_CHECKSUM_MISMATCH")
    frames=record["predictedTokenDurationsFrames"]
    if not isinstance(frames,list) or len(frames) != len(phonemes)+2:
        raise ValueError("FRAME_TO_SYMBOL_ALIGNMENT_NOT_EXACT")
    if not all(type(i) is int and i>=1 for i in frames):
        raise ValueError("INVALID_NATIVE_FRAME_COUNTS")
    if abs(sum(frames)/RATE-record["actualWavDurationSec"])>.005:
        raise ValueError("MODEL_FRAME_TOTAL_DOES_NOT_MATCH_WAV")
    sourcewords=record["predictedWordRecords"]
    chunks=phonemes.split(" ")
    if len(chunks)!=len(sourcewords) or not record["nativeTokenTimesUsable"]:
        raise ValueError("PHONEME_WORDS_NOT_PAIRABLE")
    report=[]
    location=0
    for index,(word,ph) in enumerate(zip(sourcewords,chunks),1):
        glyphs=[]
        for local,ch in enumerate(ph):
            frames_at=frames[1+location+local]
            glyphs.append({
                "symbol":ch,"predictedFrames":frames_at,
                "predictedSec":round(frames_at/RATE,3),
                "modelBasedOnly":True
            })
        report.append({
            "wordIndex":index,"text":word["text"],"phonemes":ph,
            "phonemeSymbols":glyphs,
            "symbolFrameTotalSec":round(sum(g["predictedSec"] for g in glyphs),3),
            "kokoroNativeTokenEstimatedSec":word["predictedTotalWordSec"],
            "durationsMayDifferBecauseOfSpacesAndPunctuation":True,
            "humanPronunciationDefectConfirmed":False})
        location += len(ph)+1
    if location-1!=len(phonemes):
        raise ValueError("PHONEME_SYMBOLS_NOT_FULLY_CONSUMED")
    # Function-word comparisons remain candidate evidence, not acoustic verdicts.
    to_words=[r for r in report if r["text"].casefold()=="to"]
    if len(to_words)!=4:
        raise ValueError("EXPECTED_TO_TOKENS_NOT_FOUND")
    intervention=[]
    for w in to_words:
        # G2P contains either unstressed schwa or full /u/ in these examples.
        duration_vowels=[g for g in w["phonemeSymbols"] if g["symbol"] in {"ə","u"}]
        intervention.append({
            "wordIndex":w["wordIndex"],"phonemes":w["phonemes"],
            "vowelPredictions":duration_vowels,
            "humanDefectConfirmed":False})
    return {
        "schema":SCHEMA,"voiceId":VOICE,
        "modelTimeUnits":"1/40 second per native phoneme symbol",
        "modelFramesNotAcousticPhonemeAlignment":True,
        "sourceNativeG2pSha256":record["nativeInputPhonemeSha256"],
        "realModelFrameCount":len(frames),
        "mappedPhonemeSymbols":len(phonemes),
        "modelDurationSec":record["actualWavDurationSec"],
        "words":report,
        "functionWordToCandidates":intervention,
        "speechModified":False,"humanAudioImprovementApproved":False,
        "commercialReleaseApproved":False
    }


def verify_source_zip(native_zip):
    with zipfile.ZipFile(native_zip) as z:
        evidence=json.loads(z.read("evidence.json"))
        if evidence.get("productionApproved") is not False:
            raise ValueError("NATIVE_RELEASE_STATE_INVALID")
        for name,ob in evidence["observations"].items():
            audio=z.read(ob["dryNativeWavFile"])
            if sha(audio)!=ob["dryNativeWavSha256"]:
                raise ValueError("SOURCE_WAV_TAMPERED_"+name)
    return evidence


def run(native_zip, frontend_json, output):
    out=pathlib.Path(output)
    if out.exists():
        raise FileExistsError("OUTPUT_ALREADY_EXISTS")
    native=verify_source_zip(native_zip)
    g2p=json.loads(pathlib.Path(frontend_json).read_text(encoding="utf8"))
    report=inspect(native,g2p)
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
    print(json.dumps({"status":"REVIEW_ONLY_NATIVE_PHONEME_PREDICTIONS",
                      "symbols":report["mappedPhonemeSymbols"],
                      "words":len(report["words"]),
                      "functionWordCandidates":len(report["functionWordToCandidates"])}))


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--native-artifact",required=True)
    p.add_argument("--frontend-evidence",required=True)
    p.add_argument("--output",required=True)
    args=p.parse_args()
    run(args.native_artifact,args.frontend_evidence,args.output)
