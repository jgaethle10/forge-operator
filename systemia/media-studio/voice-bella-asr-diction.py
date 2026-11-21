#!/usr/bin/env python3
"""Optional word-timestamp listener: ASR evidence, NOT a pronunciation verdict.

Requires an intentionally installed faster-whisper model. The default test
path never fetches weights or copies raw voice anywhere. Caller provides
private archived Bella dry WAV ZIP and destination for a JSON evidence record.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import pathlib
import re
import tempfile
import wave
from importlib import util

SRC = pathlib.Path(__file__).with_name('voice-bella-diction-audit.py')
spec = util.spec_from_file_location('bella_diction', SRC)
diction = util.module_from_spec(spec)
spec.loader.exec_module(diction)
SCHEMA = 'evercraft.bella.asr-diction-observation.v1'


def edit_distance(x, y):
    dp=list(range(len(y)+1))
    for i,a in enumerate(x,1):
        nxt=[i]
        for j,b in enumerate(y,1):
            nxt.append(min(nxt[-1]+1, dp[j]+1, dp[j-1]+(a!=b)))
        dp=nxt
    return dp[-1]


def normalize_whisper_words(words):
    text=[]
    for w in words:
        text.extend(diction.tokenize(w['word']))
    return text


def resolve_alignment(words, script, duration):
    """Only propagate word positions if every expected word agrees exactly.

    Never substitute intended words for what the ASR actually returned. An
    imperfect transcript must stay visibly imperfect, not fake aligned.
    """
    required = diction.tokenize(script)
    transcript=normalize_whisper_words(words)
    errs=edit_distance(required,transcript)
    status='TRANSCRIPT_MISMATCH_NO_WORD_TIMES' if errs else 'EXACT_WORD_MATCH_WORD_TIMES_UNVERIFIED'
    aligned=None
    if not errs and len(words)==len(required):
        candidate=[]
        for w in words:
            candidate.append({'word':w['word'], 'startSec':w['startSec'], 'endSec':w['endSec']})
        try:
            aligned=diction.validate_alignment(candidate,script,duration)
        except (ValueError, TypeError):
            status='TIMESTAMPS_REJECTED_NO_WORD_TIMES'
    if not errs and aligned is None:
        status='WORD_TIMES_UNUSABLE_NO_WORD_ALIGNMENT'
    return {'expectedWords':len(required), 'recognizedWords':len(transcript),
            'editDistance':errs, 'asrWordErrorRate':round(errs/max(1,len(required)),4),
            'recognizedText':' '.join(w['word'].strip() for w in words),
            'status':status, 'aligned':aligned}


def transcribe_sources(paths,model_name='tiny.en',model=None):
    if model is None:
        from faster_whisper import WhisperModel
        model=WhisperModel(model_name,device='cpu',compute_type='int8',download_root=None)
    outputs=[]
    for zipfile in paths:
        sources,archive_hash,_=diction.sources_from_zip(pathlib.Path(zipfile))
        for source in sources:
            # WAV exists only in a private ephemeral directory, never uploaded.
            import soundfile as sf
            import numpy as np
            with tempfile.TemporaryDirectory(prefix='bella-asr-') as td:
                path=pathlib.Path(td)/'voice.wav'
                sf.write(str(path),np.asarray(source['samples'],dtype=np.float32),24000,subtype='PCM_16')
                segments,info=model.transcribe(str(path), language='en',beam_size=5,
                    word_timestamps=True,condition_on_previous_text=False,vad_filter=False)
                observed=[]
                for segment in segments:
                    for w in segment.words or []:
                        if w.start is not None and w.end is not None:
                            observed.append({'word':w.word,'startSec':round(float(w.start),3),
                                             'endSec':round(float(w.end),3),
                                             'probability':round(float(w.probability),3) if w.probability is not None else None})
                compared=resolve_alignment(observed,source['script'],source['durationSec'])
                record={'sourceSha256':source['sourceSha256'],'sourceName':source['sourceName'],
                        'archiveSha256':archive_hash,'modelName':model_name,
                        'asrIsNotGroundTruth':True,'asrCanMishearProperNouns':True,
                        'observedWords':observed,**compared}
                outputs.append(record)
    return {'schema':SCHEMA,'voice':'af_bella', 'reviewOnly':True,
            'notASemanticEmphasisJudge':True,'notAVowelLengthJudge':True,
            'commercialReleaseApproved':False,'records':outputs}


def exact_alignment_map(report):
    return {r['sourceSha256']:r['aligned'] for r in report['records'] if r['aligned'] is not None}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archive',action='append',required=True)
    p.add_argument('--model',default='tiny.en')
    p.add_argument('--output',required=True)
    args=p.parse_args()
    out=pathlib.Path(args.output)
    if out.exists():
        raise SystemExit('REFUSING_TO_OVERWRITE_ASR_EVIDENCE')
    evidence=transcribe_sources(args.archive,args.model)
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(evidence,indent=2)+'\n')
    out.with_suffix('.alignment.json').write_text(json.dumps(exact_alignment_map(evidence),indent=2)+'\n')
    print(json.dumps({'sources':len(evidence['records']),
          'exactWordAlignments':len(exact_alignment_map(evidence)),
          'status':'ASR_EVIDENCE_NOT_FOUNDER_REVIEWED'}))

if __name__=='__main__':
    main()