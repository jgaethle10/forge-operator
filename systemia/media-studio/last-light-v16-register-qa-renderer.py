#!/usr/bin/env python3
"""V16: pitch-register-corrected, source-verified 8-section acoustic rehearsal.

V14 proved filename pitches are not actual heard pitches: 16/17 were +12
semitones. V16 measures actual fundamental notes before AND after bounded
one/two-semitone SAMPLE-SPEED correction. It never claims true performed
legato, canonical piano, original unprocessed playback, or release approval.
"""
from __future__ import annotations
import argparse,hashlib,importlib.util,io,json,math,zipfile
from fractions import Fraction
from pathlib import Path
import librosa
import numpy as np
import scipy.signal
import soundfile as sf
ROOT=Path(__file__).resolve().parent
SR=44100
PIANO='630efc0e8206ec7a6f4f0dac41634ab2a34da7f518f9f90be0b339b4e5a2015e'
COMMIT='440300901dfe9275fd84e0b7763af1f8443ae62e'
ROLE={'violin_I':'violin_section','violin_II':'violin_section','viola':'viola_section',
      'cello':'cello','double_bass':'double_bass','flute':'flute','bassoon':'bassoon','harp':'harp'}
STRINGS=('violin_I','violin_II','viola','cello','double_bass')
VARIANTS={'five_registered_strings':STRINGS,
          'seven_strings_and_winds':STRINGS+('flute','bassoon'),
          'eight_section_registered':tuple(ROLE)}
TARGETS={'violin_I':-43.,'violin_II':-44.,'viola':-45.,'cello':-41.,
         'double_bass':-45.,'flute':-49.,'bassoon':-47.,'harp':-48.}

def sha(b):return hashlib.sha256(b).hexdigest()
def gitblob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def module(name,filename):
    spec=importlib.util.spec_from_file_location(name,ROOT/filename)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    return m
def hz(note):return float(librosa.note_to_hz(note))
def cents(measured,desired):return 1200*math.log2(measured/desired)

def validate(score,pins):
    if score.get('protected_piano_sha256')!=PIANO:
        raise ValueError('canonical_piano_hash_drift')
    module('v16_v9','last-light-v9-conductor.py').check_score(score)
    if pins.get('schema')!='evercraft.music.register-normalization.v16':
        raise ValueError('wrong_pins_schema')
    if (pins.get('source_repo')!='https://github.com/sgossner/VSCO-2-CE' or
        pins.get('source_commit_sha')!=COMMIT or pins.get('license')!='CC0-1.0'
        or pins.get('exclusive_rights_claimed') is not False or
        pins.get('approved_for_publication') is not False or
        pins.get('max_allowed_pitch_shift_semitones')!=2 or
        pins.get('original_piano_protected_sha256')!=PIANO):
        raise ValueError('source_custody_policy_failed')
    entries=pins.get('source_map')
    if not isinstance(entries,list) or len(entries)!=12:
        raise ValueError('unexpected_pinned_instrument_count')
    mapping={}
    for e in entries:
        key=(e.get('role'),e.get('score_pitch'))
        if key in mapping:raise ValueError('duplicate_score_note_mapping')
        mapping[key]=e
        if key[0] not in set(ROLE.values()):raise ValueError('unknown_source_instrument')
        if (type(e.get('semitone_shift')) is not int or not 0<=e['semitone_shift']<=2):
            raise ValueError('unsafe_pitch_shift_limit')
        if (len(e.get('git_blob_sha1',''))!=40 or type(e.get('size_bytes')) is not int
            or e['size_bytes']<100000):
            raise ValueError('unverified_source_pin')
        source_label=e.get('source_label')
        if not isinstance(source_label,str):raise ValueError('missing_source_pitch')
        origin=hz(source_label)*(1 if key[0]=='harp' else 2)
        final=origin*(2**(e['semitone_shift']/12))
        if abs(cents(final,hz(key[1])))>0.1:
            raise ValueError('register_mapping_mathematically_incorrect')
        p=e.get('path','')
        if (not p.endswith('.wav') or p.startswith('/') or '..' in p.split('/')):
            raise ValueError('unsafe_recording_path')
    return mapping

def read_recorded_sources(zip_path,pins):
    entries=pins['source_map']
    expected={Path(e['path']).name:e for e in entries}
    if len(expected)!=12:raise ValueError('ambiguous_source_file_names')
    sounds={};receipts={}
    with zipfile.ZipFile(zip_path) as z:
        files=z.namelist()
        if len(files)!=len(set(files)) or set(files)!=set(expected):
            raise ValueError('source_zip_files_do_not_match_pins')
        for filename,e in expected.items():
            original=z.read(filename)
            if len(original)!=e['size_bytes'] or gitblob(original)!=e['git_blob_sha1']:
                raise ValueError('original_source_digest_mismatch:'+filename)
            a,sr=sf.read(io.BytesIO(original),always_2d=True,dtype='float64')
            if sr!=SR or a.shape[1]!=2 or len(a)<round(3*SR) or not np.isfinite(a).all():
                raise ValueError('invalid_original_source_audio:'+filename)
            if np.max(np.abs(a))>1.0001:raise ValueError('clipped_original_source:'+filename)
            sounds[(e['role'],e['score_pitch'])]=a
            receipts[(e['role'],e['score_pitch'])]=sha(original)
    return sounds,receipts

def measure_onset_and_register(audio,e):
    # Establish the actual instrument pitch rather than trusting a WAV basename.
    source_onset=module('v16_v12','last-light-v12-native-audition.py').acoustic_onset(audio)
    lo=round((source_onset+.16)*SR);hi=round((source_onset+.61)*SR)
    if hi>len(audio):raise ValueError('source_too_short_to_verify_pitch')
    measured,spread,frames=module('v16_v15','last-light-v15-audible-pitch-gate.py').measured_note_frequency(audio[lo:hi])
    expected_original=hz(e['source_label'])*(1 if e['role']=='harp' else 2)
    error=cents(measured,expected_original)
    if not math.isfinite(error) or abs(error)>50.:
        raise ValueError('raw_recorded_note_not_in_verified_octave:'+e['role']+':'+e['score_pitch'])
    return measured,source_onset,round(error,2)

def bounded_pitch_correction(original,semitones):
    # Speed resampling preserves source origin but changes pitch, timbre and timing.
    # It is NEVER described as original, human-played transcribed legato.
    if type(semitones) is not int or semitones<0 or semitones>2:
        raise ValueError('unsafe_pitch_shift_limit')
    if semitones==0:return original.copy()
    factor=2**(-semitones/12)
    ratio=Fraction(factor).limit_denominator(4096)
    return scipy.signal.resample_poly(original,ratio.numerator,ratio.denominator,axis=0).astype('float64')

def verify_corrected_pitch(audio,desired_note,source_shift):
    onset=module('v16_v12b','last-light-v12-native-audition.py').acoustic_onset(audio)
    lo=round((onset+.15)*SR);hi=round((onset+.59)*SR)
    if hi>len(audio):raise ValueError('corrected_recording_too_short')
    f0,spread,frames=module('v16_v15b','last-light-v15-audible-pitch-gate.py').measured_note_frequency(audio[lo:hi])
    error=cents(f0,hz(desired_note))
    if not math.isfinite(error) or abs(error)>35.:
        raise ValueError('still_in_wrong_acoustic_pitch_register:'+desired_note)
    return f0,onset,round(error,2)

def render(score_file,pins_file,recordings_zip,out):
    sb=Path(score_file).read_bytes();pb=Path(pins_file).read_bytes()
    score=json.loads(sb);pins=json.loads(pb);mapping=validate(score,pins)
    originals,orig_hashes=read_recorded_sources(recordings_zip,pins)
    checked={};custody=[]
    for key,e in mapping.items():
        original=originals[key]
        raw_f0,raw_onset,raw_error=measure_onset_and_register(original,e)
        corrected=bounded_pitch_correction(original,e['semitone_shift'])
        f0,onset,error=verify_corrected_pitch(corrected,e['score_pitch'],e['semitone_shift'])
        checked[key]=(corrected,onset)
        custody.append({'role':key[0],'score_pitch':key[1],
          'upstream_source_path':e['path'],'raw_source_sha256':orig_hashes[key],
          'original_source_git_blob_sha1':e['git_blob_sha1'],
          'raw_filename_note':e['source_label'],'raw_audible_hz':round(raw_f0,2),
          'raw_frequency_error_cents':raw_error,
          'correction_semitones':e['semitone_shift'],
          'time_speed_resampling_disclosed':e['semitone_shift']!=0,
          'corrected_audible_hz':round(f0,2),
          'corrected_frequency_error_cents':error,
          'artistic_performance_approved':False})
    tracks={name:np.zeros((35*SR,2),dtype='float64') for name in ROLE}
    details={s['id']:s for s in score['sections']}
    accepted=[];held=[]
    audio_renderer=module('v16_source_clip','last-light-v14-real-section-audition.py')
    for part in score['sections']:
        name=part['id'];family=ROLE.get(name)
        for at,pitch,duration,velocity,shape in part['notes']:
            record={'section':name,'score_pitch':pitch,'score_time_s':at,'duration_s':duration}
            key=(family,pitch)
            if key not in checked:
                held.append(dict(record,reason='NO_VERIFIED_CORRECT_REGISTER_ROOT'))
                continue
            source,onset=checked[key]
            clip=audio_renderer._note_clip(source,duration)
            onset_pos=max(8.8,at-onset)
            first=round(onset_pos*SR);last=first+len(clip)
            if last>round(31*SR):raise ValueError('could_occlude_protected_piano_outro')
            active_db=audio_renderer._active_level(clip)
            gain=10**(max(-15.,min(12.,TARGETS[name]-active_db))/20)*max(.2,min(1.,velocity/90))
            pan=details[name]['pan']/127.
            stage=np.array([math.cos(pan*math.pi/2),math.sin(pan*math.pi/2)])*math.sqrt(2)
            tracks[name][first:last]+=clip*gain*stage[None,:]
            accepted.append(dict(record,upstream_source_pitch=mapping[key]['source_label'],
                pitch_shift_semitones=mapping[key]['semitone_shift'],
                raw_acoustic_source_verified=True,true_performed_legato=False,
                digital_sample_release_fade=True,founder_approved=False))
    if len(accepted)!=17 or len(held)!=30:raise ValueError('unintended_score_coverage')
    for name,audio in tracks.items():
        if not np.any(audio):raise ValueError('missing_registered_instrument_stem:'+name)
        if np.max(np.abs(audio))>.95:raise ValueError('stem_peak_headroom_exceeded')
        if np.any(audio[:round(8.8*SR)]) or np.any(audio[round(31*SR):]):
            raise ValueError('protected_piano_region_contaminated')
    out=Path(out);out.mkdir(parents=True,exist_ok=True);hashes={}
    def save(filename,audio):
        f=out/filename;sf.write(f,audio,SR,subtype='PCM_24');hashes[filename]=sha(f.read_bytes())
    for name,audio in tracks.items():
        save('V16_'+name+'_REGISTER_QA_UNAPPROVED.wav',audio)
    mixing={}
    for label,parts in VARIANTS.items():
        wave=sum((tracks[x] for x in parts),np.zeros_like(tracks['cello']))
        attenuation=1.
        while np.max(abs(wave*attenuation))>.9:
            attenuation*=.9
            if attenuation<.1:raise ValueError('mix_loudness_rejected')
        save('V16_'+label+'_UNAPPROVED.wav',wave*attenuation)
        mixing[label]={'parts':list(parts),'global_gain_factor':attenuation}
    receipt={'schema':'evercraft.music.pitched-audition.v16',
      'status':'AUDIBLE_PITCH_GATE_PASSED_ARTISTIC_HOLD',
      'canonical_piano_sha256_reference':PIANO,
      'canonical_piano_imported':False,'canonical_piano_mutated':False,
      'original_source_git_hashes_verified':True,
      'actual_musicians_played_the_score':False,
      'performed_true_legato':False,'new_recordings_created':False,
      'bounded_sample_speed_shifts_disclosed':True,
      'human_listening_approved':False,'commercial_release_approved':False,
      'score_sha256':sha(sb),'pins_sha256':sha(pb),'score_notes':47,
      'sample_based_events':len(accepted),'held_score_events':len(held),
      'independent_instrument_stems':len(ROLE),
      'source_mappings_audibly_verified':len(custody),
      'source_custody':custody,'accepted_note_events':accepted,
      'held_note_events_receipts':held,'mixing':mixing,'output_sha256':hashes,
      'important_limitations':['Up to two semitones of SPEED RESAMPLING alter natural timing and timbre.',
         'An accurate detected pitch is NOT an artist-approved sound.',
         'A set of individually recorded notes is NOT true performed legato.',
         'No 35-second protected Steinway piano is imported or reconstructed.',
         'Wind/brass, voice-leading and orchestral performance gaps remain.']}
    (out/'V16_REGISTER_QA_RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n')
    (out/'LISTEN_FIRST.txt').write_text(
      'Evercraft V16 register-corrected recorded acoustic workprint, ARTIST HOLD.\n'
      'V14 was 16/17 notes one octave high. V16 checks actual fundamental notes.\n'
      '5 original WAV notes are played at recorded speed; 12 string note events are\n'
      'speed-resampled by one/two semitones, NOT played transitions or real legato.\n'
      'Do not publish, claim live orchestra, or pair with another piano.\n')
    return receipt
if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--score',type=Path,default=ROOT/'last-light-v9-conductor-score.json')
    p.add_argument('--pins',type=Path,default=ROOT/'last-light-v16-register-correction-source-pins.json')
    p.add_argument('--sources',required=True,type=Path)
    p.add_argument('--out',required=True,type=Path)
    args=p.parse_args()
    r=render(args.score,args.pins,args.sources,args.out)
    print(json.dumps({'audible_source_mapping_pass':r['source_mappings_audibly_verified'],
         'score_notes_rendered':r['sample_based_events'],
         'held_notes':r['held_score_events'],'approved':r['human_listening_approved']},indent=2))
