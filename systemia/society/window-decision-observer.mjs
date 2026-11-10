/**
 * Read-only observation of an operator-supplied Window state snapshot.
 *
 * Deliberately does NOT import or modify the SHA-pinned heartbeat writer.
 * A content hash verifies snapshot consistency, NOT GitHub/source authenticity.
 * No network, credentials, state-branch writes, or external actions.
 */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {projectDecisionReceipts} from './window-decision-receipts.mjs';

export const OBSERVATION_SCHEMA='evercraft.window.private-observation.v1';
const STATE_SCHEMA='evercraft.window.heartbeat.v1';
const HEX=/^[0-9a-f]{64}$/;
const sha256=s=>createHash('sha256').update(s).digest('hex');
const validId=id=>typeof id==='string'&&/^e[1-9][0-9]{0,12}$/.test(id);

export function observeWindowSnapshot(state){
  if(!state||state.schema!==STATE_SCHEMA||state.initialized!==true||
     !Number.isSafeInteger(state.sequence)||state.sequence<1||
     typeof state.heartbeat_at!=='string'||!Number.isFinite(Date.parse(state.heartbeat_at))||
     !HEX.test(state.world_hash||'')||
     !state.world||!Array.isArray(state.world.events)||!Array.isArray(state.world.actors)||
     state.world.actors.length!==12||state.world.events.length>160||
     !Number.isSafeInteger(state.world.tick)||state.world.tick<0||
     !Number.isSafeInteger(state.world.next_event_id)||state.world.next_event_id<1)
    throw Error('Invalid Window state snapshot');
  const actualHash=sha256(JSON.stringify(state.world));
  if(actualHash!==state.world_hash)throw Error('Window world hash mismatch; refuse observation');
  const eventIds=state.world.events.map(e=>{
    if(!e||!validId(e.id))throw Error('Invalid saved Window event');
    return Number(e.id.slice(1));
  });
  if(new Set(eventIds).size!==eventIds.length)throw Error('Duplicate saved Window event');
  if(eventIds.some(id=>id>=state.world.next_event_id))throw Error('Future Window event');
  // The ledger only retains the latest 160 events; never imply full-history coverage.
  const first=eventIds.length?Math.min(...eventIds):state.world.next_event_id;
  const projection=projectDecisionReceipts(state.world,first);
  const residents=state.world.actors.map(a=>{
    if(typeof a.id!=='string'||!/^r(?:[1-9]|1[0-2])$/.test(a.id)||
       typeof a.name!=='string'||a.name.length>80 ||
       typeof a.job!=='string'||a.job.length>80 ||
       typeof a.zone!=='string'||a.zone.length>80)
      throw Error('Invalid fictional resident profile');
    return {id:a.id,name:a.name,job:a.job,zone:a.zone,emoji:String(a.emoji||'').slice(0,8)};
  });
  if(new Set(residents.map(r=>r.id)).size!==residents.length)throw Error('Duplicated resident ID');
  if(state.model_mode!=='civic_and_social_policy_no_llm')throw Error('Unsupported model-mode claim');
  return {
    schema:OBSERVATION_SCHEMA,
    origin:'operator_supplied_local_snapshot_not_authenticated',
    verified:'internal_world_hash_only',
    release_status:state.release_status,
    model_mode:state.model_mode,
    observation_created_from:{
      sequence:state.sequence,heartbeat_at:state.heartbeat_at,
      world_hash:state.world_hash,tick:state.world.tick,
      latest_event_id:state.world.next_event_id-1
    },
    historical_limit:'only_retained_bounded_chronicle_not_full_history',
    residents,decision_projection:projection
  };
}

export async function readWindowSnapshot(filename){
  const stat=await fs.stat(filename);
  if(!stat.isFile()||stat.size>1_000_000||stat.size<2)
    throw Error('Window snapshot must be a regular JSON file under 1MB');
  return observeWindowSnapshot(JSON.parse(await fs.readFile(filename,'utf8')));
}

const entry=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(entry){
  const filename=process.argv[2];
  if(!filename||process.argv.length!==3){
    console.error('Usage: node systemia/society/window-decision-observer.mjs /path/to/state/window.json');
    process.exitCode=2;
  }else{
    readWindowSnapshot(filename)
      .then(report=>process.stdout.write(JSON.stringify(report,null,2)+'\n'))
      .catch(e=>{console.error('Observation refused: '+e.message);process.exitCode=1;});
  }
}
