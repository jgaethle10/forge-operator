#!/usr/bin/env python3
"""Private Relay Voice 5 delivery QA. Passing technical tests never grants creative,
customer, publishing, or licensing approval. stdlib + ffprobe only."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import wave
import zipfile

def digest(data):
    return hashlib.sha256(data).hexdigest()

def inspect_video(path):
    raw = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries",
        "stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,sample_rate,channels:"
        "format=duration,size", "-of", "json", str(path)])
    data = json.loads(raw)
    video = next(s for s in data["streams"] if s["codec_type"] == "video")
    audio = next(s for s in data["streams"] if s["codec_type"] == "audio")
    assert video["codec_name"] == "h264"
    assert video["pix_fmt"] == "yuv420p"
    assert video["avg_frame_rate"] == "30/1"
    assert (video["width"], video["height"]) in [(1080, 1920), (720, 1280)]
    assert audio["codec_name"] == "aac" and int(audio["sample_rate"]) == 48000
    assert audio["channels"] == 2
    assert 31.0 <= float(data["format"]["duration"]) <= 31.1
    assert int(data["format"]["size"]) > 1000000
    with open(path, "rb") as fp:
        prefix = fp.read(1024 * 1024)
    assert 0 <= prefix.find(b"moov") < prefix.find(b"mdat"), "MP4 missing faststart"
    return {"file": path.name, "sha256": digest(path.read_bytes()),
            "durationSec": float(data["format"]["duration"]),
            "width": video["width"], "height": video["height"]}

def inspect_voice(path):
    with zipfile.ZipFile(path) as z:
        report = json.loads(z.read("evidence.json"))
        assert report["voiceId"] == "af_bella"
        assert report["originalNativeVoice"] is True
        assert report["timbreBlends"] is False
        assert report["phonemeOverrides"] is False
        items = report["scriptLines"]
        assert len(items) == 7
        for idx, row in enumerate(items, 1):
            assert row["id"] == "a%02d" % idx
            assert row["voice"] == "af_bella"
            data = z.read(row["filename"])
            assert digest(data) == row["sha256"]
            from io import BytesIO
            with wave.open(BytesIO(data), "rb") as w:
                assert w.getframerate() == 24000
                assert w.getnchannels() == 1
                assert abs(w.getnframes() / 24000 - row["durationSec"]) < 0.01
    return {"sourceZip": path.name, "sha256": digest(path.read_bytes()),
            "nativeBellaWavsVerified": len(items)}

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--voice-zip", type=pathlib.Path, required=True)
    p.add_argument("--film", type=pathlib.Path, action="append", required=True,
                   help="Pass one or both RC15 output MP4s")
    args = p.parse_args()
    results = {"schema": "evercraft.relay.voice05-rc15-technical-qa.v1",
               "voice": inspect_voice(args.voice_zip),
               "films": [inspect_video(f) for f in args.film],
               "technicalGate": "passed", "creativeApproved": False,
               "humanListeningApproved": False, "publicationApproved": False,
               "commercialRightsVerified": False}
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
