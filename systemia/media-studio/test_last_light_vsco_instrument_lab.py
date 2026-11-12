import importlib.util,io,unittest
from pathlib import Path
import numpy as np
import soundfile as sf
PATH=Path(__file__).with_name("last-light-vsco-instrument-lab.py")
spec=importlib.util.spec_from_file_location("last_light_vsco_instrument_lab",PATH)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class InstrumentBankSafety(unittest.TestCase):
 def setUp(self):
  self.short=np.full((int(5*m.SR),2),.016,dtype=np.float64)
  self.bank={(part,root,layer):self.short for part,s in m.SOURCES.items()
     for root in s["layers"] for layer in ("soft","strong")}
 def test_explicit_two_real_dynamic_layers_and_source_provenance(self):
  self.assertEqual(len(self.bank),12)
  ids=[hash_value for s in m.SOURCES.values() for l in s["layers"].values() for hash_value in l.values()]
  self.assertEqual(len(set(ids)),12)
  self.assertTrue(all(len(x)==40 for x in ids))
  self.assertEqual(m.source_filename("cello","C3","strong"),"susvib_C3_v3_1.wav")
  self.assertEqual(m.source_filename("violin","G4","soft"),"LLVln_ArcoVib_G4_p.wav")
 def test_source_identity_cannot_be_laundered(self):
  good=b"RIFF"+b"\0"*120
  self.assertNotEqual(m.git_blob_sha(good),m.SOURCES["cello"]["layers"]["C3"]["soft"])
  self.assertNotEqual(m.git_blob_sha(good+b"!"),m.git_blob_sha(good))
 def test_nearest_zone_and_missing_range(self):
  clip,root,layer,interval=m.choose(self.bank,"cello","F3",.32)
  self.assertEqual(root,"E3")
  self.assertEqual(layer,"soft")
  self.assertEqual(interval,1)
  clip,root,layer,interval=m.choose(self.bank,"violin","B4",.7)
  self.assertEqual(root,"C5")
  self.assertEqual(layer,"strong")
  self.assertEqual(interval,-1)
  with self.assertRaisesRegex(ValueError,"coverage_missing"):m.choose(self.bank,"cello","E6",.3)
 def test_real_source_duration_and_note_release(self):
  result,g=m.rendered_note(self.short,"cello",1.6,.44,0)
  self.assertEqual(result.shape[1],2)
  self.assertTrue(np.isfinite(result).all())
  self.assertAlmostEqual(float(result[-1,0]),0,places=7)
  self.assertGreater(float(np.max(abs(result))),0)
  with self.assertRaisesRegex(ValueError,"source_too_short"):m.rendered_note(self.short[:m.SR],"cello",2.5,.4,0)
 def test_original_piano_held_exact_in_open_and_close(self):
  p=np.zeros((int(35*m.SR),2),dtype=np.float32)
  p+=.012
  part={"cello":np.zeros_like(p),"violin":np.zeros_like(p)}
  part["cello"][int(9*m.SR):int(28*m.SR)]=.001
  variants=m.mix(p,part)
  self.assertEqual(set(variants),{"cello_focus","duet"})
  for clip,strength in variants.values():
   self.assertTrue(np.array_equal(p[:int(7.5*m.SR)],clip[:int(7.5*m.SR)]))
   self.assertTrue(np.array_equal(p[int(32*m.SR):],clip[int(32*m.SR):]))
   self.assertLessEqual(float(np.max(abs(clip))),.94)
 def test_actual_piano_voice_leading_and_key_not_unexamined(self):
  """A conservative check for the agreed 35s piano reference, not a taste verdict."""
  import importlib.util
  piano_path=Path(__file__).with_name("recorded-steinway-phrasing-v2.py")
  spec=importlib.util.spec_from_file_location("the_last_light_original_piano_score",piano_path)
  piano=importlib.util.module_from_spec(spec)
  spec.loader.exec_module(piano)
  self.assertEqual(len(piano.EVENTS),31)
  # Original bridge score held F3 against B4 as a tritone, and its
  # violin held B4 against the piano A4 as an unresolved major second.
  abandoned={"cello":[(13.55,"F3",1.8)],"violin":[(14.30,"B4",1.55)]}
  risky={1,2,6,10,11}
  def overlaps(strings):
   problems=[]
   for part,events in strings.items():
    for event in events:
     when,note,duration=event[:3]
     for ts,pitch,layer,touch,held,*_ in piano.EVENTS:
      duration_of_overlap=min(when+duration,ts+held)-max(when,ts)
      if duration_of_overlap>.35 and abs(m.midi(note)-m.midi(pitch))%12 in risky:
       problems.append((part,when,note,pitch,round(duration_of_overlap,2)))
   return problems
  self.assertTrue(overlaps(abandoned))
  self.assertEqual(overlaps(m.SCORE),[])
  # Only E minor/C major/G major diatonic pitch classes, not F natural.
  allowed={0,2,4,6,7,9,11}
  self.assertTrue(all(m.midi(note)%12 in allowed for part in m.SCORE
                     for _,note,_,_ in m.SCORE[part]))
  self.assertTrue(all(note in m.SOURCES[part]["layers"] for part in m.SCORE
                     for _,note,_,_ in m.SCORE[part]))
  self.assertTrue(all(t>=9.2 and t+held<28.1 for part in m.SCORE
                     for t,note,held,touch in m.SCORE[part]))
 def test_piano_leading_role_not_string_doubling_every_attack(self):
  # Sparse: the original 31 piano note-events remain foreground
  self.assertEqual(sum(map(len,m.SCORE.values())),12)
  self.assertLess(len(m.SCORE["violin"]),len(m.SCORE["cello"]))
  self.assertNotEqual([x[1] for x in m.SCORE["cello"]],
                      [x[1] for x in m.SCORE["violin"]])
 def test_voice_output_independence(self):
  stems,receipts=m.voices(self.bank)
  self.assertEqual(set(stems),{"cello","violin"})
  self.assertEqual(len(receipts),12)
  self.assertTrue(all(-2<=r["semitones"]<=2 for r in receipts))
  self.assertTrue(all(np.isfinite(x).all() for x in stems.values()))
if __name__=="__main__":unittest.main()
