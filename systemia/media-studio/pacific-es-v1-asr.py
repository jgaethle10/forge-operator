#!/usr/bin/env python3
"""Independent Spanish ASR audit on native TTS. No founder/customer media."""
from pathlib import Path
import json
import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

root=Path("pacific-es-native-voice-private")
out=Path("pacific-es-asr-audit");out.mkdir(exist_ok=True)
plan=[("opening",0.30),("other_plans",3.55),("relate",7.26),
("pacific_intro",9.42),("crew",12.1),("capabilities",15.8),
("visit_mobile",19.83),("closing",26.52)]
sr=24000
x=np.zeros(30*sr,dtype=np.float32)
for key,t in plan:
  audio,s=sf.read(root/f"conversational_{key}.wav")
  assert s==sr
  start=round(t*sr)
  x[start:start+len(audio)]+=audio
p=out/"spanish_voice_only.wav"
sf.write(p,x,sr)
model=WhisperModel("base",device="cpu",compute_type="int8")
segments,_=model.transcribe(str(p),language="es",beam_size=5,word_timestamps=False,
                            vad_filter=False,condition_on_previous_text=False)
rows=[{"start":round(s.start,2),"end":round(s.end,2),"text":s.text.strip()} for s in segments]
text=" ".join(z["text"] for z in rows).lower()
report={"language":"es","asr_model":"faster-whisper base multilingual","transcript":text,
        "segments":rows,"expected_intro":"Por suerte, Pacific puede ayudarte.",
        "expected_closing":"Pacific Service Center. Para que Yakima siga en marcha.",
        "pacific_name_candidate":any(q in text for q in ["pacific","pacífic","pacífico","pacifik"]),
        "service_center_candidate":"service center" in text or "servis center" in text or "service" in text,
        "script_source":"Native standalone ef_dora Spanish phrases, no customer media"}
(out/"transcript_report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(report,ensure_ascii=False,indent=2))
