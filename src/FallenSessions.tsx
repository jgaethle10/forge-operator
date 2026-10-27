import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PULSEGRID_ENGINE_VERSION,
  PULSEGRID_MAX_CLIP_BARS,
  PulseGridAudioEngine,
  PulseGridBrowserAudioAssetVault,
  applyPulseGridOperation,
  applyPulseGridTransaction,
  createPulseGridSession,
  undoPulseGridReceipt,
  type PulseGridActor,
  type PulseGridAudioAsset,
  type PulseGridAudioStatus,
  type PulseGridOperation,
  type PulseGridSession,
} from '../systemia/media-studio/pulsegrid-browser';
import {compileFoundryImport,verifyFoundryWavBytes} from '../systemia/media-studio/instrument-foundry-bridge.mjs';
import {appendFoundryPianoSample} from '../systemia/media-studio/instrument-foundry-piano.mjs';
import {analyzeFoundryPianoWav,checkFoundryPianoRootPitch} from '../systemia/media-studio/instrument-foundry-capture-qa.mjs';
import {analyzePulseGridMusic} from '../systemia/media-studio/pulsegrid-music-insights.mjs';
import {analyzePulseGridCounterpoint} from '../systemia/media-studio/pulsegrid-counterpoint-evidence.mjs';
import {analyzePulseGridArrangementArc} from '../systemia/media-studio/pulsegrid-arrangement-arc.mjs';
import {analyzeFoundryPianoTailCoverage} from '../systemia/media-studio/instrument-foundry-tail-audit.mjs';
import type {FoundryDryPcmAudit} from '../systemia/media-studio/instrument-foundry-dry-pcm.mjs';
import {decodeFoundryMidiSustain,mergeFoundryMidiPedalEvent,removeFoundryMidiPedalEvent} from '../systemia/media-studio/instrument-foundry-midi-pedal.mjs';
import type {FoundryInstrumentPatch} from '../systemia/media-studio/instrument-foundry-piano.mjs';
import './fallen-sessions.css';

const PITCHES=Array.from({length:13},(_,index)=>72-index);
const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function noteName(pitch:number){
  return NOTE_NAMES[pitch%12]+String(Math.floor(pitch/12)-1);
}

type PedalCapture={
  trackId:string;scene:number;clipId:string;
  original:Array<{step:number;down:boolean}>;
  events:Array<{step:number;down:boolean}>;
};

type HeldMidiNote={
  trackId:string;
  scene:number;
  pitch:number;
  velocity:number;
  startedAt:number;
  startStep:number;
};

function latestUndoableReceipt(session:PulseGridSession){
  const undone=new Set(session.receipts.map((receipt)=>receipt.undo_of).filter(Boolean));
  const transactionChildren=new Set(session.receipts.flatMap((receipt)=>receipt.child_receipt_ids||[]));
  return [...session.receipts].reverse().find((receipt)=>
    receipt.reversible && !undone.has(receipt.id) && !transactionChildren.has(receipt.id)
  )||null;
}

export default function FallenSessions(){
  const [session,setSession]=useState<PulseGridSession>(()=>createPulseGridSession('First Light'));
  const [selectedTrackId,setSelectedTrackId]=useState('keys');
  const [foundryRootPitch,setFoundryRootPitch]=useState(60);
  const [foundryVelocityMin,setFoundryVelocityMin]=useState(0);
  const [foundryVelocityMax,setFoundryVelocityMax]=useState(1);
  const [selectedScene,setSelectedScene]=useState(0);
  const [selectedNoteId,setSelectedNoteId]=useState<string|null>(null);
  const [selectedStepIndex,setSelectedStepIndex]=useState<number|null>(null);
  const [draggedNoteId,setDraggedNoteId]=useState<string|null>(null);
  const [status,setStatus]=useState('Canonical PulseGrid session ready.');
  const [playing,setPlaying]=useState(false);
  const [recording,setRecording]=useState(false);
  const [midiEnabled,setMidiEnabled]=useState(false);
  const [midiInputs,setMidiInputs]=useState(0);
  const [pendingPedalCount,setPendingPedalCount]=useState(0);
  const [dryPcmAudit,setDryPcmAudit]=useState<FoundryDryPcmAudit|null>(null);
  const [automationParam,setAutomationParam]=useState<'volume'|'filter'>('volume');
  const [playhead,setPlayhead]=useState(0);
  const [audioStatus,setAudioStatus]=useState<PulseGridAudioStatus>({playing:false,scene:0,step:0,context_state:'cold',clock_mode:'cold',track_buses:0,latency_ms:null,cached_audio_assets:0});
  const sessionRef=useRef(session);
  const selectedTrackRef=useRef(selectedTrackId);
  const selectedSceneRef=useRef(selectedScene);
  const playheadRef=useRef(0);
  const midiAccessRef=useRef<any>(null);
  const heldMidiNotesRef=useRef(new Map<string,HeldMidiNote>());
  const midiPedalSourceRef=useRef<string|null>(null);
  const midiPedalCaptureRef=useRef<PedalCapture|null>(null);
  const selectedPedalStepRef=useRef<number|null>(null);
  const vaultRef=useRef<PulseGridBrowserAudioAssetVault|null>(null);
  const fileInputRef=useRef<HTMLInputElement|null>(null);
  const foundryInputRef=useRef<HTMLInputElement|null>(null);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const recordingStreamRef=useRef<MediaStream|null>(null);
  const recordingSceneRef=useRef(0);
  const audioRef=useRef<PulseGridAudioEngine|null>(null);
  if(!vaultRef.current)vaultRef.current=new PulseGridBrowserAudioAssetVault();
  if(!audioRef.current){
    audioRef.current=new PulseGridAudioEngine();
    audioRef.current.setAudioAssetResolver((asset)=>vaultRef.current!.getVerifiedBlob(asset));
    audioRef.current.onStep=(step)=>{playheadRef.current=step;setPlayhead(step)};
    audioRef.current.onStatus=(next)=>{setAudioStatus(next);setPlaying(next.playing)};
  }

  const track=useMemo(
    ()=>session.tracks.find((candidate)=>candidate.id===selectedTrackId)||session.tracks[0],
    [session,selectedTrackId],
  );
  const clip=track.clips[selectedScene];
  const selectedNote=selectedNoteId?clip.notes.find((note)=>note.id===selectedNoteId)||null:null;
  const undoable=latestUndoableReceipt(session);

  useEffect(()=>{
    sessionRef.current=session;
    audioRef.current?.updateSession(session);
  },[session]);

  useEffect(()=>{setDryPcmAudit(null)},[session,selectedScene]);

  useEffect(()=>{
    selectedPedalStepRef.current=selectedStepIndex;
  },[selectedStepIndex]);

  useEffect(()=>{
    selectedTrackRef.current=selectedTrackId;
    midiPedalSourceRef.current=null;
    setSelectedNoteId(null);
    setSelectedStepIndex(null);
  },[selectedTrackId]);

  useEffect(()=>{
    selectedSceneRef.current=selectedScene;
    midiPedalSourceRef.current=null;
    setSelectedNoteId(null);
    setSelectedStepIndex(null);
    const active=Boolean(audioRef.current?.status.playing);
    audioRef.current?.setScene(selectedScene);
    if(active)setStatus('Scene changed · playback paused to verify recordings. Press Play to continue.');
  },[selectedScene]);

  useEffect(()=>()=>{ 
    const recorder=recorderRef.current;
    if(recorder){
      recorder.ondataavailable=null;
      recorder.onstop=null;
      recorder.onerror=null;
      try{if(recorder.state!=='inactive')recorder.stop()}catch{}
    }
    recorderRef.current=null;
    recordingStreamRef.current?.getTracks().forEach((mediaTrack)=>mediaTrack.stop());
    recordingStreamRef.current=null;
    const midiAccess=midiAccessRef.current;
    if(midiAccess){
      midiAccess.onstatechange=null;
      for(const input of midiAccess.inputs.values())input.onmidimessage=null;
    }
    midiAccessRef.current=null;
    heldMidiNotesRef.current.clear();
    midiPedalSourceRef.current=null;
    midiPedalCaptureRef.current=null;
    if(audioRef.current){audioRef.current.onStep=null;audioRef.current.onStatus=null;void audioRef.current.close();}
  },[]);

  async function togglePlay(){
    if(playing){
      audioRef.current?.stop();
      setPlaying(false);
      setPlayhead(0);
      setStatus('Playback stopped.');
      return;
    }
    try{
      setDryPcmAudit(null);
      await audioRef.current?.play(session,selectedScene);
      setPlaying(true);
      setStatus('Playing canonical scene '+(selectedScene+1)+'.');
    }catch(error){
      setStatus(error instanceof Error?error.message:'Web Audio playback failed.');
    }
  }

  function apply(operation:PulseGridOperation,actor:PulseGridActor='human'){
    try{
      const result=applyPulseGridOperation(session,operation,actor);
      setSession(result.session);
      setStatus(operation.type+' committed · '+result.receipt.id.slice(0,8));
      return result;
    }catch(error){
      setStatus(error instanceof Error?error.message:'PulseGrid operation failed.');
      return null;
    }
  }

  async function commitAudioAsset(
    asset:PulseGridAudioAsset,
    scene:number,
    intent:string,
    successLabel:string,
  ){
    const current=sessionRef.current;
    const audioTrack=current.tracks.find((candidate)=>candidate.type==='audio');
    if(!audioTrack)throw new Error('No canonical audio track is available.');

    const result=applyPulseGridTransaction(current,{
      intent,
      operations:[
        {type:'asset.register_audio',asset:{
          digest:asset.digest,
          mime_type:asset.mime_type,
          byte_length:asset.byte_length,
          duration_sec:asset.duration_sec,
          sample_rate:asset.sample_rate,
          channels:asset.channels,
          source_name:asset.source_name,
          source_refs:asset.source_refs,
          source_state:asset.source_state,
          rights:asset.rights,
          parent_asset_ids:asset.parent_asset_ids,
          created_at:asset.created_at,
        }},
        {type:'clip.attach_audio_asset',track_id:audioTrack.id,scene,asset_id:asset.id},
      ],
    },'human');
    setSession(result.session);
    setSelectedTrackId(audioTrack.id);
    setSelectedScene(scene);
    setStatus(
      successLabel+' · '+asset.duration_sec.toFixed(2)+'s · '+
      asset.sample_rate+' Hz · '+asset.channels+'ch · rights '+asset.rights
    );
  }

  async function armFoundryPianoFromTake(){
    // Only an explicit human audition action may bind a local WAV to the
    // canonical MIDI notes. Never infer sample copyright from storage.
    setStatus('Checking sample before arming recorded piano…');
    try{
      const current=sessionRef.current;
      const audioTrack=current.tracks.find(track=>track.type==='audio');
      const keysTrack=current.tracks.find(track=>track.id==='keys'&&track.type==='synth');
      if(!audioTrack||!keysTrack)throw new Error('Piano and Audio Take tracks are required.');
      const assetId=audioTrack.clips[selectedScene]?.audio_asset_id;
      if(!assetId)throw new Error('Import a verified Foundry WAV into this scene first.');
      const asset=current.assets.find(candidate=>candidate.id===assetId);
      if(!asset||asset.mime_type!=='audio/wav'||asset.rights==='restricted'){
        throw new Error('A permitted canonical WAV is required for piano audition.');
      }
      const blob=await vaultRef.current?.getVerifiedBlob(asset);
      if(!blob)throw new Error('Foundry recording is missing from local verified storage.');
      const sampleBytes=new Uint8Array(await blob.arrayBuffer());
      await verifyFoundryWavBytes(asset,sampleBytes);
      const signalQa=analyzeFoundryPianoWav(sampleBytes);
      if(signalQa.status!=='technical_signal_pass'){
        throw new Error('Piano capture held: '+signalQa.blockers.join(', ')+
          '. Record another take before arming.');
      }
      const root=foundryRootPitch;
      if(!Number.isInteger(root)||root<21||root>108)throw new Error('Piano MIDI root must be 21 to 108.');
      const pitchEvidence=checkFoundryPianoRootPitch(sampleBytes,root);
      if(pitchEvidence.status!=='consistent'){
        throw new Error('Piano root MIDI '+root+' not confirmed ('+pitchEvidence.reason+
          (pitchEvidence.cents_error===null?'':', '+pitchEvidence.cents_error+' cents')+
          '). Keep this WAV for independent musician pitch review or record another take.');
      }
      if(!Number.isFinite(foundryVelocityMin)||!Number.isFinite(foundryVelocityMax)||
         foundryVelocityMin<0||foundryVelocityMax>1||foundryVelocityMin>=foundryVelocityMax){
        throw new Error('Recorded velocity layer must have a valid min/max range from 0 to 1.');
      }
      const existing=keysTrack.clips[selectedScene]?.provenance?.foundry_piano_patch as FoundryInstrumentPatch|undefined;
      const patch=appendFoundryPianoSample(existing,{
        asset_id:asset.id,root_pitch:root,velocity_min:foundryVelocityMin,
        velocity_max:foundryVelocityMax,release_sec:0.22,
      },current.assets);
      const result=applyPulseGridTransaction(current,{
        intent:'Add locally verified recording to one reversible multi-note piano bank; internal audition only.',
        operations:[
          // Detach the raw Audio Take clip after assigning the SAME registered
          // asset to MIDI Keys. Otherwise Play would trigger both at once.
          // The asset remains in the vault and undo restores this attachment.
          {type:'clip.attach_audio_asset',track_id:audioTrack.id,scene:selectedScene,asset_id:null},
          {type:'clip.set_foundry_piano_patch',track_id:keysTrack.id,scene:selectedScene,patch},
        ],
      },'human');
      setSession(result.session);
      setSelectedTrackId(keysTrack.id);
      setStatus('Foundry piano bank now has '+patch.samples.length+' verified sample layers; latest MIDI root '+root+' (±2 semitones). Technical signal gate passed (peak '+signalQa.metrics.peak_dbfs+
        ' dBFS, tail '+signalQa.metrics.tail_rms_dbfs+
        ' dBFS, pitch '+pitchEvidence.cents_error+
        ' cents from MIDI '+root+'); raw take detached; musician review and performer rights still unverified.');
    }catch(error){
      setStatus(error instanceof Error?error.message:'Foundry piano note assignment failed.');
    }
  }

  async function importFoundryWavFile(file:File){
    // This is a strictly local, unknown-rights audition path. It cannot certify
    // a performer, claim sample ownership, or authorize public music release.
    const vault=vaultRef.current;
    if(!vault)return;
    const scene=selectedScene;
    setStatus('Verifying Foundry WAV for internal audition…');
    try{
      if(!/\.wav$/i.test(file.name)||file.size<44||file.size>64*1024*1024){
        throw new Error('Foundry import requires a WAV file between 44 bytes and 64 MB.');
      }
      // Normalize inconsistent browser WAV MIME types without modifying bytes.
      const wav=new Blob([file],{type:'audio/wav'});
      const asset=await vault.ingest(wav,{
        source_name:file.name,
        source_refs:['local-file:'+file.name],
        source_state:'imported',
        rights:'unknown',
      });
      const verified=await vault.getVerifiedBlob(asset);
      if(!verified)throw new Error('The stored Foundry take was not found.');
      await verifyFoundryWavBytes(asset,new Uint8Array(await verified.arrayBuffer()));
      const current=sessionRef.current;
      const audioTrack=current.tracks.find((candidate)=>candidate.type==='audio');
      if(!audioTrack)throw new Error('No canonical audio track exists.');
      // This digest proves the locally supplied bytes, not artist/sample ownership.
      const barDuration=4*60/current.transport.bpm; // 16 canonical 16th-steps per bar
      const requiredBars=Math.max(1,Math.ceil((asset.duration_sec+0.01)/barDuration));
      if(requiredBars>PULSEGRID_MAX_CLIP_BARS){
        throw new Error('Foundry take exceeds the 16-bar audition limit. Use a shorter WAV; long-form masters require a separate arrangement path.');
      }
      const candidate={...asset,source_refs:['sha256:'+asset.digest]};
      const admitted=compileFoundryImport({
        session:current,assets:[candidate],
        attachments:[{track_id:audioTrack.id,scene,asset_id:asset.id}],
        actor:'human',
      });
      const currentBars=audioTrack.clips[scene]?.bars||1;
      const operations=[
        ...(requiredBars>currentBars
          ? [{type:'clip.set_bars' as const,track_id:audioTrack.id,scene,bars:requiredBars}]
          : []),
        ...admitted.transaction.operations,
        {type:'clip.set_audio_playback_mode' as const,track_id:audioTrack.id,scene,mode:'one_shot' as const},
      ];
      const committed=applyPulseGridTransaction(current,{
        intent:'Verify, size, and attach Foundry WAV for internal audition.',
        operations,
      },admitted.actor);
      setSession(committed.session);
      setSelectedTrackId(audioTrack.id);
      setSelectedScene(scene);
      setStatus('Foundry WAV verified and attached for local audition · rights UNKNOWN · no commercial release clearance.');
    }catch(error){
      setStatus(error instanceof Error?error.message:'Foundry WAV verification failed.');
    }finally{
      if(foundryInputRef.current)foundryInputRef.current.value='';
    }
  }

  async function importAudioFile(file:File){
    const vault=vaultRef.current;
    if(!vault)return;
    const scene=selectedScene;
    setStatus('Hashing and verifying '+file.name+'…');
    try{
      const asset=await vault.ingest(file,{
        source_name:file.name,
        source_refs:['local-file:'+file.name],
        source_state:'imported',
        rights:'unknown',
      });
      await commitAudioAsset(
        asset,
        scene,
        'Import a local audio file and attach it to Audio Take scene '+String(scene+1)+'.',
        'Imported '+file.name,
      );
    }catch(error){
      setStatus(error instanceof Error?error.message:'Audio import failed.');
    }finally{
      if(fileInputRef.current)fileInputRef.current.value='';
    }
  }

  async function toggleRecording(){
    if(recording){
      recorderRef.current?.stop();
      return;
    }
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
      setStatus('Microphone recording is unavailable in this browser.');
      return;
    }

    audioRef.current?.stop();
    setPlaying(false);
    setPlayhead(0);
    recordingSceneRef.current=selectedScene;
    setStatus('Requesting microphone access…');

    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      recordingStreamRef.current=stream;
      const preferred='audio/webm;codecs=opus';
      const options=MediaRecorder.isTypeSupported(preferred)?{mimeType:preferred}:undefined;
      const recorder=new MediaRecorder(stream,options);
      const chunks:BlobPart[]=[];
      recorderRef.current=recorder;

      recorder.ondataavailable=(event)=>{
        if(event.data.size>0)chunks.push(event.data);
      };
      recorder.onerror=()=>{
        setStatus('Microphone recording failed.');
        try{if(recorder.state!=='inactive')recorder.stop()}catch{}
      };
      recorder.onstop=()=>{
        const scene=recordingSceneRef.current;
        const stoppedAt=new Date().toISOString();
        const mimeType=recorder.mimeType||'audio/webm';
        const blob=new Blob(chunks,{type:mimeType});
        recordingStreamRef.current?.getTracks().forEach((mediaTrack)=>mediaTrack.stop());
        recordingStreamRef.current=null;
        recorderRef.current=null;
        setRecording(false);
        void (async()=>{
          try{
            if(blob.size<=0)throw new Error('The microphone take was empty.');
            const vault=vaultRef.current;
            if(!vault)throw new Error('PulseGrid audio vault is unavailable.');
            setStatus('Hashing and verifying recorded take…');
            const asset=await vault.ingest(blob,{
              source_name:'recording-'+stoppedAt.replace(/[:.]/g,'-'),
              source_refs:['media-recorder:'+stoppedAt],
              source_state:'recording',
              rights:'unknown',
            });
            await commitAudioAsset(
              asset,
              scene,
              'Record a microphone take and attach it to Audio Take scene '+String(scene+1)+'.',
              'Recorded take',
            );
          }catch(error){
            setStatus(error instanceof Error?error.message:'Recording ingest failed.');
          }
        })();
      };

      recorder.start(250);
      setRecording(true);
      setStatus('Recording microphone · scene '+String(selectedScene+1));
    }catch(error){
      recordingStreamRef.current?.getTracks().forEach((mediaTrack)=>mediaTrack.stop());
      recordingStreamRef.current=null;
      recorderRef.current=null;
      setRecording(false);
      setStatus(error instanceof Error?error.message:'Microphone access failed.');
    }
  }

  function chooseAudioFile(){
    fileInputRef.current?.click();
  }

  function bindMidiInputs(access:any){
    let count=0;
    for(const input of access.inputs.values()){
      count+=1;
      input.onmidimessage=(event:any)=>handleMidiMessage(input,event);
    }
    setMidiInputs(count);
    setStatus(count?('MIDI ready · '+count+' input'+(count===1?'':'s')):'MIDI enabled · no inputs detected');
  }

  function commitCapturedPedal(){
    const captured=midiPedalCaptureRef.current;
    if(!captured)return;
    if(audioRef.current?.status.playing){
      setStatus('Stop playback before committing the buffered pedal take.');
      return;
    }
    const current=sessionRef.current;
    const target=current.tracks.find(candidate=>candidate.id===captured.trackId);
    const targetClip=target?.clips[captured.scene];
    const existing=targetClip?.provenance?.foundry_piano_pedal;
    const currentEvents=Array.isArray(existing)
      ? existing as Array<{step:number;down:boolean}>:[];
    if(!targetClip||targetClip.id!==captured.clipId||
       JSON.stringify(currentEvents)!==JSON.stringify(captured.original)){
      setStatus('Pedal capture held: the original clip changed. Discard this take or inspect the clip before retrying.');
      return;
    }
    try{
      if(JSON.stringify(captured.events)!==JSON.stringify(captured.original)){
        const result=applyPulseGridOperation(current,{
          type:'clip.set_foundry_piano_pedal',track_id:captured.trackId,
          scene:captured.scene,events:captured.events
        },'controller');
        sessionRef.current=result.session;
        setSession(result.session);
        setStatus('CC64 pedal take committed with undo receipt · '+result.receipt.id.slice(0,8));
      }else{
        setStatus('CC64 pedal take contained no net change.');
      }
      midiPedalCaptureRef.current=null;
      setPendingPedalCount(0);
    }catch(error){
      setStatus(error instanceof Error?error.message:'Unable to commit captured pedal events.');
    }
  }

  function discardCapturedPedal(){
    midiPedalCaptureRef.current=null;
    midiPedalSourceRef.current=null;
    setPendingPedalCount(0);
    setStatus('Uncommitted MIDI pedal take discarded; canonical piano clip unchanged.');
  }

  function handleMidiMessage(input:any,event:any){
    const data=Array.from(event?.data||[]) as number[];
    if(data.length<3)return;
    const sustain=decodeFoundryMidiSustain(data);
    if(sustain){
      const controllerKey=String(input?.id||'midi')+':'+sustain.channel;
      const owner=midiPedalSourceRef.current;
      // Never fuse conflicting MIDI devices/channels into one sustain take.
      if(owner&&owner!==controllerKey)return;
      if(!owner&&!sustain.down)return;
      const current=sessionRef.current;
      const trackId=selectedTrackRef.current,scene=selectedSceneRef.current;
      const target=current.tracks.find(candidate=>candidate.id===trackId);
      const targetClip=target?.clips[scene];
      if(!target||target.type!=='synth'||!targetClip){
        setStatus('CC64 ignored: select a pitched piano track.');
        return;
      }
      const sourceEvents=targetClip.provenance?.foundry_piano_pedal;
      const original=Array.isArray(sourceEvents)
        ? sourceEvents as Array<{step:number;down:boolean}>:[];
      const playingNow=Boolean(audioRef.current?.status.playing);
      const step=Math.max(0,Math.min(targetClip.steps.length-1,
        playingNow?Math.floor(playheadRef.current%targetClip.steps.length):
        (selectedPedalStepRef.current??0)));
      const pending=midiPedalCaptureRef.current;
      if(pending&&(pending.trackId!==trackId||pending.scene!==scene||
          pending.clipId!==targetClip.id)){
        setStatus('Finish or discard the buffered CC64 take before recording another clip.');
        return;
      }
      try{
        const before=pending?pending.events:original;
        const events=mergeFoundryMidiPedalEvent(before,targetClip.steps.length,step,sustain.down);
        midiPedalSourceRef.current=sustain.down?controllerKey:null;
        if(playingNow||pending){
          midiPedalCaptureRef.current=pending
            ? {...pending,events}
            : {trackId,scene,clipId:targetClip.id,original:structuredClone(original),events};
          setPendingPedalCount(events.length);
          setStatus('CC64 captured at step '+(step+1)+' · staged, not applied during playback. Stop then Commit Pedal Take.');
        }else if(JSON.stringify(events)!==JSON.stringify(original)){
          const result=applyPulseGridOperation(current,{
            type:'clip.set_foundry_piano_pedal',track_id:trackId,scene,events
          },'controller');
          sessionRef.current=result.session;
          setSession(result.session);
          setStatus('MIDI CC64 '+(sustain.down?'down':'up')+' · step '+(step+1)+' · reversible controller receipt.');
        }
      }catch(error){
        setStatus(error instanceof Error?error.message:'MIDI CC64 pedal event rejected.');
      }
      return;
    }
    const statusByte=Number(data[0])||0;
    const command=statusByte&0xf0;
    const channel=statusByte&0x0f;
    const pitch=Math.max(0,Math.min(127,Math.round(Number(data[1])||0)));
    const rawVelocity=Math.max(0,Math.min(127,Math.round(Number(data[2])||0)));
    const isNoteOn=command===0x90&&rawVelocity>0;
    const isNoteOff=command===0x80||(command===0x90&&rawVelocity===0);
    if(!isNoteOn&&!isNoteOff)return;

    const key=String(input?.id||'midi')+':'+channel+':'+pitch;
    if(isNoteOn){
      const current=sessionRef.current;
      const trackId=selectedTrackRef.current;
      const scene=selectedSceneRef.current;
      const targetTrack=current.tracks.find((candidate)=>candidate.id===trackId);
      if(!targetTrack||targetTrack.type!=='synth'){
        setStatus('Select a synth track before recording MIDI notes.');
        return;
      }
      const targetClip=targetTrack.clips[scene];
      if(!targetClip)return;
      heldMidiNotesRef.current.set(key,{
        trackId,
        scene,
        pitch,
        velocity:rawVelocity/127,
        startedAt:performance.now(),
        startStep:Math.max(0,Math.min(targetClip.steps.length-1,playheadRef.current%targetClip.steps.length)),
      });
      return;
    }

    const held=heldMidiNotesRef.current.get(key);
    if(!held)return;
    heldMidiNotesRef.current.delete(key);

    const current=sessionRef.current;
    const targetTrack=current.tracks.find((candidate)=>candidate.id===held.trackId);
    const targetClip=targetTrack?.clips[held.scene];
    if(!targetTrack||targetTrack.type!=='synth'||!targetClip)return;

    const elapsedMs=Math.max(1,performance.now()-held.startedAt);
    const stepMs=60000/Math.max(20,current.transport.bpm)/4;
    const maxLength=Math.max(.25,targetClip.steps.length-held.startStep);
    const length=Math.max(.25,Math.min(maxLength,elapsedMs/stepMs));

    try{
      const result=applyPulseGridOperation(current,{
        type:'note.add',
        track_id:held.trackId,
        scene:held.scene,
        note:{
          pitch:held.pitch,
          start:held.startStep,
          length,
          velocity:held.velocity,
          probability:1,
          microtiming:0,
        },
      },'controller');
      sessionRef.current=result.session;
      setSession(result.session);
      setStatus(
        'MIDI note committed · '+noteName(held.pitch)+' · '+
        length.toFixed(2)+' steps · '+Math.round(held.velocity*127)+' velocity'
      );
    }catch(error){
      setStatus(error instanceof Error?error.message:'MIDI note commit failed.');
    }
  }

  async function toggleMidi(){
    if(midiEnabled){
      const access=midiAccessRef.current;
      if(access){
        access.onstatechange=null;
        for(const input of access.inputs.values())input.onmidimessage=null;
      }
      midiAccessRef.current=null;
      heldMidiNotesRef.current.clear();
      midiPedalSourceRef.current=null;
      setMidiEnabled(false);
      setMidiInputs(0);
      setStatus('MIDI disconnected.');
      return;
    }

    const midiNavigator=navigator as Navigator&{
      requestMIDIAccess?:()=>Promise<any>;
    };
    if(typeof midiNavigator.requestMIDIAccess!=='function'){
      setStatus('Web MIDI is unavailable in this browser.');
      return;
    }

    try{
      const access=await midiNavigator.requestMIDIAccess();
      midiAccessRef.current=access;
      access.onstatechange=()=>bindMidiInputs(access);
      bindMidiInputs(access);
      setMidiEnabled(true);
    }catch(error){
      setStatus(error instanceof Error?error.message:'MIDI access failed.');
    }
  }

  function forkVariation(){
    const destination=(selectedScene+1)%track.clips.length;
    const result=apply({
      type:'clip.fork_variation',
      track_id:track.id,
      source_scene:selectedScene,
      destination_scene:destination,
      name:clip.name+' · Alt',
    },'human');
    if(result)setSelectedScene(destination);
  }

  function runLiftPlan(){
    const destination=(selectedScene+1)%track.clips.length;
    const operations:PulseGridOperation[]=[
      {
        type:'clip.fork_variation',
        track_id:track.id,
        source_scene:selectedScene,
        destination_scene:destination,
        name:clip.name+' · Lift',
      },
      {
        type:'clip.set_bars',
        track_id:track.id,
        scene:destination,
        bars:Math.max(2,clip.bars),
      },
      {
        type:'track.set_filter',
        track_id:track.id,
        filter_hz:Math.min(19000,Math.round(track.filterHz*1.18)),
      },
      {
        type:'track.set_delay_mix',
        track_id:track.id,
        mix:Math.min(.45,Number((track.delayMix+.08).toFixed(2))),
      },
    ];

    if(track.type==='synth'){
      operations.push({
        type:'note.add',
        track_id:track.id,
        scene:destination,
        note:{pitch:72,start:20,length:4,velocity:.94,probability:1,microtiming:0},
      });
    }else{
      operations.push({
        type:'clip.set_step',
        track_id:track.id,
        scene:destination,
        step:Math.min(20,Math.max(0,clip.steps.length-1)),
        velocity:1,
      });
    }

    try{
      const result=applyPulseGridTransaction(session,{
        intent:'Create a stronger alternate section without overwriting the source clip.',
        operations,
      },'agent');
      setSession(result.session);
      setSelectedScene(destination);
      setStatus('Atomic plan committed · '+result.child_receipts.length+' edits · '+String(result.receipt.transaction_id||'').slice(0,8));
    }catch(error){
      setStatus(error instanceof Error?error.message:'Atomic edit plan failed.');
    }
  }

  function editFoundryPedal(down:boolean|null){
    if(playing||recording){setStatus('Stop playback or recording before editing the piano pedal.');return;}
    if(midiPedalCaptureRef.current){setStatus('Commit or discard the buffered MIDI pedal take before hand-editing.');return;}
    if(track.type!=='synth'){setStatus('Recorded piano pedal events require a pitched instrument track.');return;}
    const step=Math.max(0,Math.min(clip.steps.length-1,selectedStepIndex??0));
    const existing=Array.isArray(clip.provenance?.foundry_piano_pedal)
      ? clip.provenance.foundry_piano_pedal as Array<{step:number;down:boolean}>:[];
    try{
      const events=down===null
        ? removeFoundryMidiPedalEvent(existing,clip.steps.length,step)
        : mergeFoundryMidiPedalEvent(existing,clip.steps.length,step,down);
      if(JSON.stringify(events)===JSON.stringify(existing)){
        setStatus('No pedal change at selected step.');
        return;
      }
      apply({type:'clip.set_foundry_piano_pedal',track_id:track.id,scene:selectedScene,events},'human');
    }catch(error){
      setStatus(error instanceof Error?error.message:'Piano pedal edit rejected.');
    }
  }

  function selectOrCreateNote(pitch:number,step:number){
    setSelectedStepIndex(step);
    const existing=clip.notes.find((note)=>note.pitch===pitch&&Math.round(note.start)===step);
    if(existing){
      setSelectedNoteId(existing.id);
      setStatus('Selected '+noteName(existing.pitch)+' · step '+String(Math.round(existing.start)+1));
      return;
    }
    const result=apply({
      type:'note.add',
      track_id:track.id,
      scene:selectedScene,
      note:{pitch,start:step,length:1,velocity:.78,probability:1,microtiming:0},
    });
    const created=result?.receipt.after as {id?:string}|null|undefined;
    if(created?.id)setSelectedNoteId(created.id);
  }

  function deleteNote(noteId:string){
    const result=apply({type:'note.delete',track_id:track.id,scene:selectedScene,note_id:noteId});
    if(result&&selectedNoteId===noteId)setSelectedNoteId(null);
  }

  function setNoteExpression(values:{velocity?:number;probability?:number;microtiming?:number}){
    if(!selectedNote)return;
    apply({
      type:'note.set_expression',
      track_id:track.id,
      scene:selectedScene,
      note_id:selectedNote.id,
      ...values,
    });
  }

  function resizeSelectedNote(length:number){
    if(!selectedNote)return;
    apply({
      type:'note.resize',
      track_id:track.id,
      scene:selectedScene,
      note_id:selectedNote.id,
      length,
    });
  }

  function moveNote(noteId:string,pitch:number,start:number){
    const occupied=clip.notes.some((candidate)=>
      candidate.id!==noteId &&
      candidate.pitch===pitch &&
      Math.round(candidate.start)===Math.round(start)
    );
    if(occupied){
      setStatus('That piano-roll cell already contains a note.');
      setDraggedNoteId(null);
      return;
    }
    const result=apply({
      type:'note.move',
      track_id:track.id,
      scene:selectedScene,
      note_id:noteId,
      start,
      pitch,
    });
    if(result){
      setSelectedNoteId(noteId);
      setDraggedNoteId(null);
    }
  }

  function moveSelectedNote(values:{pitch?:number;start?:number}){
    if(!selectedNote)return;
    moveNote(
      selectedNote.id,
      values.pitch??selectedNote.pitch,
      values.start??selectedNote.start,
    );
  }

  function commitAutomationPoint(step:number,value:number){
    apply({
      type:'clip.set_automation_point',
      track_id:track.id,
      scene:selectedScene,
      parameter:automationParam,
      step,
      value,
    });
  }

  function selectStep(step:number){
    setSelectedStepIndex(step);
    if(clip.steps[step]<=0){
      apply({
        type:'clip.set_step',
        track_id:track.id,
        scene:selectedScene,
        step,
        velocity:.82,
      });
      return;
    }
    setStatus(
      'Selected step '+String(step+1)+' · velocity '+Math.round(clip.steps[step]*127)+
      ' · probability '+Math.round((clip.probabilities[step]??1)*100)+'%'
    );
  }

  function clearStep(step:number){
    const result=apply({
      type:'clip.set_step',
      track_id:track.id,
      scene:selectedScene,
      step,
      velocity:0,
    });
    if(result)setSelectedStepIndex(step);
  }

  function commitStepExpression(values:{velocity?:number;probability?:number;microtiming?:number}){
    if(selectedStepIndex===null)return;
    apply({
      type:'clip.set_step_expression',
      track_id:track.id,
      scene:selectedScene,
      step:selectedStepIndex,
      ...values,
    });
  }

  function setArrangementSlot(trackId:string,bar:number,value:string){
    apply({
      type:'arrangement.set_slot',
      track_id:trackId,
      bar,
      scene:value===''?null:Number(value),
    });
  }

  function growClip(){
    apply({
      type:'clip.set_bars',
      track_id:track.id,
      scene:selectedScene,
      bars:Math.min(16,clip.bars+1),
    });
  }

  function undo(){
    if(!undoable){
      setStatus('Nothing reversible is waiting.');
      return;
    }
    try{
      const result=undoPulseGridReceipt(session,undoable.id,'human');
      setSession(result.session);
      setStatus('Undid '+undoable.operation+' · receipt '+result.receipt.id.slice(0,8));
    }catch(error){
      setStatus(error instanceof Error?error.message:'Undo failed.');
    }
  }

  function exportSession(){
    const blob=new Blob([JSON.stringify(session,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;
    anchor.download=(session.project_name.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'fallen-session')+'.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('Canonical session graph exported.');
  }

  function reset(){
    audioRef.current?.stop();
    setPlaying(false);
    setPlayhead(0);
    const next=createPulseGridSession('First Light');
    setSession(next);
    setSelectedTrackId('keys');
    setSelectedScene(0);
    setStatus('New canonical session created.');
  }

  const musicInsights=useMemo(()=>analyzePulseGridMusic(session,selectedScene),[session,selectedScene]);
  const counterpointEvidence=useMemo(()=>analyzePulseGridCounterpoint(session,selectedScene),[session,selectedScene]);
  const arrangementArc=useMemo(()=>analyzePulseGridArrangementArc(session,selectedScene),[session,selectedScene]);
  const pianoTailAudit=useMemo(()=>analyzeFoundryPianoTailCoverage(session,selectedScene),[session,selectedScene]);
  const visibleSteps=clip.steps.map((_,index)=>index);
  const automationValues=clip.automation[automationParam];
  const arrangementBars=Array.from({length:session.arrangement[0]?.length||16},(_,index)=>index);
  const latestReceipts=[...session.receipts].slice(-10).reverse();

  return (
    <main className="fallenSessions">
      <header className="fsTop">
        <div>
          <div className="fsEyebrow">EVERCRAFT · FALLEN · PULSEGRID</div>
          <h1>Fallen Sessions</h1>
          <p>One music graph for the musician, controllers, code and agents.</p>
        </div>
        <div className="fsTruth">
          <span>Engine {PULSEGRID_ENGINE_VERSION}</span>
          <span>Clock {audioStatus.clock_mode}</span>
          <span>{audioStatus.latency_ms===null?'Latency cold':'Latency '+audioStatus.latency_ms+' ms'}</span>
          <span>{audioStatus.track_buses} DSP buses</span>
          <span>{audioStatus.cached_audio_assets} audio asset{audioStatus.cached_audio_assets===1?'':'s'} cached</span>
          <span>{midiEnabled?(midiInputs+' MIDI input'+(midiInputs===1?'':'s')):'MIDI off'}</span>
          <span>Local-first</span>
          <span>Engine alpha · not for sale</span>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(event)=>{const file=event.target.files?.[0];if(file)void importAudioFile(file)}}
      />
      <input
        ref={foundryInputRef}
        type="file"
        accept=".wav,audio/wav,audio/x-wav,audio/wave"
        hidden
        onChange={(event)=>{const file=event.target.files?.[0];if(file)void importFoundryWavFile(file)}}
      />
      <section className="fsToolbar" aria-label="Session controls">
        <button onClick={togglePlay} disabled={recording}>{playing?'■ Stop':'▶ Play'}</button>
        <button onClick={toggleRecording}>{recording?'■ Stop Recording':'● Record'}</button>
        <button onClick={toggleMidi}>{midiEnabled?'Disconnect MIDI':'Enable MIDI'}</button>
        <button onClick={chooseAudioFile} disabled={recording}>Import Audio</button>
        <button onClick={()=>foundryInputRef.current?.click()} disabled={recording}>Import Foundry WAV</button>
        <label className="fsFoundryRootLabel">Piano root MIDI
          <input aria-label="Foundry piano root MIDI note" type="number" min={21} max={108}
            value={foundryRootPitch} onChange={(event)=>setFoundryRootPitch(Number(event.target.value))}/>
        </label>
        <label className="fsFoundryRootLabel">Velocity min
          <input aria-label="Foundry minimum sample velocity" type="number" min={0} max={1} step={0.05}
            value={foundryVelocityMin} onChange={(event)=>setFoundryVelocityMin(Number(event.target.value))}/>
        </label>
        <label className="fsFoundryRootLabel">Velocity max
          <input aria-label="Foundry maximum sample velocity" type="number" min={0} max={1} step={0.05}
            value={foundryVelocityMax} onChange={(event)=>setFoundryVelocityMax(Number(event.target.value))}/>
        </label>
        <button onClick={()=>void armFoundryPianoFromTake()} disabled={recording}>Arm Recorded Piano</button>
        <button onClick={runLiftPlan}>✦ Atomic Chorus Lift</button>
        <button onClick={forkVariation}>Fork Variation</button>
        <button onClick={growClip} disabled={clip.bars>=16}>+ Bar</button>
        <button onClick={undo} disabled={!undoable}>Undo</button>
        <button onClick={exportSession}>Export Graph</button>
        <button onClick={reset}>New Session</button>
      </section>

      <div className="fsStatus">{status}</div>
      <details className="fsMusicInsights">
        <summary>Music Theory Lab · Scene {selectedScene+1} · {musicInsights.note_count} pitched notes</summary>
        <p className="fsMusicInsightCaution">Observations for your ears to evaluate. No inferred key,
          originality score, automatic composition edits or publishing clearance.</p>
        <div className="fsMusicInsightStats">
          <span>Parts {musicInsights.pitched_track_count}</span>
          <span>Prominent MIDI pitch classes {musicInsights.prominent_pitch_classes.map(item=>item.pitch_class).join(' · ')||'none'}</span>
          <span>Register overlaps {musicInsights.register_proximity_examples}</span>
          <span>Between-note rests {musicInsights.track_profiles.reduce((sum,part)=>sum+part.rest_gap_count,0)}</span>
        </div>
        <p className="fsMusicInsightCaution">Complete chromatic evidence (12 classes, note count / duration-weighted MIDI velocity;
          zero means absent, not an inferred key): {musicInsights.pitch_class_evidence.map(item=>
            item.pitch_class+': '+item.note_count+' / '+item.weight.toFixed(3)).join(' · ')}</p>
        {musicInsights.track_profiles.filter(part=>part.rest_gap_count>0).map(part=>(
          <p key={'rest-'+part.track_id} className="fsMusicInsightCaution">
            {part.track_id}: {part.rest_gap_count} measured gaps, longest {part.longest_rest_steps.toFixed(2)} steps.
            Consider whether they give another voice space or heighten anticipation.
          </p>
        ))}
        {musicInsights.findings.map((finding,index)=>(
          <p key={finding.kind+'-'+index}><strong>{finding.observation}</strong> {finding.recommendation}</p>
        ))}
        <p className="fsMusicInsightCaution">Dynamic arc by quarter: {musicInsights.velocity_arc.map(q=>
          q.mean_note_velocity.toFixed(2)).join(' · ')}. Velocity is not a loudness measurement.</p>
        <div className="fsMusicInsightStats" aria-label="Counterpoint and motion analysis">
          <span>Aligned voice onsets {counterpointEvidence.simultaneous_single_note_onsets}</span>
          <span>Contrary motions {counterpointEvidence.motion_summary.contrary}</span>
          <span>Parallel fifths {counterpointEvidence.motion_summary.parallel_fifths}</span>
          <span>Parallel octaves/unisons {counterpointEvidence.motion_summary.parallel_octaves_or_unisons}</span>
        </div>
        {counterpointEvidence.findings.map((finding,index)=>(
          <p key={'counterpoint-'+finding.kind+'-'+index}>
            <strong>{finding.observation}</strong> {finding.recommendation}
          </p>
        ))}
        <p className="fsMusicInsightCaution">Counterpoint evidence is limited to aligned, unambiguous single-note onsets.
          No voice identity is assumed for chords or overlapping notes. Classical parallel intervals are not universal errors.</p>

        <details className="fsPedalPanel">
          <summary>Recorded Piano · Sustain Pedal</summary>
          <p className="fsMusicInsightCaution">Choose a pedal step without creating or changing a piano note. The recorded piano can defer key-off only within its actual WAV and clip duration.</p>
          <label className="fsPedalStepLabel">Pedal step
            <input aria-label="Piano pedal event step" type="number" min={1} max={clip.steps.length}
              value={(selectedStepIndex??0)+1}
              onChange={event=>setSelectedStepIndex(Math.max(0,Math.min(clip.steps.length-1,Math.round(Number(event.target.value)||1)-1)))}/>
            <span>of {clip.steps.length}</span>
          </label>
          <div className="fsPedalActions">
            <button type="button" disabled={playing||recording||track.type!=='synth'}
              onClick={()=>editFoundryPedal(true)}>Pedal down</button>
            <button type="button" disabled={playing||recording||track.type!=='synth'}
              onClick={()=>editFoundryPedal(false)}>Pedal up</button>
            <button type="button" disabled={playing||recording||track.type!=='synth'}
              onClick={()=>editFoundryPedal(null)}>Remove step event</button>
          </div>
          <p className="fsMusicInsightCaution">MIDI CC64 (keyboard pedal): 0–63 up, 64–127 down. While playing, events are buffered so edits cannot interrupt authorized sample playback; stop and explicitly commit or discard the take. No live acoustic damper response is asserted.</p>
          <div className="fsPedalActions">
            <button type="button" disabled={playing||!midiPedalCaptureRef.current}
              onClick={commitCapturedPedal}>Commit Pedal Take</button>
            <button type="button" disabled={!midiPedalCaptureRef.current}
              onClick={discardCapturedPedal}>Discard Take</button>
            <span className="fsPedalPending">{pendingPedalCount} proposed timeline transition{pendingPedalCount===1?'':'s'}</span>
          </div>
          <p className="fsMusicInsightCaution">Authored events: {Array.isArray(clip.provenance?.foundry_piano_pedal)&&clip.provenance.foundry_piano_pedal.length
            ? (clip.provenance.foundry_piano_pedal as Array<{step:number;down:boolean}>)
              .map(event=>'step '+(event.step+1)+' '+(event.down?'down':'up')).join(' · ')
            :'none (default pedal up)'}. This is CC64 score capture, not device-audible verification, physical sympathetic resonance, or half-pedal modeling.</p>
        </details>

        <details className="fsTailPanel">
          <summary>Recorded Piano Tail Budget · {pianoTailAudit.total_findings} flag{pianoTailAudit.total_findings===1?'':'s'}</summary>
          <p className="fsMusicInsightCaution">Read-only score-vs-recording-duration estimate. Asset duration is metadata, not yet measured from decoded browser audio. This does not measure true acoustic decay, room sound, loudness, recording rights or human listening quality. Muted and probabilistic written notes are included.</p>
          <p className="fsMusicInsightCaution">Actual browser decoded-sample check this Play: {audioStatus.decoded_sample_tail_warnings??0} scheduled recorded-piano voice{(audioStatus.decoded_sample_tail_warnings??0)===1?'':'s'} lacking full hold/release audio, including {audioStatus.decoded_key_hold_shortfalls??0} cut short before key/pedal release. The counts reset at each Play and can repeat when a clip loops; zero is not a listening-quality certificate.</p>
          <p className="fsMusicInsightCaution">Decoded-PCM attack decisions this Play: {audioStatus.decoded_fast_attack_voices??0} zero-aligned notes received a fast 0.5 ms onset; {audioStatus.decoded_cut_in_guard_voices??0} abrupt sample starts received a 3 ms protective microfade. Other notes use bounded or uninspected attack guards. This is scheduling evidence, not human-rated sound quality.</p>
          <p className="fsMusicInsightCaution">Pre-roll alignment this Play: {audioStatus.decoded_preroll_aligned_voices??0} recorded-piano voice{(audioStatus.decoded_preroll_aligned_voices??0)===1?'':'s'} began past confidently detected operator silence. Other voices were left at the original WAV boundary. The source PCM is never changed, and a corrected MIDI onset is not an audible quality certificate.</p>
          <p className="fsMusicInsightCaution">Sampled-piano chord overlap this Play: {audioStatus.sampled_piano_max_overlap??0} simultaneous voice{(audioStatus.sampled_piano_max_overlap??0)===1?'':'s'} across {audioStatus.sampled_piano_scheduled_voices??0} recorded-note event{(audioStatus.sampled_piano_scheduled_voices??0)===1?'':'s'}. Pre-effects summed voice-gain proxy: {(audioStatus.sampled_piano_gain_sum_proxy??0).toFixed(2)}. {audioStatus.sampled_piano_observations_complete===false?'Observation limit exceeded, incomplete. ':''}{audioStatus.sampled_piano_overlap_review?'Review dense-chord headroom by listening. ':'No sampled-voice gain-sum threshold triggered. '}These figures do not measure actual PCM peaks, DSP output clipping or perceived loudness; no voice has been compressed or dropped.</p>
          <div className="fsPedalActions">
            <button type="button" disabled={playing||recording||!(audioStatus.sampled_piano_scheduled_voices??0)}
              onClick={()=>setDryPcmAudit(audioRef.current?.auditRecordedPianoDryPeak()||null)}>
              Inspect decoded chord PCM
            </button>
          </div>
          {dryPcmAudit&&<div className="fsDryPeakReport" role="status">
            {dryPcmAudit.status==='unavailable'
              ? <p>PCM inspection unavailable: {dryPcmAudit.reason}. No clean peak is claimed.</p>
              : <>
                <p>Decoded piano-only dry sample peak: <strong>{dryPcmAudit.sample_peak?.toFixed(3)}</strong> ({dryPcmAudit.peak_dbfs?.toFixed(2)} dBFS). Above-full-scale PCM frames in this approximation: <strong>{dryPcmAudit.over_full_scale_frames}</strong>. Analyzed {dryPcmAudit.analyzed_voices} scheduled voices at {dryPcmAudit.rate} Hz for {dryPcmAudit.window_sec?.toFixed(2)} seconds.</p>
                <p className="fsMusicInsightCaution">{dryPcmAudit.complete?'Selected audition voices fit inside the measured window.':'Partial window only; later notes or releases were not fully covered.'} This reconstructs original decoded sample data and note-gain envelopes before filters, track buses, effects and master gain. It does not measure actual speaker output, intersample true peaks or final-master loudness. No automatic compression or gain adjustment is applied.</p>
              </>}
          </div>}

          <div className="fsTailStats" role="group" aria-label="Recorded piano sample tail estimates">
            <span><strong>{pianoTailAudit.mapped_notes}/{pianoTailAudit.authored_notes}</strong> mapped MIDI notes</span>
            <span><strong>{pianoTailAudit.key_hold_shortfalls}</strong> note-hold shortfalls</span>
            <span><strong>{pianoTailAudit.release_tail_shortfalls}</strong> release-tail shortfalls</span>
            <span><strong>{pianoTailAudit.unknown_rights_note_uses}</strong> note uses with unknown rights</span>
          </div>
          {pianoTailAudit.total_findings===0
            ? <p>No metadata-duration shortages found in the authored sampled-piano notes of this scene. This is not an audible pass or rights clearance.</p>
            : <div className="fsTailFindings" role="list" aria-label="Piano sample coverage issues">
              {pianoTailAudit.findings.map((finding,index)=>(
                <div key={finding.track_id+'-'+finding.start_step+'-'+finding.pitch+'-'+index} className="fsTailFinding" role="listitem">
                  <strong>{finding.track_id} · {noteName(finding.pitch)} · step {finding.start_step+1}</strong>
                  <span>{finding.kind==='key_hold_shortfall'?'Recording cuts off during hold':
                    finding.kind==='release_tail_shortfall'?'Release recording too short':'Missing mapped recording'}{finding.shortfall_seconds!==null?' · '+finding.shortfall_seconds.toFixed(3)+'s estimated':''}</span>
                  <small>{finding.note}</small>
                </div>
              ))}
              {pianoTailAudit.total_findings>pianoTailAudit.findings.length&&
                <p className="fsMusicInsightCaution">Showing first {pianoTailAudit.findings.length} of {pianoTailAudit.total_findings} issues, ranked by potential disruption.</p>}
            </div>}
        </details>

        <details className="fsArcDetails">
          <summary>Arrangement Arc · {arrangementArc.bar_count} bars</summary>
          <p className="fsMusicInsightCaution">Read-only written MIDI evidence, including muted and probabilistic notes. Not measured acoustic loudness, emotion, drums, audio clips or effect tails.</p>
          <div className="fsArcTimeline" role="list" aria-label="Written MIDI arrangement by bar">
            {arrangementArc.bars.map(bar=>(
              <div key={bar.bar} role="listitem" className={'fsArcBar '+(bar.score_silent?'silent':'')}>
                <strong>Bar {bar.bar}</strong>
                <span>{bar.midi_onsets} note attacks · {bar.sounding_parts} parts</span>
                <small>{bar.first_entrances.length?'First entrance: '+bar.first_entrances.join(', '):
                  bar.reentries.length?'Re-entry: '+bar.reentries.join(', '):
                  bar.score_silent?'No sounding pitched MIDI':'Mean velocity: '+(bar.mean_onset_velocity===null?'no new attacks':bar.mean_onset_velocity.toFixed(2))}</small>
              </div>
            ))}
          </div>
          {arrangementArc.observations.map(note=>(
            <p key={note.kind}><strong>{note.observation}</strong> {note.listening_prompt}</p>
          ))}
        </details>

      </details>

      <section className="fsWorkspace">
        <aside className="fsTracks">
          <div className="fsSectionTitle">Tracks + scenes</div>
          {session.tracks.map((candidate)=>(
            <div className={'fsTrack '+(candidate.id===track.id?'active':'')} key={candidate.id}>
              <button className="fsTrackName" onClick={()=>setSelectedTrackId(candidate.id)}>
                <strong>{candidate.name}</strong>
                <span>{candidate.type} · filter {Math.round(candidate.filterHz)} Hz · delay {Math.round(candidate.delayMix*100)}%</span>
              </button>
              <div className="fsScenes">
                {candidate.clips.map((candidateClip,scene)=>(
                  <button
                    key={candidateClip.id}
                    className={candidate.id===track.id&&scene===selectedScene?'active':''}
                    onClick={()=>{setSelectedTrackId(candidate.id);setSelectedScene(scene)}}
                  >
                    {scene+1}
                    <small>{candidateClip.bars}b · {candidateClip.notes.length}n{candidateClip.audio_asset_id?' · audio':''}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>

        <section className="fsEditor">
          <div className="fsEditorHead">
            <div>
              <div className="fsSectionTitle">{track.name} · Scene {selectedScene+1}</div>
              <h2>{clip.name}</h2>
            </div>
            <div className="fsClipMeta">
              <span>{clip.bars} bar{clip.bars===1?'':'s'}</span>
              <span>{clip.steps.length} steps</span>
              <span>{clip.notes.length} notes</span>
            </div>
          </div>

          {track.type==='synth'?(
            <div className="fsRollWrap">
              <div className="fsPianoRoll" style={{gridTemplateColumns:'58px repeat('+visibleSteps.length+',24px)'}}>
                {PITCHES.flatMap((pitch)=>{
                  const cells:React.ReactNode[]=[
                    <div className="fsKey" key={'key-'+pitch}>{noteName(pitch)}</div>
                  ];
                  for(const step of visibleSteps){
                    const note=clip.notes.find((candidate)=>candidate.pitch===pitch&&Math.round(candidate.start)===step);
                    cells.push(
                      <button
                        key={pitch+'-'+step}
                        className={'fsNoteCell '+(note?'active ':'')+(note?.id===selectedNoteId?'selected ':'')+(note?.id===draggedNoteId?'dragging ':'')+(step%4===0?'beat ':'')+(playing&&step===playhead?'playhead':'')}
                        title={note?(noteName(pitch)+' · step '+(step+1)+' · drag to move · double-click to delete'):(noteName(pitch)+' · step '+(step+1))}
                        draggable={Boolean(note)}
                        onDragStart={(event)=>{
                          if(!note)return;
                          setDraggedNoteId(note.id);
                          setSelectedNoteId(note.id);
                          event.dataTransfer.effectAllowed='move';
                          event.dataTransfer.setData('text/plain',note.id);
                        }}
                        onDragEnd={()=>setDraggedNoteId(null)}
                        onDragOver={(event)=>{
                          if(!draggedNoteId)return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect='move';
                        }}
                        onDrop={(event)=>{
                          if(!draggedNoteId)return;
                          event.preventDefault();
                          moveNote(draggedNoteId,pitch,step);
                        }}
                        onClick={()=>selectOrCreateNote(pitch,step)}
                        onDoubleClick={()=>{if(note)deleteNote(note.id)}}
                      />
                    );
                  }
                  return cells;
                })}
              </div>
              {selectedNote&&(
                <div className="fsNoteInspector">
                  <div className="fsSectionTitle">Selected note · {noteName(selectedNote.pitch)}</div>
                  <label>
                    <span>Start step</span>
                    <input
                      type="number"
                      min={1}
                      max={clip.steps.length}
                      step={1}
                      value={Math.round(selectedNote.start)+1}
                      onChange={(event)=>moveSelectedNote({start:Number(event.target.value)-1})}
                    />
                  </label>
                  <label>
                    <span>Pitch {noteName(selectedNote.pitch)}</span>
                    <input
                      type="number"
                      min={0}
                      max={127}
                      step={1}
                      value={selectedNote.pitch}
                      onChange={(event)=>moveSelectedNote({pitch:Number(event.target.value)})}
                    />
                  </label>
                  <label>
                    <span>Length</span>
                    <input
                      type="number"
                      min={0.25}
                      max={Math.max(.25,clip.steps.length-selectedNote.start)}
                      step={0.25}
                      value={Number(selectedNote.length.toFixed(2))}
                      onChange={(event)=>resizeSelectedNote(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>Velocity {Math.round(selectedNote.velocity*127)}</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={selectedNote.velocity}
                      onChange={(event)=>setNoteExpression({velocity:Number(event.target.value)})}
                    />
                  </label>
                  <label>
                    <span>Probability {Math.round(selectedNote.probability*100)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={selectedNote.probability}
                      onChange={(event)=>setNoteExpression({probability:Number(event.target.value)})}
                    />
                  </label>
                  <label>
                    <span>Microtiming {Math.round(selectedNote.microtiming)} ms</span>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      step={1}
                      value={selectedNote.microtiming}
                      onChange={(event)=>setNoteExpression({microtiming:Number(event.target.value)})}
                    />
                  </label>
                  <button onClick={()=>deleteNote(selectedNote.id)}>Delete note</button>
                </div>
              )}
            </div>
          ):track.type==='drums'?(
            <div className="fsStepEditor">
              <div className="fsStepGrid">
                {visibleSteps.map((step)=>(
                  <button
                    key={step}
                    className={'fsStep '+(clip.steps[step]>0?'active ':'')+(selectedStepIndex===step?'selected ':'')+(step%4===0?'beat ':'')+(playing&&step===playhead?'playhead':'')}
                    onClick={()=>selectStep(step)}
                    onDoubleClick={()=>clearStep(step)}
                    title={
                      'Step '+(step+1)+
                      ' · velocity '+clip.steps[step].toFixed(2)+
                      ' · probability '+Math.round((clip.probabilities[step]??1)*100)+'%'+
                      ' · microtiming '+Math.round(clip.microtiming[step]??0)+'ms'
                    }
                  >
                    {step+1}
                  </button>
                ))}
              </div>
              {selectedStepIndex!==null&&(
                <div className="fsNoteInspector fsStepInspector">
                  <div className="fsSectionTitle">Selected step · {selectedStepIndex+1}</div>
                  <label>
                    <span>Velocity {Math.round((clip.steps[selectedStepIndex]??0)*127)}</span>
                    <input
                      key={'step-velocity-'+selectedStepIndex+'-'+clip.steps[selectedStepIndex]}
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      defaultValue={clip.steps[selectedStepIndex]??0}
                      onPointerUp={(event)=>commitStepExpression({velocity:Number(event.currentTarget.value)})}
                      onKeyUp={(event)=>commitStepExpression({velocity:Number(event.currentTarget.value)})}
                    />
                  </label>
                  <label>
                    <span>Probability {Math.round((clip.probabilities[selectedStepIndex]??1)*100)}%</span>
                    <input
                      key={'step-probability-'+selectedStepIndex+'-'+clip.probabilities[selectedStepIndex]}
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      defaultValue={clip.probabilities[selectedStepIndex]??1}
                      onPointerUp={(event)=>commitStepExpression({probability:Number(event.currentTarget.value)})}
                      onKeyUp={(event)=>commitStepExpression({probability:Number(event.currentTarget.value)})}
                    />
                  </label>
                  <label>
                    <span>Microtiming {Math.round(clip.microtiming[selectedStepIndex]??0)} ms</span>
                    <input
                      key={'step-microtime-'+selectedStepIndex+'-'+clip.microtiming[selectedStepIndex]}
                      type="range"
                      min={-100}
                      max={100}
                      step={1}
                      defaultValue={clip.microtiming[selectedStepIndex]??0}
                      onPointerUp={(event)=>commitStepExpression({microtiming:Number(event.currentTarget.value)})}
                      onKeyUp={(event)=>commitStepExpression({microtiming:Number(event.currentTarget.value)})}
                    />
                  </label>
                  <button onClick={()=>clearStep(selectedStepIndex)}>Clear step</button>
                </div>
              )}
            </div>
          ):(
            <div className="fsAudioClipState">
              <div className="fsSectionTitle">Canonical audio clip</div>
              <strong>{clip.audio_asset_id?'Verified asset attached':'No audio asset attached'}</strong>
              <p>{clip.audio_asset_id?clip.audio_asset_id:'Import or record audio to attach verified bytes to this scene.'}</p>
            </div>
          )}

          <div className="fsAutomation">
            <div className="fsAutomationHead">
              <div>
                <div className="fsSectionTitle">Clip automation</div>
                <strong>{automationParam==='volume'?'Track volume':'Filter scale'}</strong>
              </div>
              <label>
                <span>Lane</span>
                <select
                  value={automationParam}
                  onChange={(event)=>setAutomationParam(event.target.value as 'volume'|'filter')}
                >
                  <option value="volume">Track volume</option>
                  <option value="filter">Filter scale</option>
                </select>
              </label>
            </div>
            <div className="fsAutomationLane" aria-label={automationParam+' automation'}>
              {visibleSteps.map((step)=>{
                const value=automationValues[step]??1;
                return (
                  <label className="fsAutomationPoint" key={clip.id+'-'+automationParam+'-'+step+'-'+value}>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      defaultValue={value}
                      aria-label={automationParam+' automation step '+String(step+1)}
                      onPointerUp={(event)=>commitAutomationPoint(step,Number(event.currentTarget.value))}
                      onKeyUp={(event)=>commitAutomationPoint(step,Number(event.currentTarget.value))}
                    />
                    <small>{step+1}</small>
                  </label>
                );
              })}
            </div>
            <p className="fsAutomationHint">
              Drag a point, then release to commit one canonical receipt. Keyboard changes commit on key release.
            </p>
          </div>

          <div className="fsArrangement">
            <div className="fsArrangementHead">
              <div>
                <div className="fsSectionTitle">Canonical arrangement</div>
                <strong>16-bar commitment timeline</strong>
              </div>
              <p>Timeline slots are receipt-backed now. Transport remains scene playback until the arrangement scheduler lands.</p>
            </div>
            <div className="fsArrangementScroll">
              <table>
                <thead>
                  <tr>
                    <th>Track</th>
                    {arrangementBars.map((bar)=><th key={'arr-head-'+bar}>{bar+1}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {session.tracks.map((arrangementTrack,trackIndex)=>(
                    <tr key={'arr-'+arrangementTrack.id}>
                      <th>{arrangementTrack.name}</th>
                      {arrangementBars.map((bar)=>{
                        const assigned=session.arrangement[trackIndex]?.[bar]??null;
                        return (
                          <td key={arrangementTrack.id+'-'+bar}>
                            <select
                              aria-label={arrangementTrack.name+' arrangement bar '+String(bar+1)}
                              value={assigned===null?'':String(assigned)}
                              onChange={(event)=>setArrangementSlot(arrangementTrack.id,bar,event.target.value)}
                            >
                              <option value="">—</option>
                              {arrangementTrack.clips.map((arrangementClip,scene)=>(
                                <option key={arrangementClip.id} value={scene}>S{scene+1}</option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="fsProvenance">
            <strong>Clip provenance</strong>
            <code>{JSON.stringify(clip.provenance)}</code>
          </div>
        </section>

        <aside className="fsReceipts">
          <div className="fsSectionTitle">Receipts</div>
          <div className="fsReceiptSummary">
            <strong>{session.receipts.length}</strong>
            <span>graph mutations recorded</span>
          </div>
          {latestReceipts.length===0&&<p className="fsMuted">Edit the session and the audit trail appears here.</p>}
          {latestReceipts.map((receipt)=>(
            <article className="fsReceipt" key={receipt.id}>
              <div><strong>{receipt.operation}</strong><span>{receipt.actor}</span></div>
              {receipt.intent&&<p>{receipt.intent}</p>}
              <small>{receipt.transaction_id?'tx '+receipt.transaction_id.slice(0,8)+' · ':''}{receipt.id.slice(0,8)}</small>
            </article>
          ))}
        </aside>
      </section>
    </main>
  );
}
