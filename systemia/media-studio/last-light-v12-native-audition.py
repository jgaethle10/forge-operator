#!/usr/bin/env python3
"""Evercraft V12: exact-pitch recorded acoustic *strings-only* auditions.

Recorded-note segments are NOT played legato or a performed string section.
No synthesizer, pitch shift, oscillator, MIDI substitute, or unauthorized
piano recreation. Every acoustic WAV must match its pinned SHA-256 and git SHA-1.
"""
from __future__ import annotations
import argparse,hashlib,importlib.util,io,json,math,zipfile
from pathlib import Path
import numpy as np
import soundfile as sf

HERE=Path(__file__).resolve().parent
SR=44100
DURATION=35.
PIANO_SHA="630efc0e8206ec7a6f4f0dac41634ab2a34da7f518f9f90be0b339b4e5a2015e"
ROLE={"cello":"cello","violin_I":"violin","violin_II":"violin"}
VARIANTS={"cello_only":("cello",),
          "cello_violin_II":("cello","violin_II"),
          "three_part_strings":("cello","violin_II","violin_I")}

def sha(data):return hashlib.sha256(data).hexdigest()
def gitblob(data):return hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
def load_module(name,file):
    s=importlib.util.spec_from_file_location(name,HERE/file)
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
    return m

def preflight(score,manifest):
    if score.get("protected_piano_sha256")!=PIANO_SHA:raise ValueError("protected_piano_identity_drift")
    load_module("v12_v9","last-light-v9-conductor.py").check_score(score)
    load_module("v12_v11","last-light-v11-acoustic-routing.py").validate_bank(manifest)

def controls_for(controls,score):
    ids={s["id"] for s in score["sections"]}
    if controls is None:return {ident:(True,100) for ident in ids}
    if not (controls.get("schema")=="evercraft.music.proposed-controls.v11"
            and controls.get("protected_piano_sha256")==PIANO_SHA
            and controls.get("approval") is False
            and controls.get("audio_render_authorized") is False):
        raise ValueError("unsafe_control_room_export")
    changes=controls.get("changes")
    if not isinstance(changes,list) or len(changes)!=len(ids):
        raise ValueError("controls_incomplete")
    result={}
    for e in changes:
        key=e.get("section");enabled=e.get("included_in_proposed_score")
        pct=e.get("expression_percent")
        if key not in ids or key in result or not isinstance(enabled,bool):
            raise ValueError("duplicate_or_unknown_control")
        if isinstance(pct,bool) or not isinstance(pct,int) or pct<0 or pct>140:
            raise ValueError("invalid_expression_control")
        result[key]=(enabled,pct)
    return result

def inspect_verified_sources(source_zip,manifest):
    records=manifest["files"]
    names={x["filename"] for x in records}
    library={};receipts=[]
    with zipfile.ZipFile(source_zip) as z:
        files=[n for n in z.namelist() if n.endswith(".wav")]
        if len(files)!=12 or set(files)!=names:raise ValueError("missing_or_extra_source")
        for row in records:
            name=row["filename"];raw=z.read(name)
            if not 1_000_000<len(raw)<5_000_000:raise ValueError("source_size_invalid:"+name)
            if sha(raw)!=row["sha256"] or gitblob(raw)!=row["git_blob_sha1"]:
                raise ValueError("source_hash_drift:"+name)
            audio,sr=sf.read(io.BytesIO(raw),dtype="float64",always_2d=True)
            if sr!=SR or audio.shape[1]!=2 or len(audio)<3*SR or not np.isfinite(audio).all():
                raise ValueError("source_waveform_invalid:"+name)
            if np.max(abs(audio))>1.0001:raise ValueError("clipped_source:"+name)
            key=(row["instrument"],row["pitch"],row["dynamic"])
            if key in library:raise ValueError("duplicate_root_layer")
            library[key]=audio
            receipts.append({"instrument":row["instrument"],"pitch":row["pitch"],
                "recorded_layer":row["dynamic"],"filename":name,
                "verified_source_sha256":sha(raw),"verified_git_blob_sha1":gitblob(raw)})
    return library,receipts

def acoustic_onset(waveform):
    width=round(.010*SR);n=min(len(waveform),2*SR)//width
    blocks=waveform[:n*width].reshape(n,width,2)
    rms=np.sqrt(np.mean(np.square(blocks),axis=(1,2)))
    if rms.max()<1e-5:raise ValueError("inaudible_source")
    hits=np.flatnonzero(rms>=rms.max()*.22)
    if len(hits)==0:raise ValueError("bow_attack_unresolved")
    onset=float(hits[0]*width/SR)
    if onset>.95:raise ValueError("bow_attack_too_late")
    return onset

def excerpt(source,seconds):
    # Note-off is a brief digital fade, disclosed as NOT a played bow release.
    tail=.30;n=round((seconds+tail)*SR)
    if n>len(source):raise ValueError("sample_cannot_cover_note")
    audio=source[:n].copy()
    attack=round(.003*SR);audio[:attack]*=np.linspace(0,1,attack)[:,None]
    release=round(tail*SR)
    audio[-release:]*=np.cos(np.linspace(0,np.pi/2,release))[:,None]**2
    return audio

def route(score,library,controls=None):
    settings=controls_for(controls,score)
    tracks={k:np.zeros((round(DURATION*SR),2),dtype="float64") for k in ROLE}
    admitted=[];held=[]
    for part in score["sections"]:
        ident=part["id"];family=ROLE.get(ident)
        for at,pitch,length,velocity,shape in part["notes"]:
            ref={"section":ident,"pitch":pitch,"score_onset_s":at,"score_duration_s":length}
            if family is None or (family,pitch,"soft") not in library:
                held.append(dict(ref,reason="NO_EXACT_RECORDED_NOTE"));continue
            enabled,pct=settings[ident]
            if not enabled or pct==0:
                held.append(dict(ref,reason="REHEARSAL_CONTROL_MUTED"));continue
            dynamic="strong" if velocity>=65 else "soft"
            key=(family,pitch,dynamic)
            if key not in library:raise ValueError("recorded_dynamic_missing")
            sample=library[key]
            latency=acoustic_onset(sample);start=max(8.8,at-latency)
            note=excerpt(sample,length)
            a=round(start*SR);b=a+len(note)
            if b>round(31*SR):raise ValueError("sample_could_obscure_protected_piano_outro")
            measure=float(np.sqrt(np.mean(np.square(sample[round(.2*SR):round(.8*SR)]))))
            if measure<1e-6:raise ValueError("source_level_unresolved")
            desired_db=-33.5 if family=="cello" else -36.
            gain_db=max(-15.,min(9.,desired_db-20*math.log10(measure)))
            touch=max(.2,min(1.,velocity/85))*pct/100.
            tracks[ident][a:b]+=note*10**(gain_db/20.)*touch
            admitted.append(dict(ref,recorded_source_instrument=family,
                recorded_dynamic_layer=dynamic,exact_root=True,
                original_attack_s=round(latency,4),
                estimated_audible_onset_error_ms=round((start+latency-at)*1000,1),
                original_pitch_unchanged=True,source_excerpt_with_digital_release_fade=True,
                genuine_played_legato=False,expression_percent=pct))
    if len(admitted)+len(held)!=sum(len(s["notes"]) for s in score["sections"]):
        raise ValueError("score_event_lost")
    if not admitted:raise ValueError("nothing_recorded_for_audition")
    for ident,track in tracks.items():
        if np.max(abs(track))>.95:raise ValueError("stem_clips:"+ident)
        if np.any(track[:round(8.8*SR)]) or np.any(track[round(31*SR):]):
            raise ValueError("piano_solo_region_contaminated")
    return tracks,admitted,held

def verified_piano(path):
    raw=Path(path).read_bytes()
    if sha(raw)!=PIANO_SHA:raise ValueError("canonical_piano_sha_mismatch")
    p,sr=sf.read(io.BytesIO(raw),dtype="float64",always_2d=True)
    if sr!=SR or p.shape!=(round(DURATION*SR),2) or not np.isfinite(p).all():
        raise ValueError("canonical_piano_waveform_invalid")
    return raw,p

def mix(tracks,part_set,piano=None):
    if part_set not in VARIANTS:raise ValueError("unknown_arrangement")
    strings=sum((tracks[name] for name in VARIANTS[part_set]),
                np.zeros_like(tracks["cello"]))
    for _ in range(40):
        candidate=strings if piano is None else piano+strings
        if np.max(abs(candidate))<.94:break
        strings*=.88
    else:raise ValueError("could_not_fit_without_piano_mastering")
    if piano is not None:
        if not np.array_equal(candidate[:round(8.8*SR)],piano[:round(8.8*SR)]):
            raise ValueError("piano_intro_changed")
        if not np.array_equal(candidate[round(32*SR):],piano[round(32*SR):]):
            raise ValueError("piano_outro_changed")
    return candidate

def render(score_file,bank_file,sources,out,piano_file=None,controls_file=None):
    score_file=Path(score_file);bank_file=Path(bank_file)
    sb=score_file.read_bytes();bb=bank_file.read_bytes()
    score=json.loads(sb);manifest=json.loads(bb);preflight(score,manifest)
    controls=json.loads(Path(controls_file).read_text()) if controls_file else None
    controls_for(controls,score)
    originals,receipts=inspect_verified_sources(sources,manifest)
    tracks,admitted,held=route(score,originals,controls)
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    outputs={}
    def save(name,data):
        file=out/name;sf.write(file,data,SR,subtype="PCM_24")
        outputs[name]=sha(file.read_bytes())
    for name,track in tracks.items():
        save("V12_"+name+"_SOURCE_EXCERPTS_UNAPPROVED.wav",track)
    original=None;piano=None
    if piano_file is not None:
        original,piano=verified_piano(piano_file)
        (out/"ORIGINAL_PIANO_BYTE_IDENTICAL.wav").write_bytes(original)
        outputs["ORIGINAL_PIANO_BYTE_IDENTICAL.wav"]=PIANO_SHA
    for version in VARIANTS:
        save("V12_"+version+("_WITH_CANONICAL_PIANO" if piano is not None else "_STRINGS_ONLY")+".wav",
             mix(tracks,version,piano))
    receipt={"schema":"evercraft.music.acoustic-audition.v12",
        "status":"INTERNAL_NOT_LISTENING_APPROVED","source_samples_original_double_hash_verified":True,
        "source_recordings_exclusively_owned_by_evercraft":False,
        "original_piano_sha256_reference":PIANO_SHA,"canonical_piano_imported":piano is not None,
        "original_piano_waveform_unchanged":True,"synth_or_general_midi_fallback":False,
        "performed_legato":False,"recorded_orchestra_section":False,
        "recorded_note_excerpt_tail_software_faded":True,
        "commercial_release_approved":False,"human_listening_approved":False,
        "exact_root_note_events_auditioned":len(admitted),
        "held_score_events":len(held),"score_sha256":sha(sb),
        "manifest_sha256":sha(bb),"source_custody":receipts,
        "note_custody":admitted,"held_note_custody":held,"output_sha256":outputs}
    (out/"V12_AUDITION_PROVENANCE.json").write_text(json.dumps(receipt,indent=2)+"\n")
    (out/"LISTEN_FIRST.txt").write_text(
        "UNAPPROVED 35-second STRINGS-ONLY sample excerpt audition.\n"
        "Original cello and solo-violin recorded roots, not a performed string section.\n"
        "No recorded legato, no substitutes, and short DIGITAL release fades disclosed.\n"
        "Piano omitted unless its protected exact-byte WAV is independently supplied.\n"
        "Do not publish until founder listening approval, rights and music QC.\n")
    return receipt

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--score",type=Path,default=HERE/"last-light-v9-conductor-score.json")
    p.add_argument("--bank",type=Path,default=HERE/"instrument-foundry-v10-source-bank.json")
    p.add_argument("--sources",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--piano",type=Path)
    p.add_argument("--controls",type=Path)
    a=p.parse_args()
    r=render(a.score,a.bank,a.sources,a.out,a.piano,a.controls)
    print(json.dumps({"rendered_original_note_events":r["exact_root_note_events_auditioned"],
        "held_events":r["held_score_events"],"canonical_piano_present":r["canonical_piano_imported"]},indent=2))
