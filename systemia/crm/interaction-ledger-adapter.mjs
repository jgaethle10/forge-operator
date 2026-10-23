import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { INPUT_SCHEMA } from './heartbeat.mjs';

const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const hashBody = obj => sha(JSON.stringify(obj));
const SOURCE = 'evercraft-interaction-ledger';
const DECLARED_GAPS = ['evercraft-payments', 'eps-services', 'havenly-services', 'partnership-pipeline'];
const TYPES = new Set(['message','reply','opt_out','opt_in_signal','commitment_opened','commitment_fulfilled','commitment_cancelled','note']);

function requireStr(x,label) {
  if (typeof x !== 'string' || !x.trim()) throw Error(label+'_invalid');
  return x.trim();
}
function checkTime(x,label,now) {
  const n = Date.parse(requireStr(x,label));
  if (!Number.isFinite(n) || n > now.getTime()+120000) throw Error(label+'_invalid');
  return n;
}
function validDueTime(value) {
  const n=Date.parse(requireStr(value,'due_at'));
  if(!Number.isFinite(n)) throw Error('due_at_invalid');
  return n;
}
function eventRow(row,now) {
  if (!row || typeof row !== 'object' || row.schema !== 'evercraft.interaction-ledger.event.v1') throw Error('interaction_event_schema_invalid');
  for (const key of ['event_id','idempotency_key','subject_ref','channel','direction','event_type','evidence_ref']) requireStr(row[key],key);
  if (!TYPES.has(row.event_type)) throw Error('interaction_event_type_invalid');
  checkTime(row.occurred_at,'occurred_at',now);
  if (['commitment_opened','commitment_fulfilled','commitment_cancelled'].includes(row.event_type)) requireStr(row.commitment_ref,'commitment_ref');
  const {receipt_hash, ...core} = row;
  if (receipt_hash !== hashBody(core)) throw Error('interaction_event_receipt_mismatch');
  return row;
}

/** Pure read model of one existing private ledger. Never authorizes contact. */
export function projectInteractionEvents(events, {now=new Date(), replyAgeHours=4, sourceRevision=null}={}) {
  if (!Array.isArray(events) || events.length>50000) throw Error('interaction_events_invalid');
  const sorted=[], ids=new Set(), idem=new Set();
  for(const raw of events) {
    const e=eventRow(raw,now);
    if(ids.has(e.event_id) || idem.has(e.idempotency_key)) throw Error('interaction_event_duplicate');
    ids.add(e.event_id); idem.add(e.idempotency_key); sorted.push(e);
  }
  // Event order must be based on occurred_at, not file write or connector arrival.
  sorted.sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at)||a.event_id.localeCompare(b.event_id));
  const commitments=new Map(), conversations=new Map();
  for(const e of sorted) {
    if(e.event_type==='commitment_opened') {
      commitments.set(e.subject_ref+'\u0000'+e.commitment_ref,e);
    }
    if(['commitment_fulfilled','commitment_cancelled'].includes(e.event_type)) {
      commitments.delete(e.subject_ref+'\u0000'+e.commitment_ref);
    }
    const key=e.subject_ref+'\u0000'+e.channel;
    const previous=conversations.get(key)||{optedOut:false,lastInbound:null,lastOutbound:null};
    if(e.event_type==='opt_out') previous.optedOut=true;
    if(e.event_type==='opt_in_signal') previous.optedOut=false;
    if(e.event_type==='message'||e.event_type==='reply') {
      if(e.direction==='inbound') previous.lastInbound=e;
      if(e.direction==='outbound') previous.lastOutbound=e;
    }
    conversations.set(key,previous);
  }
  const signals=[];
  for(const e of commitments.values()) {
    if(!e.due_at || validDueTime(e.due_at)>now.getTime()) continue;
    signals.push({
      signal_key:sha('commitment:'+e.event_id),domain:'relationships',
      kind:'commitment_overdue',state:'open',severity:'high',
      evidence_state:'verified',observed_at:e.occurred_at,due_at:e.due_at,
    });
  }
  const threshold=replyAgeHours*3600000;
  if(!Number.isInteger(replyAgeHours) || replyAgeHours<1 || replyAgeHours>168) throw Error('reply_age_hours_invalid');
  for(const x of conversations.values()) {
    const e=x.lastInbound;
    if(x.optedOut || !e || x.lastOutbound && Date.parse(x.lastOutbound.occurred_at)>=Date.parse(e.occurred_at)) continue;
    if(now.getTime()-Date.parse(e.occurred_at)<threshold) continue;
    signals.push({
      signal_key:sha('inbound:'+e.event_id),domain:'relationships',
      kind:'reply_waiting',state:'open',severity:'normal',
      evidence_state:'reported',observed_at:e.occurred_at,
      due_at:new Date(Date.parse(e.occurred_at)+threshold).toISOString(),
    });
  }
  signals.sort((a,b)=>a.signal_key.localeCompare(b.signal_key));
  const last=sorted.at(-1);
  const revision=sourceRevision||sha(events.map(e=>e.receipt_hash).join('\n'));
  return {
    schema:INPUT_SCHEMA,tenant_id:'evercraft',generated_at:now.toISOString(),
    source_revision:revision,connectors:[
      {source_key:SOURCE,state:'current',checked_at:now.toISOString(),
        evidence_ref:'private-ledger-watermark:'+sha(revision).slice(7,31)},
      ...DECLARED_GAPS.map(source_key=>({source_key,state:'unavailable'}))
    ],
    signals,
    source_event_count:sorted.length, // private adapter only, not emitted in public report
    source_latest_event_at:last?.occurred_at||null,
  };
}

/** Open private local ledger only; never fetch mailbox data or copy source. */
export function readPrivateInteractionLedger(stateDir,{now=new Date(),maxBytes=12*1024*1024}={}) {
  const root=path.resolve(requireStr(stateDir,'ledger_state_dir'));
  const stat=fs.lstatSync(root);
  if(!stat.isDirectory() || stat.isSymbolicLink() ||
      (process.platform!=='win32' && (stat.mode&0o077)!==0)) throw Error('interaction_ledger_root_unsafe');
  const file=path.join(root,'interaction-events.jsonl');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  let content;
  try {
    // Inspect the same open descriptor we read, preventing a symlink swap
    // between lstat() and readFile() from revealing private ledger state.
    const fstat=fs.fstatSync(fd);
    if(!fstat.isFile() ||
        (process.platform!=='win32' && (fstat.mode&0o077)!==0)) throw Error('interaction_ledger_file_unsafe');
    if(fstat.size>maxBytes) throw Error('interaction_ledger_file_too_large');
    content=fs.readFileSync(fd,'utf8');
  } finally {
    fs.closeSync(fd);
  }
  const events=content.split('\n').filter(Boolean).map(line=>JSON.parse(line));
  return projectInteractionEvents(events,{now});
}

/** Never return exception text or private paths in public heartbeat receipts. */
export function resolveCrmSource({inputPath='',ledgerStateDir='',now=new Date()}={}) {
  if(inputPath) return {inputPath};
  if(!ledgerStateDir) return {holdReason:'source_not_configured'};
  try {
    return {inputData:readPrivateInteractionLedger(ledgerStateDir,{now})};
  } catch(error) {
    if(error?.code==='ENOENT') return {holdReason:'source_missing'};
    if(/unsafe/.test(String(error?.message||''))) return {holdReason:'source_permissions_or_type_invalid'};
    return {holdReason:'source_invalid'};
  }
}
