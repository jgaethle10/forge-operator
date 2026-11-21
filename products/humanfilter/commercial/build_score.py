#!/usr/bin/env python3
"""HumanFilter RC3: procedural original instrumental / SFX auditions.

All waveforms generated from math/noise here. No pre-existing music, recorded
samples, voice model, or licensed source assets are imported or embedded.
This is a pre-approval soundtrack audition and does not grant publish rights.
"""
from __future__ import annotations
import argparse, hashlib, json, math, os, pathlib, shutil, subprocess, wave
import numpy as np

SR=48000
DURATION=30.0
N=int(SR*DURATION)
BORDER={"hook_end":4,"filter_proof_end":12,"strict_keyword_end":19,"restore_end":24,"cta_end":30}
PITCH_CLASS={"C":0,"Cs":1,"D":2,"Eb":3,"E":4,"F":5,"Fs":6,"G":7,"Ab":8,"A":9,"Bb":10,"B":11}
def hz(pitch):
    name=pitch[:-1]; octave=int(pitch[-1]); midi=(octave+1)*12+PITCH_CLASS[name]
    return 440*2**((midi-69)/12)
def noise(rng,n):return rng.normal(0,1,n)
def smoothfade(env,n,tau_a=.035,tau_r=.18):
    attack=max(1,min(n//2,int(SR*tau_a))); release=max(1,min(n//2,int(SR*tau_r)))
    if attack:env[:attack]*=np.sin(np.linspace(0,math.pi/2,attack))**2
    if release:env[-release:]*=np.sin(np.linspace(math.pi/2,0,release))**2
    return env

def osc_note(pitch,duration,velocity,kind,rng):
    n=int(duration*SR)
    t=np.arange(n,dtype=np.float64)/SR
    f=hz(pitch)
    attack=.01 if kind in ['pluck','bell','bass'] else .48
    if kind=='pad':
        base=np.zeros(n)
        for k in range(1,8):
            strength=1/(k**1.64)
            base+=strength*np.sin(2*np.pi*f*k*t + .006*np.sin(2*np.pi*.25*t)*k + k*.7)
        env=(1-np.exp(-t/attack)) * (1-np.exp(-(duration-t).clip(0,None)/.48))
        y=base*.22*env
    elif kind=='felt':
        y=np.sin(2*np.pi*f*t) + .19*np.sin(2*np.pi*2*f*t+.12)+.055*np.sin(2*np.pi*3*f*t+.46)
        env=np.exp(-t*2.75)*(1-np.exp(-t/.009))
        y=y*.38*env
    elif kind=='bell':
        y=np.sin(2*np.pi*f*t)+.18*np.sin(2*np.pi*2.02*f*t)+.14*np.sin(2*np.pi*3.97*f*t)
        y*=.24*np.exp(-t*3.05)*(1-np.exp(-t/.003))
    elif kind=='bass':
        base=np.sin(2*np.pi*f*t)+.23*np.sin(2*np.pi*2*f*t)*np.exp(-t*6)
        y=base*.42*(1-np.exp(-t/.014))*np.exp(-t*1.6)
    else:raise ValueError(kind)
    smoothfade(y,n,.005 if kind!='pad' else .04,.04 if kind!='pad' else .18)
    return (velocity*y).astype(np.float32)

def place(track,start,waveform,pan=0.):
    sample=max(0,round(start*SR)); end=min(len(track),sample+len(waveform))
    if end<=sample:return
    w=waveform[:end-sample]
    # constant-power center-safe stereo, modest width
    l=math.cos((pan+1)*math.pi/4)*1.414213562
    r=math.sin((pan+1)*math.pi/4)*1.414213562
    track[sample:end,0]+=w*l
    track[sample:end,1]+=w*r

def kick(rng):
    t=np.arange(int(.36*SR))/SR
    phase=2*np.pi*(58*t+65*.027*(1-np.exp(-t/.027)))
    y=np.sin(phase)*np.exp(-t*15)*.27
    y+=noise(rng,len(t))*.08*np.exp(-t*45)
    return y.astype(np.float32)
def snare(rng):
    t=np.arange(int(.23*SR))/SR
    n=noise(rng,len(t));n=np.concatenate([[0],np.diff(n)])
    y=(n*.13+np.sin(2*np.pi*175*t)*.09)*np.exp(-t*25)
    return y.astype(np.float32)
def hat(rng):
    t=np.arange(int(.105*SR))/SR
    n=noise(rng,len(t));n=np.concatenate([[0],np.diff(n)])
    return (n*.060*np.exp(-t*52)).astype(np.float32)
def pulse_fx(rng,kind):
    dur={'toggle':.35,'reveal':.48,'resolve':1.2,'shift':.45}[kind]
    t=np.arange(int(dur*SR))/SR
    if kind=='toggle':
        y=.09*np.sin(2*np.pi*(600*t+1350*t*t))*np.exp(-t*14)
        y+=.018*noise(rng,len(t))*np.exp(-t*35)
    elif kind=='reveal':
        y=.13*np.sin(2*np.pi*(750*t-170*t*t))*np.exp(-t*8)
        y+=.02*noise(rng,len(t))*np.exp(-t*25)
    elif kind=='shift':
        y=.05*noise(rng,len(t))*(np.clip(t/.25,0,1))*(np.clip((dur-t)/.20,0,1))
        y+=.05*np.sin(2*np.pi*(145*t+300*t*t))*np.exp(-t*5)
    else:
        y=.075*np.sin(2*np.pi*196*t)*np.exp(-t*3)+.045*np.sin(2*np.pi*392*t)*np.exp(-t*4)
    return y.astype(np.float32)
def room(signal,tail=.75):
    # 100% original synthetic short early reflections, not IR/sample files
    out=signal.copy()
    for delay,gain in [(0.071,.09),(0.11,.06),(0.177,.055),(0.231,.04),(0.38,.025)]:
        d=int(delay*SR)
        out[d:,0]+=signal[:-d,1]*gain
        out[d:,1]+=signal[:-d,0]*gain
    return out

def style_config(name):
    if name=='human_warmth':
        return {'bpm':96,'pad':.83,'felt':.96,'bell':.38,'bass':.68,'drums':.38,'pulse':.08,
          'melody':['G4','Eb4','Bb4','C5','G4','F4','Eb4','G4']}
    if name=='focused_energy':
        return {'bpm':112,'pad':.66,'felt':.79,'bell':.65,'bass':.94,'drums':.67,'pulse':.14,
          'melody':['G4','Bb4','C5','Eb5','D5','C5','Bb4','G4']}
    raise ValueError(name)

def compose(name):
    settings=style_config(name);rng=np.random.default_rng(260102 if name=='human_warmth' else 260103)
    tracks={i:np.zeros((N,2),dtype=np.float32) for i in ['pad','keys','bass','rhythm','fx']}
    beat=60/settings['bpm']
    chords=[['C3','Eb3','G3','Bb3','D4'],['Ab2','C3','Eb3','G3'],['Eb3','G3','Bb3','F4'],['Bb2','D3','F3','C4']]
    # Four 4-beat chord cycles are repeated 3 times to create an evolving 30-second arc.
    bars=int(math.ceil(DURATION/(4*beat)))
    for bar in range(bars):
        start=bar*4*beat
        if start>DURATION:break
        chord=chords[bar%4]; end=min(DURATION,start+4*beat)
        intensity=.75 if start<4 else (1.07 if start<19 else (.90 if start<24 else .70))
        for i,p in enumerate(chord):
            w=osc_note(p,min(5.5,end-start+.24),.32*settings['pad']*intensity,'pad',rng)
            place(tracks['pad'],start,w,pan=(-.37+i*.185))
        root=chord[0]
        for offs,amt in [(0,1.0),(2,.70),(3.5,.45)]:
            st=start+offs*beat
            if st>=DURATION:continue
            place(tracks['bass'],st,osc_note(root,.70,.8*settings['bass']*amt,'bass',rng),pan=0)
        for j in range(4):
            st=start+(j+.5)*beat
            if st>=DURATION:continue
            # varying dyads and moving chord tones, never an unaltered sample loop
            p=chord[(j+bar)%len(chord)]
            place(tracks['keys'],st,osc_note(p,.62,.60*settings['felt']*(.82 if j%2 else 1.1),'felt',rng),pan=.14 if j%2 else -.15)
        if start>=3.7:
            for j in range(4):
                st=start+j*beat
                if st>=DURATION:continue
                place(tracks['rhythm'],st,kick(rng)*(.9 if j in (0,2) else .45)*settings['drums'])
                if j%2:place(tracks['rhythm'],st,snare(rng)*settings['drums'],pan=.03)
                if start>10:
                    for h in (0,.5):
                        if st+h*beat<DURATION:
                            place(tracks['rhythm'],st+h*beat,hat(rng)*settings['drums'],pan=(-.16 if h==0 else .17))
    # Distinct four-note motif; human phrasing and deliberate absence around voice-heavy proof.
    motifs=[(1.0,.62),(12.5,.78),(24.5,.69)]
    for loc,strength in motifs:
        for j,pitch in enumerate(settings['melody'][:4]):
            time=loc+j*beat*.8
            place(tracks['keys'],time,osc_note(pitch,1.1,strength*settings['bell'],'bell',rng),pan=(-.22+j*.13))
    for t,kind in [(3.96,'toggle'),(12.05,'shift'),(19.08,'reveal'),(24.15,'resolve')]:
        place(tracks['fx'],t,pulse_fx(rng,kind))
    # Controlled 2D stereo with finite soft clipping on source mix (master follows separately).
    score=room(tracks['pad']+tracks['keys']+tracks['bass']+tracks['rhythm'])
    effects=room(tracks['fx'])
    # Leave sensible space for narration, especially 4-12 and 19-24s.
    envelope=np.ones(N,dtype=np.float32)
    for a,b,g in [(4,12,.78),(19,24,.80)]:
        i,j=int(a*SR),int(b*SR)
        ramp=min(int(.22*SR),j-i)
        envelope[i:j]=g
        envelope[i:i+ramp]=np.linspace(1,g,ramp)
        envelope[j-ramp:j]=np.linspace(g,1,ramp)
    score*=envelope[:,None]
    score*=.78
    effects*=.84
    mixed=np.tanh(score+effects)*.75
    # Controlled fade in/out for edit handles and no clicked ending
    for y in [score,effects,mixed]:
        a=int(.16*SR);z=int(.72*SR)
        y[:a]*=np.linspace(0,1,a)[:,None]
        y[-z:]*=np.linspace(1,0,z)[:,None]
    return score,effects,mixed,settings

def write_wav(p,data):
    assert np.all(np.isfinite(data))
    out=np.clip(data,-.98,.98)
    with wave.open(str(p),'wb') as w:
        w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR)
        w.writeframes((out*32767).astype('<i2').tobytes())
def hash_file(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def loudness(p):
    r=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(p),'-filter_complex','ebur128=peak=true','-f','null','-'],capture_output=True,text=True,check=True)
    section=r.stderr.rsplit('Summary:',1)[-1]
    import re
    m=re.search(r'I:\s*(-?\d+(?:\.\d+)?) LUFS',section)
    peak=re.search(r'Peak:\s*(-?\d+(?:\.\d+)?) dBFS',section)
    return {'integrated_lufs':float(m.group(1)) if m else None,'true_peak_dBFS':float(peak.group(1)) if peak else None}
def master(p,out):
    # One-pass demonstration master; the final commercial is still mastered by Fallen with dialog.
    subprocess.run(['ffmpeg','-nostdin','-y','-v','error','-i',str(p),'-af','loudnorm=I=-18:TP=-2:LRA=10:linear=false',
        '-ar','48000','-c:a','pcm_s16le',str(out)],check=True)
def run(out):
    out.mkdir(parents=True,exist_ok=True)
    receipts=[]
    for style in ('human_warmth','focused_energy'):
        folder=out/style;folder.mkdir(parents=True,exist_ok=True)
        score,sfx,mix,config=compose(style)
        files={}
        for name,data in [('score_stem.wav',score),('original_ui_sfx_stem.wav',sfx),('unmastered_audition.wav',mix)]:
            p=folder/name;write_wav(p,data);files[name]={'sha256':hash_file(p),'bytes':p.stat().st_size}
        master(folder/'unmastered_audition.wav',folder/'audition_review_master.wav')
        p=folder/'audition_review_master.wav';files[p.name]={'sha256':hash_file(p),'bytes':p.stat().st_size,'metering':loudness(p)}
        # Phone-friendly audition, no video or fake vocals
        subprocess.run(['ffmpeg','-nostdin','-y','-v','error','-i',str(p),'-c:a','libmp3lame','-b:a','192k',str(folder/'audition_review.mp3')],check=True)
        p=folder/'audition_review.mp3';files[p.name]={'sha256':hash_file(p),'bytes':p.stat().st_size}
        receipts.append({'style':style,'bpm':config['bpm'],'duration_seconds':30,'files':files})
    report={'schema':'evercraft.humanfilter.fallen.music-audition.v1','status':'ORIGINAL_INSTRUMENTAL_AUDITIONS_NOT_FINAL_MIX',
        'composition_origin':'original code-generated oscillators, envelopes, noise percussion, harmonies; no pre-existing audio samples or imported soundfonts',
        'product':'HumanFilter','brief_id':'humanfilter-launch-rc3','scenes':BORDER,
        'rights_claim':'original mathematical synthesis and newly arranged composition; no third-party recordings',
        'bella_voice_present':False,'creative_approval':False,'commercial_master_created':False,'publication_authority':False,
        'soundtracks':receipts}
    (out/'audio_manifest.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'auditions':[{'style':x['style'],'metering':x['files']['audition_review_master.wav']['metering']} for x in receipts]},indent=2))
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--out',type=pathlib.Path,default=pathlib.Path('artifacts/humanfilter-rc3/audio-auditions'));args=a.parse_args();run(args.out)