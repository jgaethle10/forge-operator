#!/usr/bin/env python3
"""Pacific V26: private founder-only native Bella opening auditions.

No customer media is uploaded or processed here. Source text is founder-approved;
only punctuation/prosody hints and voice-generation seeds/speeds vary.
Audio audition only. No claim of final commercial, release, or human approval.
"""
import hashlib, json, os
from pathlib import Path
import numpy as np
import torch
import soundfile as sf

OUT = Path("pacific-v26-opening-private")
VOICE = "af_bella"
SAMPLE_RATE = 24000
# Same spoken words in each. Punctuation is a direction to Kokoro.
AUDITIONS = [
  ("a_conversational_turn", 0.97, 2611,
   "You probably have places to be... but your car has other plans. We've all been there. Thankfully, Pacific can help."),
  ("b_understated_empathy", 0.96, 2612,
   "You probably have places to be, but your car has other plans. We've all been there... Thankfully, Pacific can help."),
  ("c_two_natural_thoughts", 1.00, 2613,
   "You probably have places to be. But your car has other plans. We've all been there. Thankfully, Pacific can help."),
  ("d_warm_transition", 0.98, 2614,
   "You probably have places to be, but your car has other plans! We've all been there. Thankfully, Pacific can help."),
]
CANONICAL = ("You probably have places to be, but your car has other plans. "
             "We've all been there. Thankfully, Pacific can help.")
def normalized_words(s):
    import re
    return re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?",s.lower())

def main():
    from kokoro import KPipeline
    assert all(normalized_words(t) == normalized_words(CANONICAL)
               for _,_,_,t in AUDITIONS), "Spoken words must match approved text"
    OUT.mkdir(parents=True, exist_ok=True)
    pipe=KPipeline(lang_code="a")
    rows=[]
    for name,speed,seed,txt in AUDITIONS:
        torch.manual_seed(seed); np.random.seed(seed)
        segments=[np.asarray(c.audio,dtype=np.float32)
                  for c in pipe(txt, voice=VOICE, speed=speed)]
        if not segments: raise RuntimeError("No native Bella speech for "+name)
        audio=np.concatenate(segments)
        f=OUT/(name+".wav")
        sf.write(f,audio,SAMPLE_RATE,subtype="PCM_16")
        rows.append({"take":name,"file":f.name,"speed":speed,
                     "duration_s":round(len(audio)/SAMPLE_RATE,3),
                     "segments":len(segments),"seed":seed,
                     "text":txt,"sha256":hashlib.sha256(f.read_bytes()).hexdigest()})
        print(json.dumps(rows[-1]),flush=True)
    receipt={"schema":"evercraft.pacific.v26.opening-auditions.v1",
             "voice":"af_bella","model":"Kokoro-82M",
             "kokoroVersion":"0.9.4","purpose":"Founder ear-test, not approved master",
             "spokenWordsMatchCanonical":True,
             "changes":"Only punctuation, generator seed, native speed",
             "externalCustomerContact":False,
             "clientApproved":False,"founderApproved":False,
             "mediaReleaseApproved":False,"takes":rows}
    (OUT/"receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
if __name__=="__main__": main()
