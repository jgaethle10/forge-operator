#!/usr/bin/env python3
"""Private single-script Chatterbox expressiveness evaluation. No reference audio or cloning."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import wave

SCRIPT="This is Evercraft, and this is only the beginning."
CONDITIONS=(("neutral",0.5,0.5),("expressive",0.7,0.3))
SEED=1701
SOURCE="https://github.com/resemble-ai/chatterbox"
MODEL_CARD="https://huggingface.co/ResembleAI/chatterbox"

def validate():
    assert SCRIPT=="This is Evercraft, and this is only the beginning."
    assert len(CONDITIONS)==2 and {x[0] for x in CONDITIONS}=={"neutral","expressive"}
    assert SEED==1701
    for _,emotion,guidance in CONDITIONS:
        assert 0.2<=emotion<=0.9 and 0.1<=guidance<=0.7
    print("Chatterbox CPU expressiveness preflight: two controlled runs, no voice-cloning/reference audio")

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def render(output):
    validate()
    import numpy as np
    import soundfile as sf
    import torch
    from chatterbox.tts import ChatterboxTTS
    torch.set_num_threads(2)
    path=pathlib.Path(output)
    path.mkdir(parents=True,exist_ok=False)
    model=ChatterboxTTS.from_pretrained(device="cpu")
    rate=model.sr
    if not 16000<=rate<=48000:
        raise RuntimeError("Unexpected neural sample rate")
    manifest={
      "schema":"evercraft.voice-foundry.chatterbox-expressive-comparison.v1",
      "status":"private_real_neural_eval_not_human_approved",
      "source":SOURCE,"modelCard":MODEL_CARD,
      "modelLicense":"MIT repository claim, underlying data and speaker rights still require independent review",
      "voiceMode":"Chatterbox default voice without user-supplied audio prompt",
      "referenceAudioProvided":False,"cloningAuthorizedOrAttempted":False,
      "compareAgainst":"Original Kokoro V05 from https://github.com/jgaethle10/forge-operator/actions/runs/39464600851",
      "script":SCRIPT,"seed":SEED,
      "modelWeightsDigestVerified":False,"humanNaturalnessImprovementConfirmed":False,
      "publisherAndVoiceRightsVerified":False,"publicReleaseAuthorized":False,
      "takes":[]
    }
    for label,exaggeration,cfg in CONDITIONS:
        torch.manual_seed(SEED)
        np.random.seed(SEED)
        # No audio_prompt_path. Test the vendor's default pretrained voice only.
        with torch.inference_mode():
            generated=model.generate(SCRIPT,exaggeration=exaggeration,cfg_weight=cfg)
        samples=generated.detach().cpu().float().numpy().reshape(-1)
        if not np.isfinite(samples).all() or not 1.5 < len(samples)/rate < 25:
            raise RuntimeError("Invalid acoustic output in "+label)
        if float(np.sqrt(np.mean(samples*samples)))<.003:
            raise RuntimeError("Silent output "+label)
        wav=path/(label+".wav")
        mp3=path/(label+".mp3")
        sf.write(wav,samples,rate,subtype="PCM_16")
        with wave.open(str(wav),"rb") as f:
            assert f.getnchannels()==1 and f.getsampwidth()==2 and f.getnframes()>0
        subprocess.run(["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-y","-i",str(wav),
          "-af","loudnorm=I=-16:TP=-1.5:LRA=11","-codec:a","libmp3lame","-q:a","3",str(mp3)],
          check=True,timeout=100)
        manifest["takes"].append({
          "id":label,"exaggeration":exaggeration,"cfgWeight":cfg,
          "wavSha256":digest(wav),"mp3Sha256":digest(mp3),
          "durationSec":round(len(samples)/rate,3),"sampleRate":rate
        })
    (path/"evidence.json").write_text(json.dumps(manifest,indent=2)+"\n")
    (path/"LISTEN_HERE.html").write_text(
      '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chatterbox Expressiveness Trial</title><style>body{max-width:700px;margin:28px auto;padding:12px;background:#121a29;color:#fff;font:17px/1.5 system-ui}audio{width:100%}section{border:1px solid #60708c;padding:20px;border-radius:12px;margin:20px 0}</style><h1>Evercraft | Cross-model expressive trial</h1><p>Private sound audition. The exact words are identical. Compare human emotion, consonants, pace and believable endings. The voices are not necessarily the same as V05. Human quality, voice rights and publication remain unapproved.</p>'+
      "".join('<section><h2>Take '+str(i+1)+'</h2><audio controls src="'+name+'.mp3"></audio></section>' for i,(name,_,_) in enumerate(CONDITIONS))+
      '<p>Settings and hashes in evidence.json. No voice reference or cloning used.</p></html>')
    print(json.dumps({"realNeuralTakes":len(manifest["takes"]),"status":manifest["status"]}))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("out",nargs="?")
    p.add_argument("--verify-only",action="store_true")
    a=p.parse_args()
    if a.verify_only:validate()
    elif a.out:render(a.out)
    else:p.error("Provide --verify-only or a fresh output folder")
