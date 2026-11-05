// Pure, fail-closed reader for public development evidence and untrusted local operator exports.
// Importing a snapshot is NOT independent authentication of Systemia execution.
import {publicUrl} from './work-source.mjs';

export const SNAPSHOT_SCHEMA = 'evercraft.systemia.operator-mission-snapshot.v1';
export const LANES = Object.freeze(['revenue','infrastructure','execution','approvals']);
export const MISSION_STATES = Object.freeze(['planned','admitted','running','held','completed','failed','unknown']);
const MS_DAY = 86400000;
const MAX_FILE_CHARS = 250000;
const revenuePattern = /\b(payments?|checkout|stripe|purchase|orders?|buyers?|revenue|leads?|sales|offers?|quotes?|pricing|merchant|invoices?|conversion)\b/i;
const infrastructurePattern = /\b(penguin|nextgen|node[ -]?(?:001|002)|runtime|compute|infrastructure|fabric|edge|network|health|admission|relay|broker)\b/i;

function safeLabel(value,max=140){
  return typeof value==='string'
    ? value.replace(/[\u0000-\u001f\u007f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)
    : '';
}
function safeTime(value,now){
  if(typeof value!=='string')return '';
  const ms=Date.parse(value);
  if(!Number.isFinite(ms)||ms>now+300000||ms<now-180*MS_DAY)return '';
  return new Date(ms).toISOString();
}
export function classifyPublicEvidence(items){
  const arr=Array.isArray(items)?items:[];
  const prs=arr.filter(x=>x && x.kind==='PULL REQUEST' && publicUrl(x.url));
  const checks=arr.filter(x=>x && x.kind==='VERIFICATION' && publicUrl(x.url));
  return {
    revenue:prs.filter(x=>revenuePattern.test(x.title||'')).slice(0,5),
    infrastructure:prs.filter(x=>infrastructurePattern.test(x.title||'')).slice(0,5),
    execution:checks.slice(0,5),
    approvals:prs.filter(x=>x.state==='DRAFT REVIEW'||x.state==='OPEN REVIEW').slice(0,5),
  };
}

export function parseOperatorSnapshot(raw,now=Date.now()){
  if(!raw || typeof raw!=='object'||Array.isArray(raw))throw new Error('Snapshot must be a JSON object.');
  if(raw.schema!==SNAPSHOT_SCHEMA)throw new Error('Unrecognized Systemia export schema.');
  if(JSON.stringify(raw).length>MAX_FILE_CHARS)throw new Error('Snapshot is too large.');
  const exported=safeTime(raw.exported_at,now);
  if(!exported)throw new Error('Snapshot export timestamp is invalid, stale or future-dated.');
  if(!Array.isArray(raw.missions)||raw.missions.length>80)throw new Error('Expected up to 80 missions.');
  const seen=new Set();
  const missions=raw.missions.map((m,i)=>{
    if(!m||typeof m!=='object'||Array.isArray(m))throw new Error('Invalid mission at position '+(i+1)+'.');
    const id=safeLabel(m.id,70),title=safeLabel(m.title,140);
    if(!/^[a-zA-Z0-9][\w./:-]{1,69}$/.test(id)||title.length<7||seen.has(id))throw new Error('Invalid or duplicate mission identifier/title.');
    if(!LANES.includes(m.lane)||!MISSION_STATES.includes(m.status))throw new Error('Unknown mission lane or status.');
    const observed=safeTime(m.observed_at,now);
    if(!observed)throw new Error('Mission observation timestamp is missing or invalid.');
    if(Date.parse(observed)>Date.parse(exported)+300000)throw new Error('Mission observation is newer than export.');
    const note=safeLabel(m.note||'',300),owner=safeLabel(m.owner||'',80);
    const receiptUrl=publicUrl(m.public_receipt_url||'');
    seen.add(id);
    return {id,title,lane:m.lane,status:m.status,observed_at:observed,note,owner,
      public_receipt_url:receiptUrl,provenance:'OPERATOR IMPORT · UNVERIFIED'};
  });
  return {schema:SNAPSHOT_SCHEMA,exported_at:exported,missions,authority:'OPERATOR-REPORTED / UNVERIFIED'};
}
