import tempfile
import unittest
import sys
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path
import numpy as np
import soundfile as sf

from bella_native_audition import audio_for_text, render_private_auditions


class FakeKokoro:
    def __call__(self, text, *, voice, speed):
        assert voice == 'af_bella' and speed == 1.0
        samples = np.linspace(-0.2, 0.2, 24000, dtype='float32')
        yield (text, 'test-only-phonemes', samples)


class NoOutput:
    def __call__(self, *args, **kwargs):
        return iter([])


class BellaNativeTests(unittest.TestCase):
    def setUp(self):
        # The real synthesizer needs torch. CI tests only the pipeline
        # contract using a fake provider and a tiny manual_seed stand-in.
        self.torch_patch = patch.dict(sys.modules, {
            'torch': SimpleNamespace(manual_seed=lambda seed: None)
        })
        self.torch_patch.start()
        self.addCleanup(self.torch_patch.stop)

    def test_native_voice_and_receipt(self):
        with tempfile.TemporaryDirectory() as d:
            script = Path(d, 'private_script.txt')
            script.write_text('Every line matters.\nEvery detail matters.\n', encoding='utf-8')
            out = Path(d, 'private_out')
            receipt = render_private_auditions(script, out, FakeKokoro())
            self.assertEqual(len(receipt['auditions']), 4)
            self.assertEqual(receipt['nativeVoiceId'], 'af_bella')
            self.assertFalse(receipt['releaseAuthorized'])
            self.assertFalse(receipt['modelWeightsDigestVerified'])
            self.assertTrue((out/'bella_audition_receipt.json').is_file())
            wav, sr = sf.read(out/'bella_full_a.wav')
            self.assertEqual(sr, 24000)
            self.assertEqual(len(wav), 24000)

    def test_missing_native_audio_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError, 'BELLA_NO_NATIVE_AUDIO'):
            audio_for_text(NoOutput(), 'Hello there.', seed=4)

    def test_blank_script_blocks(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d,'empty.txt')
            path.write_text('  ')
            with self.assertRaisesRegex(ValueError,'SCRIPT_LENGTH_INVALID'):
                render_private_auditions(path, Path(d,'out'), FakeKokoro())

    def test_no_generic_substitute(self):
        class RecordingFake:
            def __call__(self, text, *, voice, speed):
                self.voice = voice
                yield text, '', np.ones(24000,dtype='float32') * 0.3
        fake = RecordingFake()
        audio_for_text(fake, 'This is the line.', seed=8)
        self.assertEqual(fake.voice,'af_bella')


if __name__ == '__main__':
    unittest.main()
