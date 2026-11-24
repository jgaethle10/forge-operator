#!/usr/bin/env python3
"""Customer-private audition controls, public promotional copy only.
No actor/celebrity reference audio, no customer media or private correspondence.
"""
import subprocess,hashlib,json,os,pathlib,wave
ROOT=pathlib.Path("exotic-storyteller-refinement")
ROOT.mkdir(exist_ok=False)
MODEL="/tmp/voice-model/qwen3-tts-12hz-1.7b-voicedesign-q8_0.gguf"
CODEC="/tmp/voice-model/qwen3-tts-tokenizer-12hz.gguf"
TEXT=("Ricky grows his own exotic peppers. He smokes them, grinds them, "
      "and brings that fire to his famous guacamole. Exotic Chiles.")
OPTIONS=[
 ("a2_grounded","An original Mexican man in his late sixties, speaking English with a natural Mexican Spanish-influenced accent. A grounded resonant low chest baritone, textured by age with a little dry rasp, quietly confident and intimate. Warm, thoughtful and human, like telling a true story in conversation. Gentle irregular pauses, understated smile, absolutely no movie trailer announcer tone, no celebrity resemblance."),
 ("a3_bilingual","Original bilingual Mexican man around seventy, speaking clear English with subtly audible Mexican Spanish-first pronunciation, rich smoky baritone, gentle weathered edges, conversational rhythm. Patient dry humor, kindly authority, natural imperfections and breath. Close microphone, restrained speaking volume, a practiced storyteller rather than announcer. No caricature, no celebrity resemblance."),
 ("a4_weathered","An original older Mexican gentleman in his seventies. Deep, lived-in male voice with low relaxed resonance, slight gravel on sustained vowels, natural Spanish-influenced English accent. Calm reflective delivery with human timing and subtle pauses, neither theatrical nor booming. Sincere and warm; maintain clear intelligibility. No impersonation, no famous actor reference.")
]
records=[]
for key,instruction in OPTIONS:
 output=ROOT/(key+".wav")
 cmd=["/tmp/crispasr_voice","--backend","qwen3-tts-1.7b-voicedesign","-m",MODEL,
      "--codec-model",CODEC,"--instruct",instruction,"--tts",TEXT,"--tts-output",str(output)]
 subprocess.run(cmd,check=True,timeout=800)
 with wave.open(str(output),"rb") as w:
  duration=w.getnframes()/w.getframerate()
  sample_rate=w.getframerate()
 if not 5<=duration<=30:raise RuntimeError("Invalid duration "+key+":"+str(duration))
 if sample_rate<16000:raise RuntimeError("Low sample rate")
 b=output.read_bytes()
 records.append({"name":key,"description":instruction,"script":TEXT,"durationSec":round(duration,3),
                 "sampleRate":sample_rate,"sha256":hashlib.sha256(b).hexdigest(),"file":output.name})
(ROOT/"receipt.json").write_text(json.dumps({"schema":"evercraft.fallen.exotic-original-storyteller-refinement.v1",
 "source":"Qwen3-TTS VoiceDesign 1.7B Q8_0; no reference cloning",
 "sameScript":True,"accentIndependentlyVerified":False,
 "humanApproved":False,"customerDeliveryAuthorized":False,"takes":records},indent=2))
print("PASSED:",len(records),"original voice refinements generated, source WAV hashes included")
