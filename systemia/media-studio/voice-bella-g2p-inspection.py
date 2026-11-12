#!/usr/bin/env python3
"""Inspect Kokoro's English text-to-phoneme output with MODEL DISABLED.

Do not replace, re-stress, override IPA, clone, normalize, splice or publish
Bella. Front-end phonemes and lexical stress marks are NOT evidence of
heard emphasis, acoustic vowel length or a production-safe audio improvement.
"""
import argparse
import hashlib
import json
import pathlib
import re

SCHEMA='evercraft.bella.lexical-frontend-inspection.v1'
VOICE='af_bella'
SCRIPT=("You know that moment when everything begins to make sense. "
    "The noise falls away. The next step becomes clear. "
    "And suddenly, you can see where this could go. "
    "That's what we're building at Evercraft. "
    "Something worth paying attention to. Something you'll want to come back to.")


def materialize_result(results, script=SCRIPT):
    """Use only native pipeline output; unknown/missing details remain unknown."""
    chunks=[]
    for i,result in enumerate(results):
        phonemes=getattr(result,'phonemes',None)
        graphemes=getattr(result,'graphemes',None)
        if not isinstance(phonemes,str) or not phonemes.strip():
            raise ValueError('NO_KOKORO_FRONTEND_PHONEMES')
        tokens=[]
        for t in getattr(result,'tokens',None) or []:
            word=getattr(t,'text',None)
            if word is None:
                word=getattr(t,'graphemes',None)
            ph=getattr(t,'phonemes',None)
            if not isinstance(ph,str):
                ph=''
            tokens.append({'grapheme':str(word) if word is not None else None,
                           'phonemes':ph,
                           'lexicalPrimaryStressMarks':ph.count('ˈ'),
                           'lexicalSecondaryStressMarks':ph.count('ˌ'),
                           'predictedAudioWordStartSec':None,
                           'predictedAudioWordEndSec':None})
        chunks.append({'chunk':i+1, 'graphemes':str(graphemes) if graphemes is not None else None,
                       'phonemes':phonemes, 'primaryStressMarks':phonemes.count('ˈ'),
                       'secondaryStressMarks':phonemes.count('ˌ'), 'tokens':tokens,
                       'phonemesSha256':hashlib.sha256(phonemes.encode('utf8')).hexdigest()})
    if not chunks:
        raise ValueError('NO_PIPELINE_OUTPUT')
    total_text=' '.join((x['graphemes'] or '') for x in chunks)
    # G2P may omit or normalize punctuation/whitespace, so text differences are
    # observational and must not become fabricated word-level alignment.
    return {'schema':SCHEMA,'voiceId':VOICE,
            'lockedScriptSha256':hashlib.sha256(script.encode('utf8')).hexdigest(),
            'lockedScript':script,
            'modelGenerationDisabled':True,
            'neuralInferencePerformed':False,
            'audioGenerated':False,
            'pitchStressOutputAvailable':False,
            'phonemeDurationModelRun':False,
            'lexicalStressIsNotSemanticEmphasis':True,
            'g2pProvenanceWithoutFallbackLogs':'unknown',
            'tokenAudioTimingAvailable':False,
            'sourceTextCoverageVerified':False,
            'combinedGraphemes':total_text,
            'originalBellaVoiceUntouched':True,
            'releaseAuthorized':False,
            'chunks':chunks,
            'status':'PHONEME_FRONTEND_DIAGNOSTIC_REVIEW_ONLY'}


def real_frontend(script=SCRIPT):
    # model=False: the Kokoro pipeline performs G2P and chunking, not audio.
    from kokoro import KPipeline
    pipeline=KPipeline(lang_code='a',model=False)
    return materialize_result(list(pipeline(script,voice=VOICE)),script)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',type=pathlib.Path,required=True)
    args=p.parse_args()
    if args.output.exists():
        p.error('OUTPUT_ALREADY_EXISTS')
    result=real_frontend()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'status':result['status'],'chunks':len(result['chunks']),
        'voice':VOICE,'generatedAudio':False,'sourceTextCoverageVerified':False}))

if __name__=='__main__':
    main()