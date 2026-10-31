#!/usr/bin/env python3
"""V32: repair opening omitted word, preserve V31 service and closing.
All performances are complete native Bella-Heart A speech, no voice slicing.
"""
import hashlib,json,pathlib
import numpy as np, torch,soundfile as sf
from kokoro import KPipeline
from faster_whisper import WhisperModel
R=pathlib.Path("v32-opening-word-integrity");R.mkdir(exist_ok=True)
M="[Mobile](/mˈoʊbəl/)"
S=[
 ("a_original_new_seed",f"If your day is full, the last thing you need is another stop at the shop. That's why On The Go {M} Quick Lube comes to [you](+2)!",1.04,32101),
 ("b_original_warm",f"If your day is full, the last thing you need is another stop at the shop. That's why On The Go {M} Quick Lube comes to YOU!",1.025,32201),
 ("c_relaxed_complete",f"If your day is full, the last thing you need is another stop at the shop. That's why On The Go {M} Quick Lube comes to [you](/jˈu/)!",1.045,32301),
 ("d_concise_clear",f"If your day is full, you don't need another stop at the shop. That's why On The Go {M} Quick Lube comes to [you](+2)!",0.97,32401),
]
pipe=KPipeline(lang_code="a");bella=pipe.load_voice("af_bella");heart=pipe.load_voice("af_heart");voice=.78*bella+.22*heart
proof=[]
for name,txt,speed,seed in S:
 torch.manual_seed(seed);np.random.seed(seed)
 pieces=list(pipe(txt,voice=voice,speed=speed))
 if not pieces:raise RuntimeError("EMPTY_VOICE "+name)
 data=np.concatenate([np.asarray(p.audio,dtype=np.float32) for p in pieces])
 phonemes=" ".join(str(p.phonemes) for p in pieces)
 assert "mˈoʊbəl" in phonemes and "jˈu" in phonemes,(name,phonemes)
 seconds=len(data)/24000
 if seconds>8.5:raise RuntimeError(f"TAKE_TOO_LONG_TO_FIT {name} {seconds}")
 if not np.isfinite(data).all() or np.max(np.abs(data))>1:raise RuntimeError("INVALID_AUDIO "+name)
 p=R/(name+".wav");sf.write(p,data,24000,subtype="PCM_16")
 proof.append({"id":name,"text":txt,"duration_seconds":round(seconds,3),"phonemes":phonemes,"filename":p.name,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()})
# Run independent speech-to-text over actual generated sound to check for omitted words.
try:
 w=WhisperModel("base.en",device="cpu",compute_type="int8")
 for item in proof:
  segments,_=w.transcribe(str(R/item["filename"]),language="en",beam_size=5,word_timestamps=True,condition_on_previous_text=False,initial_prompt="On The Go Mobile Quick Lube comes to you.")
  segments=list(segments)
  transcript=" ".join(s.text.strip() for s in segments)
  words=[{"word":z.word.strip(),"start":round(z.start,3),"end":round(z.end,3)} for s in segments for z in (s.words or [])]
  item["asr_transcript"]=transcript;item["asr_words"]=words
  print(item["id"],"ASR:",transcript,flush=True)
except Exception as e:
 print("ASR_UNAVAILABLE: "+repr(e),flush=True)
proof_root={"schema":"evercraft.otg.V32.opening-integrity",
 "voice":"78% Bella / 22% Heart native one-track, Kokoro 0.9.4", "purpose":"replace only early opening missing spoken word; no pitch shift",
 "independent_asr":"faster-whisper base.en with word timestamps",
 "owner_approved":False,"client_approved":False,"published":False,"takes":proof}
(R/"proof.json").write_text(json.dumps(proof_root,indent=2)+"\n")
print(json.dumps(proof_root,indent=2),flush=True)
