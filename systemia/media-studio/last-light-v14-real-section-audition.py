#!/usr/bin/env python3
"""Evercraft V14: eight-section, EXACT-ROOT acoustic source workprint.

This is an internal audition of REAL CC0 recordings, not a played orchestra.
No synthesis, pitch stretching, MIDI instruments, fabricated piano, or false
legato. Source identity pinned to Git blobs and independently SHA256 receipted.
"""
from __future__ import annotations
import argparse, hashlib, importlib.util, io, json, math, re, zipfile
from pathlib import Path
import numpy as np
import soundfile as sf

ROOT=Path(__file__).resolve().parent
SR=44100
DURATION=35
PIANO_SHA='630efc0e8206ec7a6f4f0dac41634ab2a34da7f518f9f90be0b339b4e5a2015e'
UPSTREAM_PIN='440300901dfe9275fd84e0b7763af1f8443ae62e'
ROLE={'violin_I':'violin_section','violin_II':'violin_section',
      'viola':'viola_section','cello':'cello','double_bass':'double_bass',
      'flute':'flute','bassoon':'bassoon','harp':'harp'}
STRINGS=('violin_I','violin_II','viola','cello','double_bass')
WINDS=('flute','bassoon')
COMPONENTS={'recorded_string_sections':STRINGS,
            'recorded_strings_and_woodwinds':STRINGS+WINDS,
            'eight_section_acoustic_workprint':tuple(ROLE)}
# Musical balance is a rehearsal hypothesis, not artist-accepted mixing.
TARGET_RMS={'violin_I':-43.,'violin_II':-44.,'viola':-45.,
            'cello':-41.,'double_bass':-45.,'flute':-49.,
            'bassoon':-47.,'harp':-48.}

def sha(raw):return hashlib.sha256(raw).hexdigest()
def gitblob(raw):return hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
def module(name,path):
    s=importlib.util.spec_from_file_location(name,ROOT/path)
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def validate_score(score):
    if score.get('protected_piano_sha256')!=PIANO_SHA:
        raise ValueError('protected_piano_identity_drift')
    module('v14_conductor','last-light-v9-conductor.py').check_score(score)
    if len(score['sections'])!=14 or sum(len(s['notes']) for s in score['sections'])!=47:
        raise ValueError('unexpected_14_section_score')
    if any(s.get('audio_approved') is not False for s in score['sections']):
        raise ValueError('false_artistic_approval')

def validate_manifest(manifest):
    if not(manifest.get('schema')=='evercraft.music.acoustic-source-pins.v14'
       and manifest.get('source_repository')=='https://github.com/sgossner/VSCO-2-CE'
       and manifest.get('source_commit_sha')==UPSTREAM_PIN
       and manifest.get('source_license')=='CC0-1.0'
       and manifest.get('source_recordings_evercraft_exclusively_owned') is False
       and manifest.get('recordings_human_listening_approved') is False
       and manifest.get('live_performed_legato') is False
       and manifest.get('artistic_ensemble_approved') is False
       and manifest.get('pitch_policy')=='exact_filename_root_only_zero_resampling_or_pitch_shifting'):
        raise ValueError('recorded_source_manifest_admission_failed')
    files=manifest.get('sample_files')
    if not isinstance(files,list) or len(files)!=12:raise ValueError('wrong_original_file_count')
    seen=set()
    for e in files:
        key=(e.get('instrument'),e.get('pitch'))
        if key in seen:raise ValueError('duplicate_recorded_root')
        seen.add(key)
        if (not re.fullmatch(r'[0-9a-f]{40}',e.get('git_blob_sha1',''))
            or not isinstance(e.get('size_bytes'),int) or e['size_bytes']<100000):
            raise ValueError('unverified_or_invalid_source_pin')
        path=e.get('path','')
        if not path.endswith('.wav') or path.startswith('/') or '..' in path.split('/'):
            raise ValueError('source_path_traversal')
        if Path(path).name.split('_')[-1] not in ('1.wav','mf.wav','rr1.wav','v1.wav'):
            # Naming check deliberately conservative, not a proof of recorded pitch.
            raise ValueError('unexpected_original_sample_path')
    return {(e['instrument'],e['pitch']):e for e in files}

def inspect_sources(source_zip,manifest):
    pins=validate_manifest(manifest)
    expected={Path(e['path']).name:e for e in manifest['sample_files']}
    if len(expected)!=len(pins):raise ValueError('colliding_source_names')
    audio={};receipts=[]
    with zipfile.ZipFile(source_zip) as z:
        names=z.namelist()
        if len(names)!=len(set(names)) or set(names)!=set(expected):
            raise ValueError('source_zip_missing_extra_or_duplicate_files')
        for filename,e in expected.items():
            raw=z.read(filename)
            if len(raw)!=e['size_bytes'] or gitblob(raw)!=e['git_blob_sha1']:
                raise ValueError('pinned_original_git_blob_drift:'+filename)
            x,sr=sf.read(io.BytesIO(raw),always_2d=True,dtype='float64')
            if (sr!=SR or x.shape[1]!=2 or len(x)<3*SR
                or not np.isfinite(x).all() or np.max(abs(x))>1.0001):
                raise ValueError('invalid_original_recording:'+filename)
            audio[(e['instrument'],e['pitch'])]=x
            receipts.append({'instrument':e['instrument'],'pitch':e['pitch'],
                             'upstream_path':e['path'],'size_bytes':len(raw),
                             'pinned_git_blob_sha1':e['git_blob_sha1'],
                             'verified_original_sha256':sha(raw),
                             'source_is_recorded':True,'note_is_human_approved':False})
    return audio,receipts

def _active_level(clip):
    # Exclude bow-attack and digitally faded tail. RMS helps make a/b comparable.
    start=round(.12*SR);end=min(len(clip)-round(.30*SR),round(.58*SR))
    if end<=start:raise ValueError('recorded_excerpt_too_short')
    val=float(np.sqrt(np.mean(np.square(clip[start:end]))))
    if not math.isfinite(val) or val<1e-6:raise ValueError('unmeasurable_recorded_excerpt')
    return 20*math.log10(val)

def _note_clip(source,seconds):
    # A measured digital note-off is NOT a human bow release or actual legato.
    tail=.30;n=round((seconds+tail)*SR)
    if n>len(source):raise ValueError('recorded_take_too_short_for_note')
    y=source[:n].copy()
    fadein=round(.006*SR);fadeout=round(tail*SR)
    y[:fadein]*=np.linspace(0,1,fadein)[:,None]
    y[-fadeout:]*=(np.cos(np.linspace(0,np.pi/2,fadeout))**2)[:,None]
    return y

def plan(score,pins):
    validate_score(score)
    expected=0;rows=[];held=[]
    for part in score['sections']:
        role=ROLE.get(part['id'])
        for t,pitch,duration,velocity,shape in part['notes']:
            row={'section':part['id'],'instrument':role,'pitch':pitch,
                 'score_at_s':t,'duration_s':duration,'velocity':velocity}
            if role and (role,pitch) in pins:
                rows.append(row);expected+=1
            else:
                held.append(dict(row,reason='NO_EXACT_PINNED_RECORDING'))
    if len(rows)!=17 or len(held)!=30 or len({r['section'] for r in rows})!=8:
        raise ValueError('planned_coverage_drift')
    return rows,held

def render(score_file,pin_file,source_zip,out):
    score_bytes=Path(score_file).read_bytes()
    pin_bytes=Path(pin_file).read_bytes()
    score=json.loads(score_bytes);manifest=json.loads(pin_bytes)
    validate_score(score)
    pinned=validate_manifest(manifest)
    rows,held=plan(score,pinned)
    recordings,custody=inspect_sources(source_zip,manifest)
    tracks={name:np.zeros((SR*DURATION,2),dtype='float64') for name in ROLE}
    section_details={s['id']:s for s in score['sections']}
    note_receipts=[]
    for event in rows:
        ident=event['section'];role=event['instrument']
        source=recordings[(role,event['pitch'])]
        # Acoustic bow/breath attack can have a natural start delay. Source is not rewritten.
        onset=module('v14_v12','last-light-v12-native-audition.py').acoustic_onset(source)
        desired=max(8.8,event['score_at_s']-onset)
        clip=_note_clip(source,event['duration_s'])
        first=round(desired*SR);last=first+len(clip)
        if last>round(31*SR):
            raise ValueError('could_obscure_canonical_piano_outro')
        db=_active_level(clip)
        change=max(-15.,min(12.,TARGET_RMS[ident]-db))
        gain=(10**(change/20))*max(.2,min(1.,event['velocity']/90))
        pan=section_details[ident]['pan']/127.
        # Preserve input stereo channels while weighting the orchestral stage.
        stage=np.array([math.cos(pan*math.pi/2),math.sin(pan*math.pi/2)])*math.sqrt(2)
        tracks[ident][first:last]+=clip*gain*stage[None,:]
        note_receipts.append(dict(event,original_source_git_blob_sha1=pinned[(role,event['pitch'])]['git_blob_sha1'],
             original_named_pitch_unchanged=True,actual_played_note_transition=False,
             digital_note_end=True,pan=section_details[ident]['pan'],
             velocity_accepted_as_rehearsal_fader=True,linear_gain=round(gain,6),
             recorded_attack_delay_s=round(onset,3)))
    if len(note_receipts)!=17:raise ValueError('missing_routed_recorded_notes')
    for name,track in tracks.items():
        if not np.any(track):raise ValueError('missing_audible_section:'+name)
        if np.any(track[:round(8.8*SR)]) or np.any(track[round(31*SR):]):
            raise ValueError('protected_piano_solo_region_contaminated')
        if np.max(abs(track))>.95:raise ValueError('orchestral_stem_headroom_refused')
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    hashes={}
    def write(name,x):
        p=out/name;sf.write(p,x,SR,subtype='PCM_24');hashes[name]=sha(p.read_bytes())
    for part,track in tracks.items():
        write('V14_'+part+'_RECORDED_ROOT_UNAPPROVED.wav',track)
    mixing={}
    for variant,names in COMPONENTS.items():
        mix=sum((tracks[n] for n in names),np.zeros_like(next(iter(tracks.values()))))
        reduction=1.
        while np.max(abs(mix*reduction))>.90:
            reduction*=.90
            if reduction<.1:raise ValueError('gain_staging_unrecoverable')
        mix=mix*reduction
        if np.any(mix[:round(8.8*SR)]) or np.any(mix[round(31*SR):]):
            raise ValueError('piano_solo_contaminated_in_mix')
        mixing[variant]={'sections':list(names),'global_headroom_gain':reduction}
        write('V14_'+variant+'_UNAPPROVED.wav',mix)
    receipt={'schema':'evercraft.music.verified-acoustic-section-audition.v14',
      'status':'NOT_HUMAN_LISTENING_APPROVED',
      'original_piano_sha256_reference':PIANO_SHA,
      'original_piano_included':False,'original_piano_mutated':False,
      'original_reference_source_commit':UPSTREAM_PIN,
      'source_license':'CC0-1.0','sources_exclusively_owned_by_evercraft':False,
      'source_original_git_blob_hashes_checked':True,
      'new_recorded_performance':False,'recorded_continuous_legato':False,
      'rehearsal_note_excerpts_software_released':True,
      'synthesis_or_pitch_shifting_used':False,
      'full_14_section_orchestra_recorded':False,
      'founder_listening_approved':False,'commercial_release_approved':False,
      'score_sha256':sha(score_bytes),'pin_manifest_sha256':sha(pin_bytes),
      'score_sections':14,'recorded_note_events':len(note_receipts),'held_note_events':len(held),
      'recorded_sections_with_at_least_one_root':len(ROLE),
      'held_sections_without_source':sorted({s['id'] for s in score['sections']}-set(ROLE)),
      'source_custody':custody,'note_custody':note_receipts,
      'held_notes':held,'mixes':mixing,'output_sha256':hashes,
      'limitations':['These are independent notes, not played sequences or true legato.',
                     'Recorded violin and viola SECTIONS are used, but no ensemble performance is approved.',
                     'No woodwind/brass sources were invented for missing notes.',
                     'No canonical 35-second piano was obtained, imported or synthesized.',
                     'All 14-section music approval and artistic counterpoint remain pending.']}
    (out/'V14_ACOUSTIC_SOURCE_RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n')
    (out/'LISTEN_FIRST.txt').write_text('Evercraft The Last Light V14, recorded acoustic section ROOT-NOTE WORKPRINT ONLY.\n'
     'Start with V14_recorded_string_sections then V14_eight_section_acoustic_workprint.\n'
     '8 sections, 17 note excerpts, 30 held. Not true played legato or full orchestra.\n'
     'No piano included. No pitch shifting, MIDI synthesizers, false approvals, commercial release.\n')
    return receipt

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--score',type=Path,default=ROOT/'last-light-v9-conductor-score.json')
    p.add_argument('--pins',type=Path,default=ROOT/'last-light-v14-verified-section-source-pins.json')
    p.add_argument('--sources',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    args=p.parse_args()
    r=render(args.score,args.pins,args.sources,args.out)
    print(json.dumps({'verified_recorded_events':r['recorded_note_events'],
        'new_section_count':r['recorded_sections_with_at_least_one_root'],
        'held':r['held_note_events'],'piano_included':r['original_piano_included']},indent=2))
