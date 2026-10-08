#!/usr/bin/env python3
"""Create a reproducible ForensiScope technical source receipt.

This tool fingerprints the exact locally retrieved file bytes and inspects video
container metadata. It does not determine authenticity, identity, intent, or
whether a different social-media version was manipulated.
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = "evercraft.forensiscope.media-source-receipt.v1"


def media_engine():
    executable = shutil.which("ffmpeg")
    if executable:
        return executable
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError as exc:
        raise RuntimeError("FFmpeg required (system binary or imageio-ffmpeg)") from exc


def fingerprint(path):
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def inspect(path, ffmpeg):
    cmd = [ffmpeg, "-hide_banner", "-i", str(path), "-t", "0",
           "-f", "null", "-"]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
    output = result.stderr
    duration = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", output)
    if not duration:
        raise ValueError("No readable duration: " + path.name)
    seconds = int(duration[1]) * 3600 + int(duration[2]) * 60 + float(duration[3])
    video = next((line.strip() for line in output.splitlines()
                  if re.search(r"Stream #\d+:\d+.*Video:", line)), None)
    audio = [line.strip() for line in output.splitlines()
             if re.search(r"Stream #\d+:\d+.*Audio:", line)]
    if not video:
        raise ValueError("No video stream: " + path.name)
    return {"container_duration_seconds": round(seconds, 3),
            "video_stream": video, "audio_streams": audio,
            "audio_observed": bool(audio)}


def build(entries, ffmpeg, checked=None):
    media = []
    names = set()
    for definition in entries:
        try:
            name, raw_path, published_url = definition.split("|", 2)
        except ValueError as exc:
            raise ValueError("Each --source must be label|local_path|source_url") from exc
        name = name.strip()
        if not name or name in names:
            raise ValueError("Source label missing or duplicated")
        names.add(name)
        if not published_url.startswith(("https://", "http://")):
            raise ValueError("Source URL must be HTTP(S)")
        path = Path(raw_path).expanduser()
        if not path.is_file() or path.stat().st_size == 0:
            raise ValueError("Source file missing or empty: " + name)
        media.append({"label": name, "published_source_url": published_url,
                      "downloaded_filename": path.name,
                      "bytes": path.stat().st_size,
                      "retrieved_representation_sha256": fingerprint(path),
                      **inspect(path, ffmpeg)})
    return {
        "schema": SCHEMA,
        "inspected_at": checked or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "analysis_scope": "Retrieved bytes and container stream metadata only",
        "source_count": len(media), "media": media,
        "authenticity_determination": "not_performed",
        "edit_comparison": "not_performed",
        "limitations": [
            "File hashes verify specific retrieved representations, not camera masters",
            "Normal container frame rate does not exclude speed manipulation",
            "Different camera framings require synchronized, evidence-backed matching",
            "No finding about the subject's identity, health or intentions",
            "No uploaded derivative may be certified without examining its exact bytes"
        ]
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", action="append", required=True)
    parser.add_argument("--out", help="Optional JSON output filepath")
    parser.add_argument("--expect", action="append", default=[],
                        help="label=expected_sha256 (fail closed on a mismatch)")
    args = parser.parse_args()
    report = build(args.source, media_engine())
    expected = {}
    for pair in args.expect:
        label, sep, digest = pair.partition("=")
        if not sep or not re.fullmatch(r"[a-f0-9]{64}", digest):
            parser.error("--expect requires label=64-lowercase-hex")
        expected[label] = digest
    actual = {row["label"]: row["retrieved_representation_sha256"]
              for row in report["media"]}
    for label, digest in expected.items():
        if label not in actual or actual[label] != digest:
            parser.error("SHA-256 mismatch or missing expected source: " + label)
    output = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.out:
        Path(args.out).write_text(output, encoding="utf-8")
    print(output, end="")


if __name__ == "__main__":
    main()
