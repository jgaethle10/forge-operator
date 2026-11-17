#!/usr/bin/env python3
"""V15 musical reality check: verify HEARD pitch, not a recorded WAV's filename.

Audit genuine V14 section stems using YIN fundamental frequency. Evidence gate
only: no pitch shifting, synthesized playback, artist approval, or master mix.
This catches a recurring VSCO WAV pitch-naming / notation octave mismatch.
"""
from __future__ import annotations
import argparse,hashlib,io,json,math,statistics,zipfile
from pathlib import Path
import librosa
import numpy as np
import soundfile as sf

SR=44100
EXPECTED_PIANO='630efc0e8206ec7a6f4f0dac41634ab2a34da7f518f9f90be0b339b4e5a2015e'
EXPECTED_SOURCE_COMMIT='440300901dfe9275fd84e0b7763af1f8443ae62e'
# Independent receiver-side check of original V14 GitHub Actions audio bytes.
PINNED={
'violin_I':'f23eb897d8e7657007624a007634be69cb2738af8fd2118db4258ff8ee36480f',
'violin_II':'acad5f39b2907940b726ce678c6b5c393a3a314303266655e71d8a70d1ff91ac',
'viola':'65a3f0f1c9410859acc8116607427e322e47e2ca347f9ad70cbdd121ebf4e503',
'cello':'0a0879d7407284f2b22d49f2c0ced31aa853bbeb658af0728302b6e8ed53d7ab',
'double_bass':'c4f961dd8c81153ffc9eb493d3ac582b7921b55d552aa87586e5fab40a575260',
'flute':'3a542d009628a67b89f4072a5e7c8a2cd1ad1ad7954b3935c2b9e5f4816dec1f',
'bassoon':'2bc62abea8a663a82ce9cd1b26f24c51bbc590a64629a5ee61be81d9634881b2',
'harp':'748039f39b2aaf2cab918b5f763d0f620e3297976a123902f1869829a255c927',
}

def sha(raw):return hashlib.sha256(raw).hexdigest()

def cents_between(actual,expected):
    if actual<=0 or expected<=0 or not math.isfinite(actual):raise ValueError('invalid_measured_frequency')
    return 1200*math.log2(actual/expected)

def classify(cents):
    if abs(cents)<=70:return 'PITCH_REGISTER_MATCH'
    if abs(cents-1200)<=70:return 'ONE_OCTAVE_ABOVE_SCORE'
    if abs(cents+1200)<=70:return 'ONE_OCTAVE_BELOW_SCORE'
    return 'UNRESOLVED_PITCH_MISMATCH'

def measured_note_frequency(clip):
    if len(clip)<round(.3*SR):raise ValueError('unusable_short_audio')
    if not np.isfinite(clip).all():raise ValueError('not_finite')
    mono=clip.mean(axis=1).astype('float32')
    if np.sqrt(np.mean(np.square(mono,dtype=np.float64)))<1e-5:
        raise ValueError('inaudible_recording')
    # Frequency window includes legitimate low bass and high winds.
    estimates=librosa.yin(mono,sr=SR,fmin=45,fmax=2200,
                         frame_length=4096,hop_length=512)
    good=estimates[np.isfinite(estimates)&(estimates>=45)&(estimates<=2200)]
    if len(good)<5:raise ValueError('unreliable_pitch_frame_count')
    median=float(np.median(good))
    # MAD measures within-note vibrato/instability. No invented source tuning claims.
    mad=float(np.median(np.abs(good-median)))
    return median,mad,len(good)

def validate_artifact(archive):
    names=archive.namelist()
    if len(names)!=len(set(names)):raise ValueError('duplicate_archive_entries')
    if 'V14_ACOUSTIC_SOURCE_RECEIPT.json' not in names:raise ValueError('missing_source_receipt')
    receipt=json.loads(archive.read('V14_ACOUSTIC_SOURCE_RECEIPT.json'))
    if (receipt.get('schema')!='evercraft.music.verified-acoustic-section-audition.v14'
        or receipt.get('original_reference_source_commit')!=EXPECTED_SOURCE_COMMIT
        or receipt.get('original_piano_sha256_reference')!=EXPECTED_PIANO
        or receipt.get('original_piano_included') is not False
        or receipt.get('synthesis_or_pitch_shifting_used') is not False
        or receipt.get('founder_listening_approved') is not False
        or receipt.get('score_sections')!=14
        or receipt.get('recorded_note_events')!=17
        or receipt.get('held_note_events')!=30
        or len(receipt.get('source_custody',[]))!=12):
        raise ValueError('untrusted_source_audit_receipt')
    stems={}
    for section,pinned_hash in PINNED.items():
        name=f'V14_{section}_RECORDED_ROOT_UNAPPROVED.wav'
        if name not in names:raise ValueError('stem_missing:'+section)
        raw=archive.read(name)
        if sha(raw)!=pinned_hash or receipt['output_sha256'].get(name)!=pinned_hash:
            raise ValueError('pinned_wav_bytes_mismatch:'+section)
        audio,sr=sf.read(io.BytesIO(raw),dtype='float64',always_2d=True)
        if sr!=SR or audio.shape!=(35*SR,2) or not np.isfinite(audio).all():
            raise ValueError('invalid_stem_audio:'+section)
        stems[section]=audio
    return receipt,stems

def analyze(source_zip,out=None):
    with zipfile.ZipFile(source_zip) as z:
        receipt,stems=validate_artifact(z)
    events=[]
    for row in receipt['note_custody']:
        section=row['section'];pitch=row['pitch'];at=float(row['score_at_s'])
        if section not in PINNED:raise ValueError('unknown_instrument_stem')
        start=round((at+.18)*SR);end=round((at+.55)*SR)
        if not 0<=start<end<=35*SR:raise ValueError('invalid_score_event_interval')
        measured,mad,frames=measured_note_frequency(stems[section][start:end])
        expected=float(librosa.note_to_hz(pitch))
        cents=cents_between(measured,expected)
        events.append({'section':section,'score_pitch':pitch,'score_time_s':at,
          'expected_scientific_hz':round(expected,2),
          'heard_median_fundamental_hz':round(measured,2),
          'heard_fundamental_mad_hz':round(mad,2),
          'audible_pitch_offset_cents':round(cents,1),
          'auditable_yin_frame_count':frames,
          'pitch_status':classify(cents),
          'original_filename_pitch_was_not_sufficient_evidence':True,
          'score_note_human_approved':False})
    if len(events)!=17:raise ValueError('incomplete_music_quality_audit')
    tallies={state:sum(1 for e in events if e['pitch_status']==state)
        for state in ('PITCH_REGISTER_MATCH','ONE_OCTAVE_ABOVE_SCORE',
                      'ONE_OCTAVE_BELOW_SCORE','UNRESOLVED_PITCH_MISMATCH')}
    report={'schema':'evercraft.music.audible-pitch-admission.v15',
      'status':'HOLD_PITCH_MISMATCH',
      'method':'librosa YIN estimated acoustic fundamental 0.18 to 0.55 seconds after original note cue, scientific note names A4=440Hz',
      'source_release_workflow':'The Last Light V14 reference GitHub Actions run 44028113338',
      'source_recordings_verified_by_upstream_git_blob':True,
      'independent_pinned_v14_stem_sha256_checked':True,
      'original_piano_sha256_reference':EXPECTED_PIANO,
      'original_piano_imported':False,'source_audio_resampled_or_fixed':False,
      'actual_musicians_reperformed_score':False,
      'automatic_release_approved':False,'founder_listening_approved':False,
      'tested_note_events':len(events),'tallies':tallies,
      'science_to_source_note_octave_convention_requires_mapping':True,
      'admission_decision':'BLOCKED_UNTIL_PITCH_NORMALIZATION_AND_REAUDITION',
      'note_qa':events,
      'next_steps':['Do not call root filename an exact heard pitch.',
        'Map the source sample notation octave convention to scientific pitch per instrument, including harp exception.',
        'Find a genuinely matching lower-register recording or disclose bounded resampling separately.',
        'Repeat fundamental-frequency gate on every revised audition before founder listens.',
        'Preserve original 35-second piano bytes unchanged and never automatically authorize public release.']}
    if out is not None:
        out=Path(out);out.mkdir(parents=True,exist_ok=True)
        (out/'V15_AUDIBLE_PITCH_HOLD.json').write_text(json.dumps(report,indent=2)+'\n')
        rows=['section,score_pitch,expected_hz,heard_hz,cents,pitch_status']
        for e in events:
            rows.append(','.join(map(str,[e['section'],e['score_pitch'],
                e['expected_scientific_hz'],e['heard_median_fundamental_hz'],
                e['audible_pitch_offset_cents'],e['pitch_status']])))
        (out/'V15_AUDIBLE_PITCH_HOLD.csv').write_text('\n'.join(rows)+'\n')
        (out/'DO_NOT_RELEASE.txt').write_text(
           'V14 actual PCM fundamental-frequency audit. PITCH MISMATCH: HOLD.\n'
           'One CC0 library octave naming convention appears different from score notation.\n'
           'No corrected recording or approved playable orchestration has been produced.\n'
           'All source and score media remain untouched.\n')
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--v14-artifact',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    args=p.parse_args()
    r=analyze(args.v14_artifact,args.out)
    print(json.dumps({'status':r['status'],'tallies':r['tallies']},indent=2))
    if r['tallies']['PITCH_REGISTER_MATCH']!=17:
        print('AUDIBLE PITCH ADMISSION: REJECTED. Do not render canonical piano mix.')
