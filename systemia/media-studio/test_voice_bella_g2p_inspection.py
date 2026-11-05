#!/usr/bin/env python3
"""No-model tests for Bella G2P inspection and distinction from spoken stress."""
import importlib.util
import pathlib
import types
import unittest

script=pathlib.Path(__file__).with_name('voice-bella-g2p-inspection.py')
spec=importlib.util.spec_from_file_location('bella_g2p',script)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BellaG2PTests(unittest.TestCase):
    def test_mock_phonemes_keep_original_stress_marks_without_inference(self):
        token=types.SimpleNamespace(text='Evercraft',phonemes='ˈɛvəkɹæft')
        result=types.SimpleNamespace(graphemes='Evercraft',phonemes=token.phonemes,tokens=[token])
        report=module.materialize_result([result],script='Evercraft')
        self.assertEqual(report['chunks'][0]['tokens'][0]['lexicalPrimaryStressMarks'],1)
        self.assertEqual(report['chunks'][0]['tokens'][0]['grapheme'],'Evercraft')
        self.assertFalse(report['neuralInferencePerformed'])
        self.assertFalse(report['tokenAudioTimingAvailable'])
        self.assertFalse(report['releaseAuthorized'])
        self.assertFalse(report['pitchStressOutputAvailable'])

    def test_empty_phonemes_are_fail_closed(self):
        result=types.SimpleNamespace(graphemes='Evercraft',phonemes='',tokens=[])
        with self.assertRaisesRegex(ValueError,'NO_KOKORO_FRONTEND_PHONEMES'):
            module.materialize_result([result])

    def test_no_audio_or_ipa_override_code_path(self):
        s=script.read_text()
        self.assertIn('model=False',s)
        self.assertNotIn('generate_from_tokens',s)
        self.assertNotIn('phoneme alphabet=',s)
        self.assertEqual(module.VOICE,'af_bella')

if __name__=='__main__':
    unittest.main()