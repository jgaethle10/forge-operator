#!/usr/bin/env python3
"""Evercraft Voice Foundry | verified private mobile audition MP4.

Creates one iPhone-friendly portrait video from a REAL workstation render,
without new TTS inference, uploading audio, or requiring a public endpoint.
Validates original WAV/MP3 SHA-256 and production/release holds first.

  python voice-foundry-mobile-review-export.py \
    --render-folder /private/jobs/<id> \
    --output /private/reviews/voice-foundry-es-demo.mp4

This is ONLY a file packager. The user/owner can separately place the file
in private storage; this tool never uploads/publishes. Spanish pronunciation,
voice licensing and spoken audio quality are NOT certified by this step.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import wave

SCHEMA="evercraft.voice-foundry.mobile-review-export.v1"
SOURCE_SCHEMA="evercraft.voice-foundry.workstation-private-render.v1"
FONT=Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
FRAME="720x1280"


def sha(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for block in iter(lambda:f.read(65536),b""):
            h.update(block)
    return h.hexdigest()


def verify(folder):
    root=Path(folder)
    if not root.is_dir() or root.is_symlink():
        raise ValueError("SOURCE_RENDER_DIRECTORY_INVALID")
    manifest=root/"evidence.json"
    if not manifest.is_file() or manifest.is_symlink() or manifest.stat().st_size>60000:
        raise ValueError("SOURCE_RECEIPT_MISSING")
    r=json.loads(manifest.read_text(encoding="utf8"))
    if r.get("schema")!=SOURCE_SCHEMA:
        raise ValueError("SOURCE_SCHEMA_NOT_AUTHORIZED")
    for key in ("productionReady","releaseAuthorized","humanPronunciationApproved",
                "textRightsVerified","commercialRightsIndependentlyVerified",
                "humanVoiceCloned","trainedCustomVoice"):
        if r.get(key) is not False:
            raise ValueError("SOURCE_RELEASE_OR_RIGHTS_HOLD_MISSING_"+key)
    if r.get("genuineNativeSynthesis") is not True or r.get("bellaOriginalMasterUntouched") is not True:
        raise ValueError("GENUINE_NATIVE_SOURCE_REQUIRED")
    voice=r.get("voiceInput")
    locale=r.get("resolvedProfile",{}).get("language")
    if not isinstance(voice,str) or not re.fullmatch("[a-z0-9_-]{3,40}",voice):
        raise ValueError("VOICE_ID_NOT_SAFE_FOR_POSTER")
    if locale not in ("en-US","en-GB","es-ES","pt-BR") or voice=="af_bella":
        raise ValueError("UNREVIEWED_LANGUAGE_OR_PROTECTED_BELLA")
    for filename,slot,name_field in (
        ("native.wav","nativeWavSha256","nativeWav"),
        ("preview.mp3","previewMp3Sha256","previewMp3")):
        p=root/filename
        if r.get(name_field)!=filename or not p.is_file() or p.is_symlink():
            raise ValueError("NATIVE_AUDIO_FILE_MISSING")
        if p.stat().st_size>40_000_000 or sha(p)!=r.get(slot):
            raise ValueError("SOURCE_WAV_MP3_HASH_MISMATCH")
    with wave.open(str(root/"native.wav"),"rb") as f:
        if (f.getnchannels(),f.getsampwidth(),f.getframerate())!=(1,2,24000):
            raise ValueError("NATIVE_AUDIO_FORMAT_CHANGED")
        seconds=f.getnframes()/f.getframerate()
    if not (2<seconds<120) or abs(seconds-r.get("audioDurationSec",-100))>.005:
        raise ValueError("NATIVE_AUDIO_DURATION_CHANGED")
    return r,round(seconds,3)


def render(folder,out):
    input_dir=Path(folder)
    dest=Path(out)
    if dest.exists() or dest.with_suffix(".evidence.json").exists():
        raise FileExistsError("PRIVATE_EXPORT_EXISTS")
    if not dest.parent.is_dir():
        raise ValueError("OUTPUT_PARENT_MISSING")
    r,seconds=verify(input_dir)
    if not FONT.is_file():
        raise RuntimeError("OPEN_SOURCE_FONT_NOT_AVAILABLE_ON_RUNNER")
    voice=r["voiceInput"]
    locale=r["resolvedProfile"]["language"]
    # Draw plain safe code identifiers only, not the script or client data.
    filtergraph=(
        f"drawtext=fontfile={FONT}:text='EVERCRAFT':fontcolor=0x171717:fontsize=52:x=54:y=150,"
        f"drawtext=fontfile={FONT}:text='VOICE FOUNDRY':fontcolor=0x98132b:fontsize=32:x=54:y=220,"
        f"drawtext=fontfile={FONT}:text='PRIVATE AUDITION':fontcolor=0x62656b:fontsize=30:x=54:y=450,"
        f"drawtext=fontfile={FONT}:text='{voice}':fontcolor=0x171717:fontsize=69:x=54:y=560,"
        f"drawtext=fontfile={FONT}:text='{locale}':fontcolor=0x98132b:fontsize=37:x=54:y=680,"
        f"drawtext=fontfile={FONT}:text='Review only - not released':fontcolor=0x62656b:"
        f"fontsize=21:x=54:y=1130"
    )
    cmd=[
        "ffmpeg","-nostdin","-hide_banner","-loglevel","error","-n",
        "-f","lavfi","-i",f"color=c=0xf9f7f6:s={FRAME}:r=1",
        "-i",str(input_dir/"native.wav"),"-map","0:v:0","-map","1:a:0",
        "-vf",filtergraph,"-c:v","libx264","-preset","veryfast","-crf","25",
        "-pix_fmt","yuv420p","-r","1","-c:a","aac","-b:a","128k",
        "-ar","48000","-movflags","+faststart","-t",str(seconds),str(dest),
    ]
    p=subprocess.run(cmd,capture_output=True,text=True,timeout=150)
    if p.returncode!=0 or not dest.is_file() or dest.stat().st_size<10000:
        dest.unlink(missing_ok=True)
        raise RuntimeError("IPHONE_VIDEO_EXPORT_FAILED")
    pp=subprocess.run(["ffprobe","-v","error","-of","json",
        "-show_entries","stream=codec_type,codec_name,width,height:format=duration",
        str(dest)],capture_output=True,text=True,timeout=30)
    if pp.returncode!=0:
        raise RuntimeError("IPHONE_VIDEO_PROBE_FAILED")
    doc=json.loads(pp.stdout)
    video=[x for x in doc.get("streams",[]) if x.get("codec_type")=="video"]
    audio=[x for x in doc.get("streams",[]) if x.get("codec_type")=="audio"]
    actual=float(doc["format"]["duration"])
    if (len(video)!=1 or len(audio)!=1 or video[0]["codec_name"]!="h264"
        or audio[0]["codec_name"]!="aac"
        or (video[0].get("width"),video[0].get("height"))!=(720,1280)
        or abs(actual-seconds)>.5):
        raise RuntimeError("IPHONE_VIDEO_VERIFICATION_FAILED")
    evidence={
        "schema":SCHEMA,"sourceReceiptSha256":sha(input_dir/"evidence.json"),
        "sourceNativeWavSha256":r["nativeWavSha256"],
        "sourcePreviewMp3Sha256":r["previewMp3Sha256"],
        "videoSha256":sha(dest),"videoFilename":dest.name,
        "videoDurationSec":round(actual,3),
        "videoCodec":"h264","audioCodec":"aac",
        "language":locale,"voiceInput":voice,
        "originalBellaV05Unchanged":True,"newTtsInferencePerformed":False,
        "humanDictionApproved":False,"publicReleaseAuthorized":False,
        "commercialRightsIndependentlyVerified":False,
    }
    dest.with_suffix(".evidence.json").write_text(
        json.dumps(evidence,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
    print(json.dumps({"status":"PRIVATE_IPHONE_MP4_VERIFIED",
                      "file":dest.name,"durationSec":round(actual,3),
                      "bytes":dest.stat().st_size,"releaseAuthorized":False}))


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--render-folder",required=True)
    p.add_argument("--output",required=True)
    args=p.parse_args()
    render(args.render_folder,args.output)


if __name__=="__main__":
    main()
