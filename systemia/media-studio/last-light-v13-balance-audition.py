#!/usr/bin/env python3
"""V13: reversible gain-only A/B of exact verified V12 recorded string stems.

NOT new recordings, legato, section performance, a canonical piano, or a final mix.
Input is a source-receipted V12 GitHub Actions WAV archive, checked against
an independent pinned manifest of SHA-256 digests below.
"""
from __future__ import annotations
import argparse,hashlib,io,json,math,zipfile
from pathlib import Path
import numpy as np
import soundfile as sf

SR=44100
PIANO_SHA='630efc0e8206ec7a6f4f0dac41634ab2a34da7f518f9f90be0b339b4e5a2015e'
STEMS={
 'cello':('V12_cello_SOURCE_EXCERPTS_UNAPPROVED.wav','31f22d3a522253844cef4f0815352d41c07edb2640d0d896619b700803c3b86c'),
 'violin_II':('V12_violin_II_SOURCE_EXCERPTS_UNAPPROVED.wav','17dc85fdd360a84a9ebed425b91f90504181ae4473850aacc7418405f932560b'),
 'violin_I':('V12_violin_I_SOURCE_EXCERPTS_UNAPPROVED.wav','85ea5e3573dac8f5147292102e1762f6435d098a68b8a90cf4c4675226d0a809'),
}
BASELINE=('V12_three_part_strings_STRINGS_ONLY.wav','16654563112d345a5c674fb9d5ba428679de59a20b5c80433d0096f966d61291')
# Target note-active RMS, not entire 35s clip containing long silences.
TARGETS={'cello_lead':{'cello':-39.5,'violin_II':-44.,'violin_I':-46.},
         'shared_phrase':{'cello':-40.5,'violin_II':-42.5,'violin_I':-43.5}}

def sha(data):return hashlib.sha256(data).hexdigest()
def db(x):return 20*math.log10(max(1e-12,float(x)))
def source_bundle(path):
    raw=Path(path).read_bytes()
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        if len(set(z.namelist()))!=len(z.namelist()):raise ValueError('duplicate_zip_entries')
        if 'V12_AUDITION_PROVENANCE.json' not in z.namelist():raise ValueError('source_provenance_missing')
        proof=json.loads(z.read('V12_AUDITION_PROVENANCE.json'))
        if (proof.get('schema')!='evercraft.music.acoustic-audition.v12' or
            proof.get('original_piano_sha256_reference')!=PIANO_SHA or
            proof.get('canonical_piano_imported') is not False or
            proof.get('human_listening_approved') is not False or
            proof.get('performed_legato') is not False or
            proof.get('exact_root_note_events_auditioned')!=9 or
            proof.get('held_score_events')!=38 or
            proof.get('source_samples_original_double_hash_verified') is not True):
            raise ValueError('untrusted_v12_receipt')
        expected={**{name:hash for name,hash in STEMS.values()},BASELINE[0]:BASELINE[1]}
        tracks={}
        for label,(name,expected_sha) in STEMS.items():
            blob=z.read(name)
            if sha(blob)!=expected_sha or proof['output_sha256'].get(name)!=expected_sha:
                raise ValueError('pinned_stem_sha_drift:'+name)
            audio,sr=sf.read(io.BytesIO(blob),always_2d=True,dtype='float64')
            if sr!=SR or audio.shape!=(35*SR,2) or not np.isfinite(audio).all():
                raise ValueError('invalid_stem_pcm:'+name)
            if np.any(audio[:round(8.8*SR)]) or np.any(audio[round(31*SR):]):
                raise ValueError('piano_solo_area_changed:'+name)
            tracks[label]=audio
        original=z.read(BASELINE[0])
        if sha(original)!=BASELINE[1] or proof['output_sha256'].get(BASELINE[0])!=BASELINE[1]:
            raise ValueError('pinned_baseline_sha_drift')
        baseline,sr=sf.read(io.BytesIO(original),always_2d=True,dtype='float64')
        if baseline.shape!=(35*SR,2) or sr!=SR:raise ValueError('invalid_baseline_pcm')
        # Source stems are PCM24 files; their sum can differ by 1 quantization step.
        if np.max(np.abs(baseline-sum(tracks.values())))>3.0/(2**23):
            raise ValueError('baseline_stem_sum_disagrees')
        return tracks,proof,original

def note_rms(tracks,proof):
    values={k:[] for k in STEMS}
    notes={k:[] for k in STEMS}
    for entry in proof['note_custody']:
        key=entry['section']
        if key not in STEMS:raise ValueError('unknown_note_section')
        start=float(entry['score_onset_s']);duration=float(entry['score_duration_s'])
        # Exclude attacks and release tails for a stable per-note sounding level.
        lo=round((start+.07)*SR);hi=round((start+min(.62,max(.16,duration-.08)))*SR)
        if not 0<=lo<hi<=len(tracks[key]):raise ValueError('invalid_note_measurement_window')
        x=tracks[key][lo:hi]
        rms=np.sqrt(np.mean(np.square(x)))
        if not np.isfinite(rms) or rms<1e-5:raise ValueError('source_note_unmeasurable')
        val=db(rms)
        values[key].append(val)
        notes[key].append({'pitch':entry['pitch'],'at_s':start,'active_rms_dbfs':round(val,2)})
    if {k:len(v) for k,v in values.items()}!={'cello':5,'violin_I':1,'violin_II':3}:
        raise ValueError('unexpected_original_note_counts')
    return {k:float(np.median(v)) for k,v in values.items()},notes

def variants(tracks,levels):
    made={};gains={}
    for name,targets in TARGETS.items():
        level={k:max(-6.,min(6.,targets[k]-levels[k])) for k in STEMS}
        # gain-only editing; original constituent instrument waveform shapes retained
        mix=sum((tracks[k]*10**(level[k]/20) for k in STEMS),np.zeros_like(tracks['cello']))
        peak=float(np.max(np.abs(mix)))
        if peak>=.94:raise ValueError('output_headroom_refused')
        if np.any(mix[:round(8.8*SR)]) or np.any(mix[round(31*SR):]):
            raise ValueError('piano_solo_area_changed_after_mix')
        made[name]=mix;gains[name]=level
    return made,gains

def render(source_zip,out):
    tracks,proof,original=source_bundle(source_zip)
    levels,individual=note_rms(tracks,proof)
    mixes,gains=variants(tracks,levels)
    dest=Path(out);dest.mkdir(parents=True,exist_ok=True)
    baseline=dest/BASELINE[0];baseline.write_bytes(original)
    hashes={baseline.name:sha(original)}
    for label,mix in mixes.items():
        filename=f'V13_{label}_GAIN_ONLY_UNAPPROVED.wav'
        p=dest/filename;sf.write(p,mix,SR,subtype='PCM_24');hashes[filename]=sha(p.read_bytes())
    report={'schema':'evercraft.music.v13-acoustic-balance-study.v1',
            'status':'NOT_HUMAN_APPROVED_STRINGS_ONLY',
            'original_35s_piano_sha256_reference':PIANO_SHA,
            'original_piano_included':False,'original_piano_changed':False,
            'input_verified_against_independent_pinned_v12_stem_hashes':True,
            'new_recordings_created':False,'performed_legato':False,
            'recorded_orchestra_sections':False,'artistic_approval':False,
            'commercial_release_approved':False,'synthetic_audio_used':False,
            'processing':'static_gain_only_no_reverb_or_compressor',
            'source_note_events':9,'missing_instrument_events':38,
            'source_active_note_rms_dbfs_medians':levels,
            'source_individual_note_levels':individual,
            'target_note_rms_dbfs':TARGETS,
            'gain_changes_db':gains,
            'rehearsal_files_sha256':hashes,
            'listening_questions':['Does the cello answer the piano or distract?',
              'Is the solo violin too pad-like?','Where do digitally faded bow releases sound artificial?',
              'Are any notes out of place against the protected piano?'],
            'missing_audio':'Approved 35s piano WAV intentionally not present and never reconstructed'}
    (dest/'V13_AUDIO_QA_RECEIPT.json').write_text(json.dumps(report,indent=2)+'\n')
    (dest/'LISTEN_FIRST.txt').write_text('Three STRINGS-ONLY gain A/B files. Source: original V12 recorded-sample stems. Unapproved.\n'
       'V12 file is byte-identical baseline. Compare cello_lead vs shared_phrase against it.\n'
       'No piano included. No performed legato, true orchestra, new recorded samples or public approval.\n')
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source-zip',required=True,type=Path)
    p.add_argument('--out',required=True,type=Path)
    a=p.parse_args();r=render(a.source_zip,a.out)
    print(json.dumps({'status':r['status'],'source_notes':r['source_note_events'],
                      'gain_changes_db':r['gain_changes_db']},indent=2))
