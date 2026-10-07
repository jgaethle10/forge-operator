import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PULSEGRID_ENGINE_VERSION,
  PulseGridAudioEngine,
  applyPulseGridOperation,
  applyPulseGridTransaction,
  createPulseGridSession,
  undoPulseGridReceipt,
  type PulseGridActor,
  type PulseGridOperation,
  type PulseGridSession,
} from '../systemia/media-studio/pulsegrid-browser';
import './fallen-sessions.css';

const PITCHES=Array.from({length:13},(_,index)=>72-index);
const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function noteName(pitch:number){
  return NOTE_NAMES[pitch%12]+String(Math.floor(pitch/12)-1);
}

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
  const [selectedScene,setSelectedScene]=useState(0);
  const [status,setStatus]=useState('Canonical PulseGrid session ready.');
  const [playing,setPlaying]=useState(false);
  const [playhead,setPlayhead]=useState(0);
  const audioRef=useRef<PulseGridAudioEngine|null>(null);
  if(!audioRef.current){
    audioRef.current=new PulseGridAudioEngine();
    audioRef.current.onStep=(step)=>setPlayhead(step);
  }

  const track=useMemo(
    ()=>session.tracks.find((candidate)=>candidate.id===selectedTrackId)||session.tracks[0],
    [session,selectedTrackId],
  );
  const clip=track.clips[selectedScene];
  const undoable=latestUndoableReceipt(session);

  useEffect(()=>{
    audioRef.current?.updateSession(session);
  },[session]);

  useEffect(()=>{
    audioRef.current?.setScene(selectedScene);
  },[selectedScene]);

  useEffect(()=>()=>{ void audioRef.current?.close(); },[]);

  async function togglePlay(){
    if(playing){
      audioRef.current?.stop();
      setPlaying(false);
      setPlayhead(0);
      setStatus('Playback stopped.');
      return;
    }
    try{
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

  function toggleNote(pitch:number,step:number){
    const existing=clip.notes.find((note)=>note.pitch===pitch&&Math.round(note.start)===step);
    if(existing){
      apply({type:'note.delete',track_id:track.id,scene:selectedScene,note_id:existing.id});
    }else{
      apply({
        type:'note.add',
        track_id:track.id,
        scene:selectedScene,
        note:{pitch,start:step,length:1,velocity:.78,probability:1,microtiming:0},
      });
    }
  }

  function toggleStep(step:number){
    apply({
      type:'clip.set_step',
      track_id:track.id,
      scene:selectedScene,
      step,
      velocity:clip.steps[step]>0?0:.82,
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

  const visibleSteps=clip.steps.map((_,index)=>index);
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
          <span>Local-first</span>
          <span>Engine alpha · not for sale</span>
        </div>
      </header>

      <section className="fsToolbar" aria-label="Session controls">
        <button onClick={togglePlay}>{playing?'■ Stop':'▶ Play'}</button>
        <button onClick={runLiftPlan}>✦ Atomic Chorus Lift</button>
        <button onClick={forkVariation}>Fork Variation</button>
        <button onClick={growClip} disabled={clip.bars>=16}>+ Bar</button>
        <button onClick={undo} disabled={!undoable}>Undo</button>
        <button onClick={exportSession}>Export Graph</button>
        <button onClick={reset}>New Session</button>
      </section>

      <div className="fsStatus">{status}</div>

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
                    <small>{candidateClip.bars}b · {candidateClip.notes.length}n</small>
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
                        className={'fsNoteCell '+(note?'active ':'')+(step%4===0?'beat ':'')+(playing&&step===playhead?'playhead':'')}
                        title={noteName(pitch)+' · step '+(step+1)}
                        onClick={()=>toggleNote(pitch,step)}
                      />
                    );
                  }
                  return cells;
                })}
              </div>
            </div>
          ):(
            <div className="fsStepGrid">
              {visibleSteps.map((step)=>(
                <button
                  key={step}
                  className={'fsStep '+(clip.steps[step]>0?'active ':'')+(step%4===0?'beat ':'')+(playing&&step===playhead?'playhead':'')}
                  onClick={()=>toggleStep(step)}
                  title={'Step '+(step+1)+' · velocity '+clip.steps[step].toFixed(2)}
                >
                  {step+1}
                </button>
              ))}
            </div>
          )}

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
