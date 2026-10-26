#!/usr/bin/env python3
"""Offline, CPU-only original motion-design proof for Fallen Studios.

Generates a short moving geometric light composition using local FFmpeg.
No stock assets, model weights, network, voice cloning, or publication.
This is motion graphics, NOT photorealistic AI footage.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--output", required=True)
    p.add_argument("--seconds", type=int, choices=range(2, 11), default=4)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    output = Path(args.output).expanduser().resolve()
    if output.suffix.lower() != ".mp4":
        p.error("output must be .mp4")
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg is required; no installation attempted")
    # Five independently moving luminous bars, camera-like parallax and light sweeps.
    # Draw expressions use FFmpeg's frame number n; no external assets.
    bars = [
        ("120+n*5", "270+n*3", 240, 10, "0x42D9FF@0.75"),
        ("600-n*4", "370+n*2", 190, 8, "0xA38CFF@0.70"),
        ("240+n*3", "800-n*2", 270, 12, "0xE8F5FF@0.80"),
        ("520-n*3", "990-n*3", 210, 8, "0x42D9FF@0.65"),
        ("80+n*4", "1140-n*2", 300, 6, "0xA38CFF@0.65"),
    ]
    vf = "format=rgb24"
    for x,y,w,h,color in bars:
        vf += f",drawbox=x='{x}':y='{y}':w={w}:h={h}:color={color}:t=fill"
    vf += ",gblur=sigma=1.5,eq=contrast=1.12:saturation=1.2,format=yuv420p"
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "color=c=0x070C19:s=720x1280:r=24",
        "-t", str(args.seconds), "-vf", vf,
        "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)
    ]
    if args.dry_run:
        print(json.dumps({"mode":"cpu_procedural_motion","output":str(output),"seconds":args.seconds,"command":command,"publishAuthorized":False}))
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(command, check=True, timeout=240)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    receipt = {"schema":"evercraft.fallen.cpu-motion-proof.v1","mode":"procedural_motion",
               "originalAssets":True,"photorealisticAI":False,"publishAuthorized":False,
               "durationSec":args.seconds,"sha256":digest}
    output.with_suffix(".receipt.json").write_text(json.dumps(receipt, indent=2)+"\n")
    print(json.dumps({"video":str(output),"receipt":str(output.with_suffix(".receipt.json")),"sha256":digest}))

if __name__ == "__main__":
    main()
