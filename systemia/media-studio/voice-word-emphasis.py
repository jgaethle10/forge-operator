#!/usr/bin/env python3
"""Evercraft Voice Foundry: localized word emphasis with original take preservation.

An editor must manually establish word boundaries, consent and source provenance.
No new voice synthesis, casting approval or public release authority is implied.
"""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
import numpy as np
import soundfile as sf

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def lengthen_word(source, output, *, word_start, word_end, factor=1.3, boost_db=.8, fade_ms=10):
    source, output = Path(source), Path(output)
    if source.resolve() == output.resolve():
        raise ValueError("never_overwrite_source")
    audio, sr = sf.read(source)
    if audio.ndim != 1 or not 16000 <= sr <= 48000:
        raise ValueError("dry_mono_voice_required")
    if not 0 <= word_start < word_end < len(audio)/sr or not .07 <= word_end-word_start <= .8:
        raise ValueError("reviewed_word_bounds_required")
    if not 1.05 <= factor <= 1.80:
        raise ValueError("stretch_factor_out_of_bounds")
    if not 0 <= boost_db <= 2.0:
        raise ValueError("boost_db_out_of_bounds")
    a,b=round(word_start*sr),round(word_end*sr)
    fade=round(fade_ms*.001*sr)
    if fade<120 or fade>(b-a)//5:
        raise ValueError("fade_window_invalid")
    with tempfile.TemporaryDirectory() as td:
        inp,out=Path(td)/"input.wav",Path(td)/"output.wav"
        sf.write(inp,audio[a:b],sr,subtype="PCM_24")
        proc=subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-i",str(inp),"-af",
            f"rubberband=tempo={1/factor:.7f}:transients=smooth:detector=soft:phase=laminar:window=standard:formant=preserved",
            "-ar",str(sr),"-ac","1","-c:a","pcm_f32le",str(out)],capture_output=True,text=True)
        if proc.returncode:
            raise RuntimeError("rubberband_failed:"+proc.stderr[-240:])
        rendered,rsr=sf.read(out)
    if rsr!=sr or rendered.ndim!=1:
        raise RuntimeError("render_format_wrong")
    t=np.linspace(0,1,fade)
    fadein=t*t*(3-2*t)
    fadeout=1-fadein
    accent=np.ones(len(rendered))
    accent[:fade]=fadein
    accent[-fade:]=fadeout
    rendered*=1+(10**(boost_db/20)-1)*accent
    rendered[:fade]=fadeout*audio[a:a+fade]+fadein*rendered[:fade]
    cross=fadeout*rendered[-fade:]+fadein*audio[b:b+fade]
    result=np.concatenate([audio[:a],rendered[:-fade],cross,audio[b+fade:]])
    if np.max(abs(result))>=.98:
        raise RuntimeError("would_clip")
    if not np.array_equal(result[:a],audio[:a]):
        raise RuntimeError("original_prefix_modified")
    addition=len(result)-len(audio)
    if addition<=0:
        raise RuntimeError("no_emphasis_created")
    output.parent.mkdir(parents=True,exist_ok=True)
    sf.write(output,result,sr,subtype="PCM_24")
    return {
        "schema":"evercraft.voice-foundry.word-emphasis.v1",
        "originalSha256":sha(source),"outputSha256":sha(output),
        "editedWordBoundsSec":[word_start,word_end],
        "extensionMs":round(addition/sr*1000,1),"gainDb":boost_db,
        "unchangedOriginalPrefixSec":round(a/sr,3),
        "sourceSuffixRestored":True,"newVoiceGenerated":False,
        "humanPerformanceApproved":False,"commercialRightsVerified":False,
        "publicationAuthorized":False
    }

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("source")
    p.add_argument("output")
    p.add_argument("--word-start",type=float,required=True)
    p.add_argument("--word-end",type=float,required=True)
    p.add_argument("--factor",type=float,default=1.3)
    p.add_argument("--boost-db",type=float,default=.8)
    a=p.parse_args()
    print(json.dumps(lengthen_word(a.source,a.output,word_start=a.word_start,
        word_end=a.word_end,factor=a.factor,boost_db=a.boost_db),indent=2))
