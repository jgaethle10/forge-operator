import importlib.util
import pathlib
import unittest
SCRIPT=pathlib.Path(__file__).resolve().parents[1]/'systemia/clip/evercraft-real-piano-audition.py'
spec=importlib.util.spec_from_file_location('real_piano',SCRIPT)
piano=importlib.util.module_from_spec(spec)
spec.loader.exec_module(piano)
class OriginalRecordedPianoScoreTests(unittest.TestCase):
    def test_pinned_cc0_source(self):
        self.assertEqual(piano.SOURCE_SHA,'251c0be57d5d1b3242b91f53e0cde62ab1cb42d9')
        self.assertIn('Meta-open-sound',piano.ROOT)
    def test_notes_are_in_real_instrument_range(self):
        for t,m,v,d in piano.SCORE:
            self.assertGreaterEqual(m,21);self.assertLessEqual(m,108)
            self.assertGreater(v,0);self.assertLess(v,127)
            self.assertGreater(d,0)
        self.assertTrue(all(a[0]<b[0] for a,b in zip(piano.SCORE,piano.SCORE[1:])))
    def test_multiple_velocity_layers_instead_of_single_soundfont(self):
        self.assertTrue(piano.layer(43)<piano.layer(51)<piano.layer(61)<piano.layer(72))
        self.assertGreater(len({piano.layer(row[2]) for row in piano.SCORE}),2)
    def test_no_fake_quality_gate(self):
        src=SCRIPT.read_text().lower()
        self.assertIn('human_listening_approved',src)
        self.assertIn('production_release_authority',src)
        for invalid in ('timgm','loudnorm','alimiter','sine oscillator'):
            self.assertNotIn(invalid,src)
if __name__=='__main__':unittest.main()
