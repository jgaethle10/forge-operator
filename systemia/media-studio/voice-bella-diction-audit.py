#!/usr/bin/env python3
"""Bella V05 word-level diction/prosody audit, no retouching or synthesis.

Inputs: hash-protected *dry neural* 24k mono WAVs from existing private
magnetic/scene auditions. Optional independent word timing/ASR evidence.
Automated sound flags are REVIEW CANDIDATES, not human judgments or proof of
vowels, semantic stress, pronunciation mistakes, or model/voice superiority.
"""
from __future__ import annotations

import argparse
import array
import hashlib
import html
import io
import json
import math
import pathlib
import re
import sys
import wave
import zipfile
from collections import defaultdict
from statistics import median

SAMPLE_RATE = 24000
WINDOW_SEC = .01
SCHEMA = 'evercraft.bella.diction-audit.v1'
MAGNETIC_SCHEMA = 'evercraft.bella.magnetic-presence-audition.v1'
SCENE_SCHEMA = 'evercraft.voice.bella.scene-continuity.v1'
REVIEW_FIELDS = ('diction', 'vowel_naturalness', 'semantic_emphasis', 'phrase_endings', 'bella_identity')
FUNCTION_WORDS = frozenset(('a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'by', 'with',
    'for', 'is', 'are', 'was', 'were', 'it', 'its', 'that', 'this', 'and', 'or', 'but',
    'can', 'you', 'your', 'we', 'our', 'could', 'would', 'should', 'as', 'from'))


def hash_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def tokenize(script: str) -> list[str]:
    return re.findall(r"[a-z]+(?:'[a-z]+)?", script.casefold())


def read_pcm(audio: bytes):
    with wave.open(io.BytesIO(audio), 'rb') as wav:
        rate, chans, width = wav.getframerate(), wav.getnchannels(), wav.getsampwidth()
        if (rate, chans, width) != (SAMPLE_RATE, 1, 2):
            raise ValueError('SOURCE_NOT_ORIGINAL_24K_MONO_PCM16')
        frames = wav.getnframes()
        if not 2 <= frames / rate <= 45:
            raise ValueError('SOURCE_DURATION_OUT_OF_BOUNDS')
        pcm = wav.readframes(frames)
    data = array.array('h')
    data.frombytes(pcm)
    if sys.byteorder == 'big':
        data.byteswap()
    if len(data) != frames:
        raise ValueError('SOURCE_PCM_FRAMES_MISMATCH')
    return [x / 32768.0 for x in data]


def sources_from_zip(path: pathlib.Path):
    with zipfile.ZipFile(path) as archive:
        evidence_raw = archive.read('evidence.json')
        evidence = json.loads(evidence_raw)
        schema = evidence.get('schema')
        sources = []
        if schema == MAGNETIC_SCHEMA:
            if evidence.get('voiceId') != 'af_bella' or evidence.get('productionReleased') is not False or evidence.get('originalNativeVoice') is not True:
                raise ValueError('MAGNETIC_VOICE_RELEASE_GATES_INVALID')
            entries = evidence['sourceModels']
            if len(entries) != 4:
                raise ValueError('MAGNETIC_SOURCE_COUNT_INVALID')
            for item in entries:
                name = item['file']
                if not name.startswith('dry-native/'):
                    raise ValueError('NOT_DRY_NATIVE_SOURCE')
                sources.append((name, item['sha256'], None))
            # All four spoken texts are the same words (punctuation variation).
            script = evidence['takes'][0]['script']
            if not all(tokenize(x['script']) == tokenize(script) for x in evidence['takes']):
                raise ValueError('SCRIPT_TOKENS_NOT_LOCKED')
            scripts = {name: script for name, _, _ in sources}
        elif schema == SCENE_SCHEMA:
            if evidence.get('voiceId') != 'af_bella' or evidence.get('productionReady') is not False or evidence.get('originalNativeVoice') is not True:
                raise ValueError('SCENE_VOICE_RELEASE_GATES_INVALID')
            # Only complete, unedited original; individual beats are not the same passage.
            item = evidence['originalDry']['continuous']
            name = item['filename']
            sources = [(name, item['sha256'], item['durationSec'])]
            scripts = {name: evidence['lockedSpeech']}
        else:
            raise ValueError('UNSUPPORTED_DRY_SOURCE_EVIDENCE_SCHEMA')
        if not sources:
            raise ValueError('NO_NATIVE_SOURCES')
        results = []
        for name, expected, duration in sources:
            if pathlib.PurePosixPath(name).is_absolute() or '..' in pathlib.PurePosixPath(name).parts:
                raise ValueError('INVALID_AUDIO_ARCHIVE_PATH')
            audio = archive.read(name)
            if hash_bytes(audio) != expected:
                raise ValueError('SHA256_ORIGINAL_AUDIO_MISMATCH: '+name)
            samples = read_pcm(audio)
            if duration is not None and abs(len(samples)/SAMPLE_RATE-duration) > .002:
                raise ValueError('DURATION_RECEIPT_MISMATCH')
            results.append({'sourceName':name,'sourceSha256':expected,
                            'script':scripts[name],'samples':samples,
                            'durationSec':round(len(samples)/SAMPLE_RATE,3)})
    return results, hash_bytes(path.read_bytes()), schema


def acoustic_features(samples, pitch_provider=None):
    """10ms RMS intensity, optional real pitch for voiced-event candidates.

    Pitch is estimated by Praat only when available. A *voiced-run* cannot by
    itself identify a vowel or prove inappropriate vowel duration.
    """
    import numpy as np
    signal = np.asarray(samples, dtype=np.float64)
    hop = round(SAMPLE_RATE * WINDOW_SEC)
    frame_count = len(signal)//hop
    windows = signal[:frame_count*hop].reshape(frame_count, hop)
    rms = np.sqrt(np.mean(windows**2, axis=1))
    db = 20 * np.log10(np.maximum(rms, 1e-7))
    times = (np.arange(frame_count)+.5)*WINDOW_SEC
    peak = float(np.max(np.abs(signal)))
    active = db > -42
    # An acoustic proxy for broad pauses, not a naturalness verdict.
    quiet_runs = []
    onset = None
    for index, value in enumerate(active):
        if not value and onset is None:
            onset=index
        if (value or index==len(active)-1) and onset is not None:
            stop=index if value else index+1
            if stop-onset >= 22:
                quiet_runs.append({'startSec':round(onset*WINDOW_SEC,2),
                                   'endSec':round(stop*WINDOW_SEC,2),
                                   'durationSec':round((stop-onset)*WINDOW_SEC,2)})
            onset=None

    f0 = np.zeros(frame_count, dtype=float)
    pitch_backend = 'unavailable'
    if pitch_provider is None:
        try:
            import parselmouth
            pitch = parselmouth.Sound(signal, sampling_frequency=SAMPLE_RATE).to_pitch_ac(
                time_step=WINDOW_SEC, pitch_floor=75, pitch_ceiling=500)
            def pitch_provider(t):
                v = pitch.get_value_at_time(float(t))
                return v if math.isfinite(v) else 0
            pitch_backend = 'praat_ac_75_500hz'
        except ImportError:
            pitch_provider = lambda t: 0
    else:
        pitch_backend = 'external_test_provider'
    for i,t in enumerate(times):
        value = float(pitch_provider(t))
        if active[i] and 75 <= value <= 500 and math.isfinite(value):
            f0[i] = value
    voiced = f0 > 0
    # Join short pitch tracking holes (< 40ms) only within energetic speech.
    voiced_filled = voiced.copy()
    for i in range(1, frame_count-4):
        if voiced[i-1] and not voiced[i] and active[i:i+4].all():
            for gap in range(1, 5):
                if i+gap >= frame_count:break
                if voiced[i+gap]:
                    voiced_filled[i:i+gap]=True
                    break
    starts = []
    begin = None
    for i,ok in enumerate(voiced_filled):
        if ok and begin is None:begin=i
        if begin is not None and (not ok or i==frame_count-1):
            end=i if not ok else i+1
            if end-begin>=30:
                vals=f0[begin:end]
                vals=vals[vals>0]
                if vals.size>=18:
                    semitones=12*np.log2(vals / np.median(vals))
                    # Sustained voiced runs are diagnostic candidates, not vowels.
                    starts.append({'startSec':round(begin*WINDOW_SEC,2),
                                   'endSec':round(end*WINDOW_SEC,2),
                                   'durationSec':round((end-begin)*WINDOW_SEC,2),
                                   'medianPitchHz':round(float(np.median(vals)),1),
                                   'pitchP90toP10Semitones':round(float(np.percentile(semitones,90)-np.percentile(semitones,10)),2)})
            begin=None
    starts = sorted(starts, key=lambda x: x['durationSec'],reverse=True)
    return ({'peak':round(peak,5),'rmsDbfs':round(float(20*np.log10(np.sqrt(np.mean(signal**2))+1e-9)),2),
            'activeFraction':round(float(np.mean(active)),3),'pitchBackend':pitch_backend,
            'longQuietIntervals':quiet_runs,'sustainedVoicedCandidates':starts[:12],
            'voicedCandidatesAreVowels':False,'sampleRate':SAMPLE_RATE},
            (times,db,f0))


def validate_alignment(alignment, script, duration):
    """Accept ONLY supplied times; neither infer nor manufacture word boundaries."""
    if not isinstance(alignment,list) or len(alignment)==0:
        raise ValueError('WORD_ALIGNMENT_NOT_PRESENT')
    normalized=tokenize(script)
    tokens=[]
    prev=0
    for row in alignment:
        if set(row) != {'word','startSec','endSec'}:
            raise ValueError('ALIGNMENT_FIELDS_INVALID')
        word=tokenize(row['word'])
        if len(word)!=1:
            raise ValueError('ONE_WORD_PER_ALIGNMENT_ENTRY')
        a,b=row['startSec'],row['endSec']
        if not isinstance(a,(float,int)) or isinstance(a,bool) or not isinstance(b,(float,int)) or isinstance(b,bool) or not (math.isfinite(a) and math.isfinite(b) and 0<=prev<=a<b<=duration):
            raise ValueError('ALIGNMENT_TIMES_INVALID_OR_OVERLAPPING')
        tokens.append(word[0]);prev=b
    if tokens!=normalized:
        raise ValueError('ALIGNMENT_WORDS_DO_NOT_MATCH_LOCKED_SCRIPT')
    return alignment


def word_proxies(alignment,metrics):
    """Acoustic word-salience *candidates*, not semantic stress verdicts."""
    import numpy as np
    times, db, f0 = metrics
    rows=[]
    for index,part in enumerate(alignment):
        a,b=part['startSec'],part['endSec']
        take=(times>=a)&(times<b)
        valid_pitch=f0[take]
        valid_pitch=valid_pitch[valid_pitch>0]
        rows.append({'index':index,'word':tokenize(part['word'])[0],
                     'startSec':a,'endSec':b,'durationSec':round(b-a,3),
                     'energyDbfs':round(float(np.percentile(db[take],75)),2) if take.any() else None,
                     'medianPitchHz':round(float(np.median(valid_pitch)),1) if valid_pitch.size>=3 else None})
    energies=[r['energyDbfs'] for r in rows if r['energyDbfs'] is not None]
    pitches=[r['medianPitchHz'] for r in rows if r['medianPitchHz'] is not None]
    if not energies:
        return [],rows
    med_energy=median(energies)
    med_f0=median(pitches) if pitches else None
    candidates=[]
    for row in rows:
        pitch_jump=round(12*math.log2(row['medianPitchHz']/med_f0),2) if med_f0 and row['medianPitchHz'] else None
        energy_jump=round(row['energyDbfs']-med_energy,2) if row['energyDbfs'] is not None else None
        # Reject categorical 'wrong stress' decisions. Return only review flags.
        if row['word'] in FUNCTION_WORDS and energy_jump is not None and energy_jump>=4 and pitch_jump is not None and pitch_jump>=2:
            candidates.append({'word':row['word'],'startSec':row['startSec'],
                               'endSec':row['endSec'],'energyAboveWordMedianDb':energy_jump,
                               'pitchAboveWordMedianSemitones':pitch_jump,
                               'finding':'POSSIBLE_PROMINENT_FUNCTION_WORD_REVIEW_ONLY'})
    return candidates,rows


def audit(paths,alignments=None):
    manifest={'schema':SCHEMA,'outputStatus':'PRIVATE_DIAGNOSTIC_UNREVIEWED',
              'originalVoice':'af_bella','automatedWrongWordStressDetermined':False,
              'automatedVowelLengthErrorDetermined':False,
              'asrTranscriptInvented':False,'humanApproved':False,'productionReady':False,
              'sources':[]}
    for archive in paths:
        samples,hashzip,source_schema=sources_from_zip(pathlib.Path(archive))
        for source in samples:
            feature,frames=acoustic_features(source.pop('samples'))
            result={**source,'archiveSha256':hashzip,'sourceSchema':source_schema,
                    'acoustics':feature,'wordAlignmentStatus':'UNAVAILABLE_NO_AUTHENTIC_TIMESTAMPS',
                    'humanReviewRequested':list(REVIEW_FIELDS)}
            if alignments is not None and source['sourceSha256'] in alignments:
                verified=validate_alignment(alignments[source['sourceSha256']],source['script'],source['durationSec'])
                flags,word_metrics=word_proxies(verified,frames)
                result['wordAlignmentStatus']='SUPPLIED_TIMESTAMP_EVIDENCE_NOT_INDEPENDENTLY_VERIFIED'
                result['wordProminenceCandidates']=flags
                result['wordAcousticProxies']=word_metrics
            manifest['sources'].append(result)
    return manifest


def review_template(report):
    return {'schema':'evercraft.bella.diction-human-review.v1','verifiedHumanListening':False,
            'sourceAuditSha256':hash_bytes(json.dumps(report,sort_keys=True).encode()),
            'humanApproved':False,'scores':{s['sourceSha256']:{x:None for x in REVIEW_FIELDS} for s in report['sources']},
            'timecodedIssues':[],
            'instructions':'Annotate spoken word, exact timestamp, issue type (vowel_length | wrong_emphasis | diction | other), severity 1-3, and what was actually heard. Do not infer approval from empty issues.'}


def save_report(report,output):
    out=pathlib.Path(output)
    if out.exists():
        raise FileExistsError('REFUSING_TO_OVERWRITE_EXISTING_REPORT')
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    out.with_suffix('.review.json').write_text(json.dumps(review_template(report),indent=2)+'\n')
    return out


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archive',action='append',required=True)
    p.add_argument('--alignment-json',type=pathlib.Path)
    p.add_argument('--output',required=True)
    args=p.parse_args()
    alignments=None
    if args.alignment_json:
        alignments=json.loads(args.alignment_json.read_text())
        if not isinstance(alignments,dict):
            p.error('alignments must be SHA-256 keys to word arrays')
    report=audit(args.archive,alignments)
    save_report(report,args.output)
    print(json.dumps({'status':'PRIVATE_DICTION_DIAGNOSTIC',
                      'sources':len(report['sources']),
                      'pitched':sum(x['acoustics']['pitchBackend']!='unavailable' for x in report['sources']),
                      'wordTimedSources':sum('SUPPLIED' in x['wordAlignmentStatus'] for x in report['sources']),
                      'humanApproval':False},indent=2))

if __name__=='__main__':
    main()