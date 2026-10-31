#!/usr/bin/env python3
"""Bella iPhone video review, from archived verified native WAVs. Review only.

Required: Python3, Pillow, ffmpeg, ffprobe, H264 encoder. No network or TTS.
Never publish or release automatically. Original WAVs stay untouched.
"""
import argparse
import hashlib
import io
import json
import pathlib
import shutil
import subprocess
import tempfile
import wave
import zipfile

LETTERS="ABCDE"
RATE=24000
GAP=1.5
SIZE=(720,1280)
SCHEMA="evercraft.bella.gap-repair-review.v1"


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def source_audio(path):
    """Fail closed if one source file, take, format or approval flag differs."""
    with zipfile.ZipFile(path) as z:
        evidence=json.loads(z.read("evidence.json"))
        if (evidence.get("schema")!=SCHEMA or
            evidence.get("voice")!="original_kokoro_af_bella" or
            evidence.get("humanApproved") is not False or
            evidence.get("commercialReleaseAuthorized") is not False or
            set(evidence.get("candidates",{}))!=set(LETTERS)):
            raise ValueError("SOURCE_EVIDENCE_OR_REVIEW_HOLD_INVALID")
        files={}
        for letter in LETTERS:
            name=f"Bella_{letter}_master.wav"
            raw=z.read(name)
            if digest(raw)!=evidence["candidates"][letter]["masterSha256"]:
                raise ValueError("SOURCE_TAMPERED_"+letter)
            with wave.open(io.BytesIO(raw),"rb") as f:
                if (f.getnchannels(),f.getsampwidth(),f.getframerate())!=(1,2,RATE):
                    raise ValueError("BAD_PCM_"+letter)
                seconds=f.getnframes()/RATE
                pcm=f.readframes(f.getnframes())
            if not 10<seconds<25 or abs(seconds-evidence["candidates"][letter]["durationSec"])>.002:
                raise ValueError("BAD_DURATION_"+letter)
            files[letter]={"pcm":pcm,"seconds":seconds,"sha256":digest(raw)}
    return files


def card(where,letter,index):
    from PIL import Image,ImageDraw,ImageFont
    image=Image.new("RGB",SIZE,"#f9f7f6")
    d=ImageDraw.Draw(image)
    def ft(sz,bold=False):
        candidates=(["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"] if bold else
                    ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"])
        for file in candidates:
            if pathlib.Path(file).is_file():
                return ImageFont.truetype(file,sz)
        return ImageFont.load_default()
    d.rectangle((0,0,720,13),fill="#a71534")
    d.rounded_rectangle((40,75,244,128),radius=12,fill="#151519")
    d.text((53,90),"EVERCRAFT",font=ft(24,True),fill="white")
    d.text((40,174),"VOICE FOUNDRY  /  PRIVATE LISTENING",font=ft(20),fill="#62616c")
    d.text((40,235),"BELLA",font=ft(92,True),fill="#151519")
    d.text((43,358),"Magnetic presence",font=ft(32),fill="#151519")
    d.line([(40,440),(680,440)],fill="#ddd2d7",width=3)
    d.text((40,480),"TAKE",font=ft(26,True),fill="#62616c")
    d.text((30,538),letter,font=ft(250,True),fill="#a71534")
    d.text((40,865),"Listen through the ending.",font=ft(31,True),fill="#151519")
    d.text((40,916),"Warmth. Flow. Naturalness.",font=ft(28),fill="#62616c")
    d.line([(40,1025),(680,1025)],fill="#ddd2d7",width=3)
    for i,x in enumerate(LETTERS):
        px=40+i*130
        d.rounded_rectangle((px,1064,px+98,1120),radius=13,
                            fill="#a71534" if x==letter else "#e8e0e2")
        d.text((px+28,1075),x,font=ft(27,True),
               fill="white" if x==letter else "#66626a")
    d.text((40,1190),"Original Bella V05  /  Not released",font=ft(20),fill="#62616c")
    image.save(where)


def export(input_archive,output):
    sources=source_audio(input_archive)
    output=pathlib.Path(output)
    if output.exists():
        raise FileExistsError("OUTPUT_ALREADY_EXISTS")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise RuntimeError("FFMPEG_NOT_INSTALLED")
    with tempfile.TemporaryDirectory(prefix="bella-iphone-video-") as tmp:
        root=pathlib.Path(tmp)
        cursor=0.0
        timeline=[]
        with wave.open(str(root/"speech.wav"),"wb") as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(RATE)
            for i,letter in enumerate(LETTERS):
                clip=sources[letter]
                start=cursor
                wav.writeframes(clip["pcm"])
                cursor+=clip["seconds"]
                if i<len(LETTERS)-1:
                    wav.writeframes(bytes(2*round(RATE*GAP)))
                    cursor+=GAP
                timeline.append({"take":letter,"startSec":round(start,3),
                                 "speechEndSec":round(start+clip["seconds"],3),
                                 "nextTakeSec":round(cursor,3)})
                card(root/(letter+".png"),letter,i)
        with open(root/"slides.txt","w") as f:
            for t in timeline:
                f.write("file '"+t["take"]+".png'\n")
                f.write(f"duration {t['nextTakeSec']-t['startSec']:.6f}\n")
            f.write("file 'E.png'\n")
        output.parent.mkdir(parents=True,exist_ok=True)
        cmd=["ffmpeg","-hide_banner","-loglevel","error","-nostdin",
             "-safe","0","-f","concat","-i",str(root/"slides.txt"),
             "-i",str(root/"speech.wav"),"-map","0:v:0","-map","1:a:0",
             "-c:v","libx264","-preset","veryfast","-crf","26",
             "-pix_fmt","yuv420p","-r","15","-c:a","aac","-b:a","128k",
             "-ar","48000","-movflags","+faststart","-t",f"{cursor:.3f}",
             str(output)]
        subprocess.run(cmd,check=True,timeout=200,capture_output=True)
        proc=subprocess.run(
            ["ffprobe","-v","error","-show_entries",
             "format=duration:stream=codec_name,codec_type,width,height",
             "-of","json",str(output)],check=True,capture_output=True,text=True)
        meta=json.loads(proc.stdout)
        video=[s for s in meta["streams"] if s["codec_type"]=="video"]
        audio=[s for s in meta["streams"] if s["codec_type"]=="audio"]
        if (len(video)!=1 or len(audio)!=1 or video[0]["codec_name"]!="h264"
            or audio[0]["codec_name"]!="aac"
            or (video[0]["width"],video[0]["height"])!=SIZE
            or abs(float(meta["format"]["duration"])-cursor)>.35):
            raise RuntimeError("OUTPUT_MEDIA_NOT_VALID")
        receipt={
            "schema":"evercraft.bella.mobile-video-review.v1",
            "sourceArchiveSha256":digest(pathlib.Path(input_archive).read_bytes()),
            "outputVideoSha256":digest(output.read_bytes()),
            "voice":"original_kokoro_af_bella",
            "sourceMastersVerified":True,"humanApproved":False,
            "commercialReleaseAuthorized":False,
            "noNewVoiceSynthesis":True,"timeline":timeline,
            "durationSec":round(float(meta["format"]["duration"]),3)}
        output.with_suffix(".evidence.json").write_text(json.dumps(receipt,indent=2)+"\n")
        print(json.dumps(receipt,indent=2))


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source-archive",required=True)
    p.add_argument("--output",required=True)
    args=p.parse_args()
    export(args.source_archive,args.output)
