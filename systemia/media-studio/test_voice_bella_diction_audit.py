#!/usr/bin/env python3
"""Offline regression suite; no downloaded models or real user's speech."""
import hashlib
import importlib.util
import io
import json
import pathlib
import struct
import tempfile
import unittest
import wave
import zipfile

ROOT=pathlib.Path(__file__).parent
spec=importlib.util.spec_from_file_location('bella_diction_audit',ROOT/'voice-bella-diction-audit.py')
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

TEXT=("You know that moment when everything begins to make sense. "
      "The noise falls away. The next step becomes clear. "
      "And suddenly, you can see where this could go. "
      "That's what we're building at Evercraft. "
      "Something worth paying attention to. Something you'll want to come back to.")


def wav_bytes(rate=24000):
    buff=io.BytesIO()
    with wave.open(buff,'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate)
        sample=struct.pack('<h',1000)
        w.writeframes(sample*rate*4)
    return buff.getvalue()


def fixture(path):
    blob=wav_bytes()
    sha=audit.hash_bytes(blob)
    evidence={'schema':audit.SCENE_SCHEMA,'voiceId':'af_bella','originalNativeVoice':True,
              'productionReady':False,'lockedSpeech':TEXT,
              'originalDry':{'continuous':{'filename':'original-dry/continuous.wav',
                                          'sha256':sha,'durationSec':4.0}}}
    with zipfile.ZipFile(path,'w') as z:
        z.writestr('evidence.json',json.dumps(evidence))
        z.writestr('original-dry/continuous.wav',blob)
    return evidence,blob


class DictionAuditTests(unittest.TestCase):
    def test_dry_source_verified_reproducible(self):
        with tempfile.TemporaryDirectory() as td:
            path=pathlib.Path(td)/'archive.zip'
            fixture(path)
            sources,sha,schema=audit.sources_from_zip(path)
            self.assertEqual(len(sources),1)
            self.assertEqual(schema,audit.SCENE_SCHEMA)
            self.assertEqual(sources[0]['durationSec'],4.0)
            self.assertEqual(sha,audit.hash_bytes(path.read_bytes()))

    def test_sha_tamper_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            path=pathlib.Path(td)/'archive.zip'
            evidence,blob=fixture(path)
            with zipfile.ZipFile(path,'w') as z:
                z.writestr('evidence.json',json.dumps(evidence))
                z.writestr('original-dry/continuous.wav',blob+b'tamper')
            with self.assertRaisesRegex(ValueError,'SHA256'):
                audit.sources_from_zip(path)

    def test_prod_or_voice_id_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            path=pathlib.Path(td)/'archive.zip'
            evidence,blob=fixture(path)
            evidence['productionReady']=True
            with zipfile.ZipFile(path,'w') as z:
                z.writestr('evidence.json',json.dumps(evidence))
                z.writestr('original-dry/continuous.wav',blob)
            with self.assertRaisesRegex(ValueError,'RELEASE_GATES_INVALID'):
                audit.sources_from_zip(path)

    def test_word_alignment_requires_exact_text_and_times(self):
        expected=[{'word':w,'startSec':i*.09,'endSec':(i+1)*.09}
                  for i,w in enumerate(audit.tokenize(TEXT))]
        aligned=audit.validate_alignment(expected,TEXT,25)
        self.assertEqual(len(aligned),len(audit.tokenize(TEXT)))
        tampered=[dict(x) for x in aligned]
        tampered[2]['word']='fluff'
        with self.assertRaisesRegex(ValueError,'WORDS_DO_NOT_MATCH'):
            audit.validate_alignment(tampered,TEXT,25)
        tampered=[dict(x) for x in aligned]
        tampered[2]['startSec']=-1
        with self.assertRaisesRegex(ValueError,'TIMES_INVALID'):
            audit.validate_alignment(tampered,TEXT,25)
        with self.assertRaisesRegex(ValueError,'NOT_PRESENT'):
            audit.validate_alignment([],TEXT,25)

    def test_pitch_and_energy_flags_are_uncertainty_labeled(self):
        import numpy as np
        align=[{'word':'go','startSec':0,'endSec':.2},
               {'word':'to','startSec':.2,'endSec':.4},
               {'word':'work','startSec':.4,'endSec':.6}]
        times=np.arange(.005,.605,.01)
        energy=np.array([-25.]*20+[-13.]*20+[-25.]*20)
        pitch=np.array([170.]*20+[280.]*20+[170.]*20)
        flagged,rows=audit.word_proxies(align,(times,energy,pitch))
        self.assertEqual(len(flagged),1)
        self.assertEqual(flagged[0]['word'],'to')
        self.assertIn('REVIEW_ONLY',flagged[0]['finding'])

    def test_full_report_never_automatically_approves(self):
        with tempfile.TemporaryDirectory() as td:
            f=pathlib.Path(td)/'source.zip'
            fixture(f)
            result=audit.audit([f])
            self.assertFalse(result['humanApproved'])
            self.assertFalse(result['productionReady'])
            self.assertFalse(result['automatedVowelLengthErrorDetermined'])
            self.assertFalse(result['automatedWrongWordStressDetermined'])
            self.assertIn('UNAVAILABLE',result['sources'][0]['wordAlignmentStatus'])
            scores=audit.review_template(result)
            self.assertFalse(scores['humanApproved'])
            self.assertTrue(all(v is None for x in scores['scores'].values() for v in x.values()))
            r=pathlib.Path(td)/'report.json'
            audit.save_report(result,r)
            self.assertTrue(r.exists())
            with self.assertRaises(FileExistsError):
                audit.save_report(result,r)


if __name__=='__main__':
    unittest.main()