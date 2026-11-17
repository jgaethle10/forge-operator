#!/usr/bin/env python3
"""The Last Light V8: natural recorded bow attacks synchronized to piano rises.

Standalone orchestral SOURCE-STEM engine. Never generates the piano WAV,
or claims independent samples to be real performed legato. Original
founder-liked piano remains exact-byte SHA-pinned in last-light-v7-native-full-takes.py.
"""
from __future__ import annotations
import importlib.util, json
from pathlib import Path
import numpy as np
import soundfile as sf

V7=Path(__file__).with_name("last-light-v7-native-full-takes.py")
spec=importlib.util.spec_from_file_location("last_light_original_takes",V7)
v7=importlib.util.module_from_spec(spec);spec.loader.exec_module(v7)

SR=v7.SR
# Checked against the original 31-event Steinway source score; piano does
# not come from MIDI and is never recreated from it.
PIANO_FIRST_ASCENT_SECONDS=17.60 # piano B4
PIANO_HIGH_NOTE_SECONDS=19.40    # piano D5
FRAME_SECONDS=.010
AUDIBLE_ONSET_FRACTION=.20
MODES=("together_at_first_rise","staggered_at_peak")

def natural_attack_seconds(raw):
    """Audible acoustic bow entrance: 10-ms short-time RMS threshold.

    Stable measurement proxy, *not* a claim of perceptual listening.
    Evaluate only the first two seconds so later vibrato dynamics do not
    redefine the onset. The waveforms are never processed or trimmed.
    """
    if raw.ndim!=2 or raw.shape[1]!=2 or not np.isfinite(raw).all():
        raise ValueError("invalid_native_recording")
    width=round(FRAME_SECONDS*SR)
    count=min(len(raw),2*SR)//width
    if count<20:raise ValueError("recording_shorter_than_analysis_window")
    frames=raw[:count*width].reshape(count,width,2).astype(np.float64)
    rms=np.sqrt(np.mean(frames*frames,axis=(1,2)))
    if not float(rms.max())>1e-5:raise ValueError("native_bow_source_silent")
    audible=np.flatnonzero(rms>=float(rms.max())*AUDIBLE_ONSET_FRACTION)
    if not len(audible):raise ValueError("native_bow_attack_not_found")
    return float(audible[0]*width/SR)

def scored_placement(bank,mode="together_at_first_rise"):
    if mode not in MODES:raise ValueError("unknown_sync_variant")
    old={key:(when,gain) for key,when,gain in v7.SCORE}
    violin="violin_G4";cello="cello_G3"
    # Preserve the full violin recording AND the piano-only outro at 32s:
    # this caps the violin's start by about 6 ms, still <20ms sync error.
    violin_latest=32.0-len(bank[violin])/SR-.0005
    new_violin=min(PIANO_FIRST_ASCENT_SECONDS-natural_attack_seconds(bank[violin]),
                   violin_latest)
    goal=PIANO_FIRST_ASCENT_SECONDS if mode=="together_at_first_rise" else PIANO_HIGH_NOTE_SECONDS
    new_cello=goal-natural_attack_seconds(bank[cello])
    score=[("cello_E3",*old["cello_E3"]),
           (cello,new_cello,old[cello][1]),
           (violin,new_violin,old[violin][1])]
    for key,when,gain in score:
        if when<0 or when+len(bank[key])/SR>=32.0:raise ValueError("full_take_overwrites_piano_only_outro")
        if not 0<gain<=1:raise ValueError("invalid_authored_gain")
    return score

def source_native_stems(bank,score):
    # The V7 engine owns immutable WAV bytes and source hash verification.
    # Its instrument constructor only performs time placement + fixed gain.
    prev=v7.SCORE
    try:
        v7.SCORE=score
        return v7.stems(bank)
    finally:
        v7.SCORE=prev

def render(source_zip,out,piano_path=None):
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    bank,sources=v7.inspect_bank(source_zip)
    receipts={"schema":"evercraft.last-light.v8.acoustic-first-rise-sync",
      "source_samples":sources,"piano_reference_sha256":v7.PIANO_SHA,
      "piano_recreated":False,"actual_performed_legato":False,
      "human_approval":False,"commercial_master_approved":False,
      "headroom_limit":.95,"output_sha256":{},"placements":{}}
    piano=None
    if piano_path is not None:
        raw,piano=v7.load_piano(piano_path)
        (out/"CANONICAL_PIANO_NEVER_MODIFIED.wav").write_bytes(raw)
        receipts["output_sha256"]["CANONICAL_PIANO_NEVER_MODIFIED.wav"]=v7.PIANO_SHA
    for mode in MODES:
        score=scored_placement(bank,mode)
        parts,events=source_native_stems(bank,score)
        placement=[]
        for key,t,gain in score:
            nominal=(PIANO_FIRST_ASCENT_SECONDS if key=="violin_G4" else
                    (PIANO_FIRST_ASCENT_SECONDS if mode=="together_at_first_rise" else PIANO_HIGH_NOTE_SECONDS)
                    if key=="cello_G3" else None)
            audible=t+natural_attack_seconds(bank[key])
            placement.append({"id":key,"start":t,"actual_bow_onset":audible,
                "target_piano_time":nominal,"onset_error_ms":round((audible-nominal)*1000,1)
                if nominal is not None else None,
                "full_recording_seconds":len(bank[key])/SR,"gain_only":gain,
                "no_sample_trimming":True,"no_time_stretch":True})
        receipts["placements"][mode]=placement
        for instrument,track in parts.items():
            fn=f"V8_{mode}_{instrument}_native.wav"
            sf.write(out/fn,track,SR,subtype="PCM_24")
            receipts["output_sha256"][fn]=v7.sha((out/fn).read_bytes())
        if piano is not None:
            mixed=v7.mix(piano,parts,True)
            fn=f"V8_{mode}_with_original_piano.wav"
            sf.write(out/fn,mixed,SR,subtype="PCM_24")
            receipts["output_sha256"][fn]=v7.sha((out/fn).read_bytes())
    (out/"V8_SOUND_RECEIPT.json").write_text(json.dumps(receipts,indent=2)+"\n")
    return receipts

if __name__=="__main__":
    import argparse
    p=argparse.ArgumentParser()
    p.add_argument("--sources",required=True,type=Path)
    p.add_argument("--out",required=True,type=Path)
    p.add_argument("--piano",type=Path)
    a=p.parse_args()
    print("rendered",len(render(a.sources,a.out,a.piano)["output_sha256"]),"output files")
