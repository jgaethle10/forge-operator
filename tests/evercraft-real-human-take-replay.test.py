import importlib.util, json, math, tempfile, unittest
from pathlib import Path
import numpy as np
import soundfile as sf
SOURCE=Path(__file__).resolve().parents[1]/'public/evercraft-performance-capture/render_human_take.py'
spec=importlib.util.spec_from_file_location('real_take_replay',SOURCE)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def take():
 return {'schema':'evercraft.performance.take.v1','duration_ms':800,'source_types':['midi:test|device'],
 'midi_events':[
  {'ms':10,'kind':'note_on','note':60,'value':88,'channel':0,'source':'midi:test|device'},
  {'ms':100,'kind':'pedal','note':64,'value':127,'channel':0,'source':'midi:test|device'},
  {'ms':200,'kind':'note_off','note':60,'value':0,'channel':0,'source':'midi:test|device'},
  {'ms':320,'kind':'note_on','note':62,'value':67,'channel':1,'source':'midi:test|device'},
  {'ms':500,'kind':'pedal','note':64,'value':0,'channel':0,'source':'midi:test|device'},
  {'ms':750,'kind':'note_off','note':62,'value':0,'channel':1,'source':'midi:test|device'}
 ]}
class Replay(unittest.TestCase):
 def test_sustain_and_polyphony_preserve_real_time(self):
  notes=m.pair_events(take())
  self.assertEqual(len(notes),2)
  self.assertEqual((notes[0]['start_ms'],notes[0]['end_ms']),(10,500))
  self.assertEqual((notes[1]['start_ms'],notes[1]['end_ms']),(320,750))
 def test_bad_user_input_rejected(self):
  for mutation in (
   {'schema':'wrong'},
   {'duration_ms':99000},
   {'midi_events':[{'ms':math.nan,'kind':'note_on','note':60,'value':70}]},
  ):
   t=take();t.update(mutation)
   with self.assertRaises(ValueError):m.pair_events(t)
 def test_actual_wav_render_with_mocked_test_samples_no_network(self):
  with tempfile.TemporaryDirectory() as tmp:
   d=Path(tmp);cache=d/'out/recorded_source_cache';cache.mkdir(parents=True)
   for n,v,hz in ((60,88,261.63),(62,67,293.66)):
    filename=m.sample_name(n,v);rate=m.FS
    t=np.arange(rate,dtype=np.float32)/rate
    wave=.25*np.sin(2*np.pi*hz*t)*np.exp(-3*t)
    sf.write(cache/filename,wave,rate,format='OGG',subtype='VORBIS')
   take_file=d/'take.json';take_file.write_text(json.dumps(take()))
   wav=m.render(take_file,d/'out')
   audio,rate=sf.read(wav)
   self.assertEqual(rate,m.FS)
   self.assertGreater(len(audio),2*m.FS)
   proof=json.loads((d/'out/replay_proof.json').read_text())
   self.assertEqual(proof['played_note_count'],2)
   self.assertFalse(proof['human_music_approved'])
   self.assertFalse(proof['production_release_authority'])
if __name__=='__main__':unittest.main()
