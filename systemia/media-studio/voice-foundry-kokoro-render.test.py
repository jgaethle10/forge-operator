"""Offline contract tests. Synthetic waveforms are NOT approved male voices."""
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import sys
import unittest
from unittest.mock import patch

MODULE = Path(__file__).with_name('voice-foundry-kokoro-render.py')
spec = importlib.util.spec_from_file_location('audition_render', MODULE)
audition = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audition)

class FakeKPipeline:
    def __init__(self, lang_code):
        self.lang_code = lang_code
    def __call__(self, text, voice, speed):
        import numpy as np
        freq = 100 + sum(map(ord, text + voice)) % 400
        t = np.arange(48000, dtype=np.float32) / 24000
        yield None, None, (np.sin(t * freq * 2 * np.pi) * .2).astype(np.float32)

def make_plan(root):
    plan = root / 'plan.json'
    plan.write_text(json.dumps({
        'schema':'evercraft.fallen.voice-audition-plan.v1',
        'planDigest':'synthetic-test-digest',
        'profile':{'id':audition.PROFILE_ID},
        'reads':[{'id':x,'text':f'Test fixture for {x}.'} for x in ['curiosity','trust','wonder']],
    }))
    return plan

class AuditionRenderTests(unittest.TestCase):
    def test_missing_model_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            with patch.dict(sys.modules,{'kokoro': None}):
                with self.assertRaisesRegex(RuntimeError,'Local numpy, soundfile, and kokoro'):
                    audition.render(make_plan(root),root/'output',['am_michael','am_fenrir'],1)

    def test_mock_audio_creates_hashed_unapproved_receipts(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            with patch.dict(sys.modules,{'kokoro':types.SimpleNamespace(KPipeline=FakeKPipeline)}):
                review_path=audition.render(make_plan(root),root/'output',['am_michael','am_fenrir','bm_fable'],1)
            review=json.loads(review_path.read_text())
            self.assertEqual(len(review['candidates']),3)
            self.assertEqual(sum(len(c['samples']) for c in review['candidates']),9)
            for candidate in review['candidates']:
                self.assertFalse(candidate['rights']['commercialUseVerified'])
                self.assertFalse(candidate['identity']['consentedToVoiceUse'])
                self.assertEqual(candidate['ratings'],[])
                for sample in candidate['samples']:
                    file_path=Path(sample['filePath'])
                    self.assertTrue(file_path.is_file())
                    self.assertEqual(audition.sha256(file_path),sample['sha256'])
            with self.assertRaisesRegex(FileExistsError,'must be empty'):
                audition.render(make_plan(root),root/'output',['am_michael','am_fenrir'],1)

    def test_unknown_voice_invalid_plan_or_speed_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            invalid=root/'invalid.json';invalid.write_text('{}')
            with self.assertRaisesRegex(ValueError,'Invalid or mismatched'):
                audition.render(invalid,root/'out',['am_michael','am_fenrir'],1)
            plan=make_plan(root)
            with self.assertRaisesRegex(ValueError,'Choose at least two'):
                audition.render(plan,root/'out',['af_bella','am_michael'],1)
            with self.assertRaisesRegex(ValueError,'Speed'):
                audition.render(plan,root/'out',['am_michael','am_fenrir'],0.5)

if __name__=='__main__':
    unittest.main()
