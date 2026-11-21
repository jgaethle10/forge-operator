import importlib.util
import tempfile
import unittest
from pathlib import Path
import numpy as np
import soundfile as sf

source=Path(__file__).with_name("voice-word-emphasis.py")
spec=importlib.util.spec_from_file_location("word_emphasis",source)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class WordEmphasisTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.sr=24000
        self.src=Path(self.tmp.name)/"voice-original.wav"
        self.out=Path(self.tmp.name)/"voice-directed.wav"
        t=np.arange(self.sr*2)/self.sr
        sf.write(self.src,.08*np.sin(2*np.pi*167*t),self.sr,subtype="PCM_24")
    def tearDown(self):
        self.tmp.cleanup()
    def test_local_extension_and_safe_hold(self):
        receipt=mod.lengthen_word(self.src,self.out,word_start=.8,word_end=1.02,factor=1.46,boost_db=1)
        a,_=sf.read(self.src)
        b,_=sf.read(self.out)
        self.assertGreater(receipt["extensionMs"],60)
        self.assertLess(receipt["extensionMs"],120)
        self.assertTrue(np.allclose(a[:round(.8*self.sr)],b[:round(.8*self.sr)],atol=1e-6))
        self.assertFalse(receipt["publicationAuthorized"])
        self.assertFalse(receipt["commercialRightsVerified"])
        self.assertFalse(receipt["newVoiceGenerated"])
    def test_rejects_unsafe_edits(self):
        with self.assertRaisesRegex(ValueError,"never_overwrite_source"):
            mod.lengthen_word(self.src,self.src,word_start=.8,word_end=1)
        with self.assertRaisesRegex(ValueError,"stretch_factor_out_of_bounds"):
            mod.lengthen_word(self.src,self.out,word_start=.8,word_end=1,factor=2.3)
        with self.assertRaisesRegex(ValueError,"boost_db_out_of_bounds"):
            mod.lengthen_word(self.src,self.out,word_start=.8,word_end=1,boost_db=8)
        with self.assertRaisesRegex(ValueError,"reviewed_word_bounds_required"):
            mod.lengthen_word(self.src,self.out,word_start=.9,word_end=.92)
if __name__=="__main__":
    unittest.main()
