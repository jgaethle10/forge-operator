#!/usr/bin/env python3
"""Evercraft V15 scene-context -> prosody audition.

This is a *director* that derives a performance brief and modest text/tempo
variants from an explicit conversational state machine. Kokoro is a pretrained
single-utterance TTS model: it does NOT receive the actual prior audio/context,
does NOT dynamically feel emotions, and does NOT perform emotional style transfer.
All model outputs are private, unapproved audition candidates.
"""
import argparse, hashlib, json, pathlib, re
from collections import Counter

ALLOWED_EVENTS=("draft_ready","owner_requests_review","agent_discloses_send",
"owner_challenges_send","agent_explains_permissions","owner_accepts_and_corrects",
"approval_setting_confirmed")
ALLOWED_MODEL_VOICES={"agent":"af_heart","owner":"am_michael"}
WORD=lambda x:re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?",x.casefold())
SHA=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()

def validate(p):
  if p.get("schema")!="evercraft.voice-foundry.contextual-performance-audition.v1":raise ValueError("schema")
  turns=p.get("turns")
  if not isinstance(turns,list) or len(turns)!=7:raise ValueError("seven_turns_required")
  if tuple(x["event"] for x in turns)!=ALLOWED_EVENTS:raise ValueError("event_sequence_missing")
  if not all(v is False for v in p["boundaries"].values() if isinstance(v,bool)):raise ValueError("commercial_rights_gate")
  prior_state="initial"
  prev_end=-1.
  for index,t in enumerate(turns):
    if t["before"]!=prior_state or not t["after"] or t["after"]==t["before"]:raise ValueError("context_state_transition_missing")
    if not t["appraisal"] or not t["goal"] or not t["emotion"]:raise ValueError("performance_intention_missing")
    if t["voice"]!=ALLOWED_MODEL_VOICES.get(t["speaker"]):raise ValueError("voice_role_mismatch")
    if WORD(t["text"])!=WORD(t["directedText"]):raise ValueError("performance_must_not_rewrite_words")
    if not .92<=t["directedSpeed"]<=1.05:raise ValueError("tempo_bound_exceeded")
    if t["sceneStart"]<prev_end+.10 or t["sceneEnd"]>p["durationSec"] or t["sceneEnd"]<=t["sceneStart"]:raise ValueError("scene_timing_collision")
    if not 0<=t["intensity"]<=1:raise ValueError("affect_intensity_invalid")
    prior_state=t["after"];prev_end=t["sceneEnd"]
  if turns[3]["emotion"]==turns[0]["emotion"] or turns[5]["emotion"]==turns[3]["emotion"]:raise ValueError("flat_emotional_arc")
  if turns[3]["before"]!="expectation_violation" or turns[5]["before"]!="authority_disclosed":raise ValueError("emotion_unlinked_to_trigger")
  ack=turns[-1];action=ack.get("requiresOnScreenAction")
  if not action or action["id"]!="approval-required-on" or ack["sceneStart"]<action["occurredAt"]+.15:raise ValueError("premature_agent_acknowledgment")
  return p

def render(plan,output):
  validate(plan)
  import numpy as np
  import soundfile as sf
  from kokoro import KPipeline
  folder=pathlib.Path(output);folder.mkdir(parents=True,exist_ok=False)
  pipeline=KPipeline(lang_code="a")
  result={"schema":"evercraft.voice-foundry.contextual-performance-audition-receipt.v1",
    "sourcePlanDigest":hashlib.sha256(json.dumps(plan,sort_keys=True).encode()).hexdigest(),
    "voiceModel":"Kokoro-82M via Evercraft Voice Foundry","checkpointPinned":False,
    "contextEnteredVoiceModel":False,"emotionConditioningInModel":False,
    "voiceCommercialRightsVerified":False,"performedByHumanActor":False,
    "humanListeningReviewCompleted":False,"publicationAuthorized":False,
    "variants":["baseline","context_directed"],"files":[]}
  for t in plan["turns"]:
    for version in ("baseline","context_directed"):
      text=t["text"] if version=="baseline" else t["directedText"]
      speed=t["baselineSpeed"] if version=="baseline" else t["directedSpeed"]
      segments=[np.asarray(s,dtype=np.float32) for _,_,s in pipeline(text,voice=t["voice"],speed=speed)]
      if not segments:raise RuntimeError("no_neural_audio:"+t["id"])
      wave=np.concatenate(segments)
      if not np.isfinite(wave).all():raise RuntimeError("invalid_neural_audio:"+t["id"])
      threshold=max(.0025,float(np.sqrt(np.mean(wave**2)))*.065)
      active=np.flatnonzero(np.abs(wave)>threshold)
      if not len(active):raise RuntimeError("silent_neural_audio:"+t["id"])
      signal=wave[max(0,active[0]-2400):min(len(wave),active[-1]+5400)]
      path=folder/(t["id"]+"-"+version+".wav")
      sf.write(path,signal,24000,subtype="PCM_16")
      duration=len(signal)/24000
      rms=float(np.sqrt(np.mean(signal*signal)))
      result["files"].append({"turnId":t["id"],"variant":version,"speaker":t["speaker"],
          "voiceModelId":t["voice"],"cause":t["event"],"beliefBefore":t["before"],
          "beliefAfter":t["after"],"actorIntent":t["goal"],"emotionLabelForReviewOnly":t["emotion"],
          "text":text,"speed":speed,"startSec":t["sceneStart"],"windowEndSec":t["sceneEnd"],
          "durationSec":round(duration,4),"fitsShotWithoutSpeedEdit":duration<=t["sceneEnd"]-t["sceneStart"]+.05,
          "rms":round(rms,6),"sha256":SHA(path),"file":path.name})
  (folder/"context-performance-audition-receipt.json").write_text(json.dumps(result,indent=2)+"\n")
  print(json.dumps({"count":len(result["files"]),"shortfall":[[x["turnId"],x["variant"],x["durationSec"],round(x["windowEndSec"]-x["startSec"],3)] for x in result["files"] if not x["fitsShotWithoutSpeedEdit"]]},indent=2))
def main():
  p=argparse.ArgumentParser();p.add_argument("plan");p.add_argument("--verify-only",action="store_true");p.add_argument("--out");a=p.parse_args()
  plan=json.loads(pathlib.Path(a.plan).read_text())
  validate(plan)
  if a.verify_only: print("Verified: contextual state changes, cause, intent, lexicon, approval timing and rights hold");return
  if not a.out:raise ValueError("--out required")
  render(plan,a.out)
if __name__=="__main__":main()
