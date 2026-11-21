#!/usr/bin/env python3
"""Private Evercraft Voice Foundry Chatterbox-Nano model audition, using
externally pretrained Resemble Chatterbox Nano (upstream model card: MIT).
Not a multi-turn context-aware model. Never auto-publish or clone a voice.
"""
import argparse,hashlib,json,os,pathlib,re,time

SCENARIOS = (
    ('neutral','Wait. You sent it? I said draft.'),
    ('nervous_reaction','Wait. [chuckle] You sent it? I said draft.'),
    ('agent_account','I already sent it.'),
)
MODEL='ResembleAI/chatterbox-nano'
MODEL_CARD='https://huggingface.co/ResembleAI/chatterbox-nano'

def words(value):return re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?",value.lower())
def lexically_equal(a,b):return words(re.sub(r'\[[^\]]+\]','',a))==words(b)
def verify():
    assert lexically_equal(SCENARIOS[1][1],SCENARIOS[0][1]),'voice tags changed spoken words'
    assert '[chuckle]' in SCENARIOS[1][1]
    assert len(set(k for k,_ in SCENARIOS))==len(SCENARIOS)
    assert all(1<len(words(t))<30 for _,t in SCENARIOS)
    print('Nano scene specs verified; no clone/reference/rights grants.')

def sha(file):
    h=hashlib.sha256()
    with open(file,'rb') as f:
        for c in iter(lambda:f.read(2**20),b''):h.update(c)
    return h.hexdigest()

def run(outdir):
    verify()
    import numpy as np
    import torch
    import soundfile as sf
    from chatterbox.tts_turbo import ChatterboxTurboTTS
    out=pathlib.Path(outdir);out.mkdir(parents=True,exist_ok=False)
    torch.set_num_threads(min(4,os.cpu_count() or 2))
    start=time.time()
    model=ChatterboxTurboTTS.from_pretrained(device='cpu',nano=True)
    loadsec=round(time.time()-start,2)
    result={'schema':'evercraft.voice-foundry.chatterbox-nano-emotion-probe.v1',
        'externalModel':MODEL,'modelCard':MODEL_CARD,
        'sourceCheckoutSha':os.environ.get('EVERCRAFT_MODEL_SOURCE_COMMIT'),
        'codeLicenseClaim':'MIT upstream',
        'modelLicenseClaim':'MIT upstream model card','modelWeightRevisionPinned':False,
        'originalEvercraftModel':False,'directPreviousAudioConditioning':False,
        'emotionControl':'native [chuckle] tag without scene audio conditioning',
        'voiceCloningReferenceUsed':False,'speakerIdentityComparedToV02':False,
        'humanQualityApproved':False,'commercialPublicationAuthorized':False,
        'publicProductDemonstration':False,'modelLoadSeconds':loadsec,'outputs':[]}
    for key,sentence in SCENARIOS:
        start=time.time()
        with torch.inference_mode(): wav=model.generate(sentence)
        arr=wav.detach().cpu().numpy().astype(np.float32).flatten()
        if arr.size<1000 or not np.isfinite(arr).all():raise RuntimeError('invalid audio:'+key)
        if np.max(np.abs(arr))<.005:raise RuntimeError('silent audio:'+key)
        file=out/(key+'.wav');sf.write(file,arr,model.sr,subtype='PCM_16')
        result['outputs'].append({'id':key,'text':sentence,'file':file.name,
            'sha256':sha(file),'seconds':round(len(arr)/model.sr,3),
            'inferenceSeconds':round(time.time()-start,2),'sampleRate':model.sr,
            'channelCount':1,'rms':round(float(np.sqrt(np.mean(arr**2))),5)})
    (out/'performance-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'loadSeconds':loadsec,'auditions':result['outputs']},indent=2))

def main():
    p=argparse.ArgumentParser();p.add_argument('--verify-only',action='store_true');p.add_argument('--out')
    a=p.parse_args()
    if a.verify_only:verify();return
    if not a.out:raise SystemExit('--out required')
    run(a.out)
if __name__=='__main__':main()
