#!/usr/bin/env python3
"""V33 private Bella-native final-polish audition.
Word boundaries and intended phonemes recorded for service BRAKE focus.
All performances full utterances; no single-word sound replacement.
"""
import pathlib,json,hashlib
import numpy as np, torch, soundfile as sf
from kokoro import KPipeline
root=pathlib.Path("v33-bella-final-touch");root.mkdir(exist_ok=True)
M="[Mobile](/mˈoʊbəl/)"
takes=[
 ("service_A_focus", "From oil changes and filters to [BRAKE](+2) [service](/sɜɹvəs/)!",1.04,33001),
 ("service_B_focus", "From oil changes and filters, to [brake](/bɹˈAk/) [service](/sɜɹvəs/).",1.01,33002),
 ("service_C_bright", "From oil changes and filters... to [BRAKE](+2) [service](/sɜɹvəs/)!",1.04,33003),
 ("service_D_lively", "From oil changes and filters to [brake](/bɹˈAk/) [service](/sɜɹvəs/)!",1.075,33004),
 ("service_E_emph", "From oil changes and filters to [BRAKE](+2) [service](/sɜɹvəs/).",1.07,33005),
 ("closing_A_upbeat", f"On The Go {M} Quick Lube! Let us come to [you](+2)!",1.04,33101),
 ("closing_B_smile", f"On The Go {M} Quick Lube. Let us come to YOU!",1.05,33102),
]
p=KPipeline(lang_code="a"); b=p.load_voice("af_bella"); h=p.load_voice("af_heart")
# Feel brighter without making pitch artificially high.
v=.69*b+.31*h
result=[]
for name,phrase,speed,seed in takes:
 torch.manual_seed(seed);np.random.seed(seed)
 chunks=list(p(phrase,voice=v,speed=speed))
 if not chunks:raise RuntimeError("EMPTY "+name)
 data=np.concatenate([np.asarray(x.audio,dtype=np.float32) for x in chunks])
 phones=" ".join(str(x.phonemes) for x in chunks)
 if name.startswith("service"):
  if "bɹˈAk" not in phones:raise RuntimeError("BRAKE_STRESS_MISSING "+name+" "+phones)
  if "sɜɹvəs" not in phones:raise RuntimeError("SERVICE_NOT_UNSTRESSED "+name+" "+phones)
 else:
  if "mˈoʊbəl" not in phones:raise RuntimeError("US_MOBILE_MISSING "+name)
 duration=len(data)/24000
 if duration>5.0:raise RuntimeError("TAKE_TOO_LONG "+name+" "+str(duration))
 if not np.isfinite(data).all() or np.max(np.abs(data))>1.0001:raise RuntimeError("INVALID_WAVE "+name)
 filename=root/(name+".wav");sf.write(filename,data,24000,subtype="PCM_16")
 result.append({"id":name,"script":phrase,"speed":speed,"duration":round(duration,3),"phonemes":phones,"file":filename.name,"sha256":hashlib.sha256(filename.read_bytes()).hexdigest()})
# Independent automatic transcriptions are diagnostic, not substitutes for human listening.
try:
 from faster_whisper import WhisperModel
 model=WhisperModel("base.en",device="cpu",compute_type="int8")
 for t in result:
  segments,_=model.transcribe(str(root/t["file"]),language="en",beam_size=3,word_timestamps=True,condition_on_previous_text=False,initial_prompt="Oil changes and filters to brake service. On The Go Mobile Quick Lube.")
  segments=list(segments)
  t["asr"]=" ".join(s.text.strip() for s in segments)
  t["asr_words"]=[{"word":w.word.strip(),"start":round(w.start,3),"end":round(w.end,3)} for s in segments for w in (s.words or [])]
  print(t["id"],"ASR:",t["asr"],flush=True)
except Exception as exc:
 print("ASR_FAILED "+repr(exc),flush=True)
 (root/"asr_warning.txt").write_text(repr(exc))
manifest={"schema":"evercraft.onthego.v33.bella.bright-brake",
 "user_feedback":"More natural, brighter, emphasize BRAKE rather than service",
 "voice":"af_bella .69 + af_heart .31, no pitch/time shifting",
 "client_approved":False,"human_listening_pass":False,"delivered":False,"takes":result}
(root/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
print(json.dumps(result,indent=2),flush=True)
