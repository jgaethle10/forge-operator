#!/usr/bin/env python3
"""Offline ASR evidence rules; no model download or actual Bella files."""
import importlib.util
import pathlib
import unittest

path=pathlib.Path(__file__).with_name('voice-bella-asr-diction.py')
spec=importlib.util.spec_from_file_location('bella_asr_diction',path)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BellaASRTests(unittest.TestCase):
    def test_word_error_rate_does_not_fake_match(self):
        expected='You know how to go'
        observed=[{'word':w,'startSec':i*.2,'endSec':(i+1)*.2}
                  for i,w in enumerate('You know how to glow'.split())]
        r=module.resolve_alignment(observed,expected,10)
        self.assertEqual(r['editDistance'],1)
        self.assertIsNone(r['aligned'])
        self.assertIn('MISMATCH',r['status'])

    def test_honest_exact_text_may_supply_word_times(self):
        expected='You know how to go'
        observed=[{'word':w,'startSec':i*.2,'endSec':(i+1)*.2}
                  for i,w in enumerate(expected.split())]
        r=module.resolve_alignment(observed,expected,10)
        self.assertEqual(r['editDistance'],0)
        self.assertEqual(len(r['aligned']),5)

    def test_overlapping_times_block_word_acoustics(self):
        expected='You know how to go'
        observed=[{'word':w,'startSec':i*.2,'endSec':(i+1)*.2}
                  for i,w in enumerate(expected.split())]
        observed[2]['startSec']=.1
        r=module.resolve_alignment(observed,expected,10)
        self.assertIsNone(r['aligned'])
        self.assertIn('NO_WORD_ALIGNMENT',r['status'])

    def test_punctuation_normalization_and_edit_distance(self):
        self.assertEqual(module.edit_distance([],['one','two']),2)
        self.assertEqual(module.edit_distance(['one','two'],['one','two']),0)
        expected="That's what we're building at Evercraft."
        observed=[{'word':w,'startSec':i*.2,'endSec':(i+1)*.2}
                  for i,w in enumerate(expected.split())]
        r=module.resolve_alignment(observed,expected,10)
        self.assertEqual(r['editDistance'],0)
        self.assertEqual(len(r['aligned']),6)

if __name__=='__main__': unittest.main()