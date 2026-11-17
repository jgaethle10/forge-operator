#!/usr/bin/env python3
"""Evercraft Last Light V9: orchestral *score* conductor, not an audio renderer.

Original 35-second piano is a protected AUDIO reference. This separate rehearsal
MIDI is a proposed arrangement, NOT a replacement piano or approved orchestra.
Only source-verified, individually approved performance recordings may enter the
future PulseGrid audio lane; General MIDI here is score interchange only.
"""
from __future__ import annotations
import argparse, hashlib, json, math, struct
from pathlib import Path

PIANO_SHA = '630efc0e8206ec7a6f4f0dac41634ab2a34da7f518f9f90be0b339b4e5a2015e'
TICKS = 960  # 960 pulses per quarter, fixed 120 BPM => 1920 ticks/second
TEMPO_US = 500000
SECONDS = 35.0
PITCH_CLASSES = {'C':0, 'C#':1, 'D':2, 'D#':3, 'E':4, 'F':5,
                 'F#':6, 'G':7, 'G#':8, 'A':9, 'A#':10, 'B':11}

def pitch_midi(note):
    if not isinstance(note, str): raise ValueError('invalid_note')
    try:
        if note[1:2] == '#': key, octave = note[:2], note[2:]
        else: key, octave = note[:1], note[1:]
        num = (int(octave)+1)*12 + PITCH_CLASSES[key]
    except (ValueError, KeyError): raise ValueError('invalid_note:' + note) from None
    if not 0 <= num <= 127: raise ValueError('note_out_of_midi_range')
    return num

def vlq(num):
    if not isinstance(num,int) or num<0 or num>=1<<28:raise ValueError('invalid_delta')
    group=[num&127]; num>>=7
    while num: group.insert(0,(num&127)|128);num>>=7
    return bytes(group)

def smf_track(events):
    events.sort(key=lambda e:(e[0],e[1]))
    body=bytearray();prev=0
    for tick,priority,data in events:
        if tick<prev:raise ValueError('non_monotonic_event')
        body.extend(vlq(tick-prev));body.extend(data);prev=tick
    body.extend(b'\x00\xff\x2f\x00')
    return b'MTrk'+struct.pack('>I',len(body))+body

def meta_text(kind, content):
    data=str(content).encode('utf-8')
    return bytes([255,kind])+vlq(len(data))+data

def check_score(score):
    if score.get('schema')!='evercraft.music.conductor.score.v9':raise ValueError('unknown_score_schema')
    if score.get('protected_piano_sha256')!=PIANO_SHA:raise ValueError('piano_identity_mismatch')
    if score.get('duration_seconds')!=SECONDS:raise ValueError('piano_duration_mismatch')
    if score.get('tempo_bpm')!=120:raise ValueError('unsupported_tempo_map')
    sections=score.get('sections')
    if not isinstance(sections,list) or len(sections)<10:raise ValueError('missing_orchestra_sections')
    ids=set();channels=set();total=0;count_by_section={}
    for section in sections:
        name=section['id'];channel=section['channel'];program=section['gm_program']
        if name in ids or channel in channels:raise ValueError('duplicate_section_or_channel')
        if not (0<=channel<=15 and channel!=9 and 0<=program<=127):raise ValueError('invalid_midi_channel_program')
        ids.add(name);channels.add(channel)
        if section.get('source_status') not in ('partial_recorded_samples_unapproved','recording_missing'):
            raise ValueError('invalid_source_status')
        if section.get('audio_approved') is not False:raise ValueError('cannot_claim_instrument_approval')
        lo,hi=section['range'];lo=pitch_midi(lo);hi=pitch_midi(hi)
        if lo>hi:raise ValueError('invalid_instrument_range')
        notes=section.get('notes',[])
        if not notes:raise ValueError('empty_instrument_part')
        intervals=[]
        for n in notes:
            if len(n)!=5:raise ValueError('invalid_note_event')
            at,pitch,length,velocity,shape=n
            if not (all(isinstance(x,(int,float)) and math.isfinite(x) for x in (at,length,velocity,shape))
                    and 0<=at<SECONDS and .08<=length and at+length<=31.0
                    and 25<=velocity<=110 and -22<=shape<=22):raise ValueError('unsafe_score_event')
            midi=pitch_midi(pitch)
            if not lo<=midi<=hi:raise ValueError('instrument_range_violation:'+name+':'+pitch)
            intervals.append((at,at+length,midi))
        for i,(a,b,m) in enumerate(intervals):
            for x,y,k in intervals[:i]:
                if m==k and max(a,x)<min(b,y):raise ValueError('overlapping_same_pitch')
        count_by_section[name]=len(notes);total+=len(notes)
    if total<24:raise ValueError('insufficient_score_events')
    return {'sections':len(sections),'note_events':total,'per_section':count_by_section}

def build_midi(score):
    details=check_score(score)
    master=[(0,0,meta_text(3,'Evercraft The Last Light V9 | UNAPPROVED REHEARSAL SCORE')),
            (0,1,b'\xff\x51\x03'+TEMPO_US.to_bytes(3,'big')),
            (0,2,b'\xff\x58\x04\x04\x02\x18\x08'),
            (0,3,meta_text(1,'NO AUDIO: protected piano must be separately hash-verified. GM is notation interchange only.'))]
    tracks=[smf_track(master)]
    for section in score['sections']:
        ch=section['channel']; events=[]
        def event(sec,pri,data):events.append((round(sec*TICKS*2),pri,data))
        event(0,0,meta_text(3,section['id']))
        event(0,1,bytes([0xC0|ch,section['gm_program']]))
        event(0,2,bytes([0xB0|ch,10,section['pan']]))
        event(0,3,bytes([0xB0|ch,7,section['volume']]))
        event(0,4,meta_text(1,'AUDIO HELD: '+section['source_status']+'; no performance approval'))
        for start,pitch,duration,velocity,shape in section['notes']:
            p=pitch_midi(pitch)
            event(start,11,bytes([0x90|ch,p,int(velocity)]))
            event(start,10,bytes([0xB0|ch,11,72]))
            midpoint=start+duration*.55
            event(midpoint,10,bytes([0xB0|ch,11,max(28,min(110,72+int(shape)))]))
            event(start+duration,0,bytes([0x80|ch,p,0]))
            event(start+duration,1,bytes([0xB0|ch,11,72]))
        tracks.append(smf_track(events))
    header=b'MThd'+struct.pack('>IHHH',6,1,len(tracks),TICKS)
    return header+b''.join(tracks),details

def render(score_path,out_dir):
    score_path=Path(score_path);out_dir=Path(out_dir);out_dir.mkdir(parents=True,exist_ok=True)
    original=score_path.read_bytes();score=json.loads(original)
    midi,detail=build_midi(score)
    target=out_dir/'The_Last_Light_V9_UNAPPROVED_Orchestral_Conductor.mid'
    target.write_bytes(midi)
    timeline={'schema':'evercraft.pulsegrid.orchestra-conductor-timeline.v1',
              'piano_sha256_reference_only':PIANO_SHA,'piano_audio_embedded':False,
              'midi_is_rehearsal_score_only':True,'section_audio_rendered':False,
              'automatic_synth_fallback':False,'human_listening_approved':False,
              'sections':[{'id':s['id'],'family':s['family'],'source_status':s['source_status'],
                           'audio_status':'BLOCKED_PENDING_PERFORMED_INSTRUMENT_APPROVAL',
                           'notes':s['notes']} for s in score['sections']]}
    (out_dir/'conductor-timeline.json').write_text(json.dumps(timeline,indent=2)+'\n')
    receipt={'schema':'evercraft.music.orchestra-conductor.v9','title':'The Last Light (experimental ensemble score)',
             'approved_piano_sha256':PIANO_SHA,'piano_binary_modified':False,
             'piano_audio_present':False,'audio_orchestra_rendered':False,
             'live_orchestra_performed':False,'human_orchestration_approved':False,
             'commercial_master_approved':False,'source_score_sha256':hashlib.sha256(original).hexdigest(),
             'rehearsal_midi_sha256':hashlib.sha256(midi).hexdigest(),**detail,
             'next_audio_gate':'Verified performed section/phrase assets plus founder listening approval'}
    (out_dir/'conductor-provenance.json').write_text(json.dumps(receipt,indent=2)+'\n')
    return receipt

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--score',type=Path,default=Path(__file__).with_name('last-light-v9-conductor-score.json'))
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();print(json.dumps(render(args.score,args.out),indent=2))
