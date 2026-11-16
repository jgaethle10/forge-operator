import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createPrivateSabanTransitionJournal} from './saban-transition-journal.mjs';
import {renderVerifiedSabanTransitionView,createPrivateTransitionReview} from './saban-transition-view.mjs';

const at='2026-11-15T16:00:00.000Z';
const event={kind:'leased',at,total:2,counts:{queued:1,leased:1,completed:0,dead_letter:0}};
function make(){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'saban-graphics-event-review-'));
  const directory=path.join(home,'journal-run');
  const journal=createPrivateSabanTransitionJournal({directory,sourceClass:'synthetic_test'});
  journal.record(event);
  journal.record({...event,kind:'completed',counts:{queued:1,leased:0,completed:1,dead_letter:0}});
  journal.record({...event,kind:'scheduler_finished',counts:{queued:1,leased:0,completed:1,dead_letter:0}});
  journal.close();
  return {home,directory};
}
test('verified private scheduler entries become readable mobile-first timeline without identifiers',()=>{
  const s=make();
  try{
    const raw=fs.readFileSync(path.join(s.directory,'saban-transitions.jsonl'),'utf8');
    const html=renderVerifiedSabanTransitionView(raw);
    assert.match(html,/SYNTHETIC TEST \/ NOT LIVE/);
    assert.match(html,/The work\./);
    assert.match(html,/At a glance/);
    assert.match(html,/WHAT TO DO NEXT/);
    assert.match(html,/1 job remains queued/);
    assert.match(html,/Work assigned/);
    assert.match(html,/Work completed/);
    assert.match(html,/Local hash chain checked/); // local integrity, not independent attestation
    assert.match(html,/<details class="history">/);
    assert.match(html,/Inspect all 3 recorded transitions/);
    assert.equal((html.match(/class="history-event"/g)||[]).length,3);
    assert.equal((html.match(/class="recent-event"/g)||[]).length,3);
    assert.doesNotMatch(html,/<script|<iframe|https?:\/\//i);
    const result=createPrivateTransitionReview({directory:s.directory});
    assert.equal(result.local_chain_verified,true);
    assert.equal(result.publication_authority,false);
    assert.equal(fs.statSync(result.output).mode&0o777,0o600);
    assert.throws(()=>createPrivateTransitionReview({directory:s.directory}),/EEXIST/);
  }finally{fs.rmSync(s.home,{recursive:true,force:true});}
});
test('forged fields, corrupted chains and public directories fail closed',()=>{
  const s=make();
  try{
    const raw=fs.readFileSync(path.join(s.directory,'saban-transitions.jsonl'),'utf8');
    assert.throws(()=>renderVerifiedSabanTransitionView(raw.replace(
      '"kind":"completed"','"kind":"leased"')),/mismatch/);
    assert.throws(()=>renderVerifiedSabanTransitionView(raw.replace(
      '"total":2','"total":999')),/Invalid|mismatch/);
    assert.throws(()=>createPrivateTransitionReview({directory:path.resolve('public')}),/private|outside/);
    assert.throws(()=>createPrivateTransitionReview({directory:'relative'}),/absolute/);
    const alias=path.join(s.home,'alias');
    fs.symlinkSync(s.directory,alias);
    assert.throws(()=>createPrivateTransitionReview({directory:alias}),/canonical/);
  }finally{fs.rmSync(s.home,{recursive:true,force:true});}
});
