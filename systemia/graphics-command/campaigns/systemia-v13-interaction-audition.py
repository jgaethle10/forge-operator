#!/usr/bin/env python3
"""Systemia University V13 conversational-performance auditions.
Two complete takes per cue. Whole utterances, no syllable patching, no imitated
human performer, no synthetic approvals. Evercraft Voice Foundry/Kokoro model.
"""
import argparse, hashlib, json, pathlib, re
CUES=(
 ("ready","agent","af_heart", "Your proposal's ready.", "Your proposal's ready.",1.0),
 ("owner-intent","owner","am_michael","Perfect. Leave it for me to approve.","Perfect... leave it for me to approve.",.97),
 ("sent","agent","af_heart","I sent it already.","I sent it already.",.98),
 ("repair","owner","am_michael","Wait. You sent it? I said draft.","Wait... you SENT it? I said draft.",.97),
 ("explanation","agent","af_heart","I had permission to send.","I had permission to send.",.98),
 ("accountability","owner","am_michael","Right. That's on me. Ask before sending anything else.","Right... that's on me. Ask before sending anything else.",.98),
 ("resolution","agent","af_heart","Got it. I'll wait for approval.","Got it. I'll wait for approval.",.98),
)
def words(s): return re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?",s.casefold())
def verify():
 assert len(CUES)==7 and len({c[0] for c in CUES})==7
 for cue,speaker,voice,baseline,directed,speed in CUES:
  assert words(baseline)==words(directed),cue
  assert speaker in ("agent","owner") and voice==("af_heart" if speaker=="agent" else "am_michael")
  assert .94<=speed<=1.02
 assert "sent" in CUES[3][4].lower()
 print("seven interaction-sensitive cues, 14 real model auditions; lexical content constant")
def digest(path):return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
def render(outdir):
 verify()
 import numpy as np
 import soundfile as sf
 from kokoro import KPipeline
 output=pathlib.Path(outdir);output.mkdir(parents=True,exist_ok=False)
 pipeline=KPipeline(lang_code="a")
 receipt={"schema":"evercraft.voice-foundry.systemia-v13.turn-taking-audition.v1",
  "purpose":"private listening comparison for conversational repair",
  "model":"Kokoro-82M via owned Voice Foundry", "modelCheckpointPinned":False,
  "modelAndVoiceCommercialRightsVerified":False, "performancesApprovedByHuman":False,
  "published":False,"publicationAuthority":False,
  "turns":[],"files":[]}
 for cue,speaker,voice,baseline,directed,speed in CUES:
  for version,text,pace in (("baseline",baseline,1.0),("directed",directed,speed)):
   samples=[np.asarray(x,dtype=np.float32) for _,_,x in pipeline(text,voice=voice,speed=pace)]
   if not samples:raise RuntimeError("empty_voice_take:"+cue)
   joined=np.concatenate(samples)
   if not np.isfinite(joined).all():raise RuntimeError("non_finite:"+cue)
   rms=float(np.sqrt(np.mean(joined**2)))
   active=np.flatnonzero(abs(joined)>max(.002,rms*.065))
   if not len(active):raise RuntimeError("silent_take:"+cue)
   signal=joined[max(0,active[0]-2400):min(len(joined),active[-1]+5500)]
   filename=f"{cue}-{version}.wav"
   path=output/filename
   sf.write(path,signal,24000,subtype="PCM_16")
   receipt["files"].append({"cue":cue,"variant":version,"speaker":speaker,"modelVoice":voice,
      "script":text,"speed":pace,"file":filename,"durationSec":round(len(signal)/24000,4),
      "sha256":digest(path),"rms":round(float(np.sqrt(np.mean(signal**2))),5)})
  receipt["turns"].append({"id":cue,"speaker":speaker,"purpose":{
    "ready":"initiation","owner-intent":"instruction","sent":"violation",
    "repair":"other-initiated repair","explanation":"account/response",
    "accountability":"self-attribution and boundary","resolution":"acknowledgment"}[cue]})
 (output/"v13-turntaking-receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
 print(json.dumps({"renders":len(receipt["files"]),"durations":[[a["file"],a["durationSec"]] for a in receipt["files"]]},indent=2))
def main():
 parser=argparse.ArgumentParser();parser.add_argument("--verify-only",action="store_true");parser.add_argument("--out")
 args=parser.parse_args()
 if args.verify_only:verify();return
 if not args.out:raise SystemExit("--out required")
 render(args.out)
if __name__=="__main__":main()
