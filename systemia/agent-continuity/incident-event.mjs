// Evercraft Black Box incident-event v1: READ ONLY authenticated source boundary.
// A valid signature authenticates the configured source, not a provider side effect.
import {createHash, createPublicKey, verify} from 'node:crypto';

export const SCHEMA = 'evercraft.incident_event.v1';
const REQUIRED = ['schema','tenant_id','mission_id','incident_id','event_id','source_id','agent_id',
  'workload_id','operation_id','occurred_at','observed_at','clock_uncertainty_ms',
  'event_type','evidence_kind','actor_id','permission_scope','idempotency_key',
  'upstream_event_ids','persistence_paths','possible_impact','verified_impact','external_effect'];
const TYPES = new Set(['worker_start','worker_exit','tool_attempt','tool_ack','retry_scheduled','callback_registered','queue_snapshot','lease_snapshot','permission_observation']);
const KINDS = new Set(['source_observation','source_report','synthetic']);
const EFFECTS = new Set(['UNKNOWN','UNVERIFIED_COMMITTED_CLAIM','UNVERIFIED_FAILED_CLAIM','CONFLICT']);
const PATH_TYPES = new Set(['worker','queue','retry','callback','timer','tool_invocation','lease']);
const ISO_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
function reject(s) { throw new Error('INCIDENT_EVENT_REJECTED: '+s); }
function plain(v) { return !!v && typeof v==='object' && !Array.isArray(v) && (Object.getPrototypeOf(v)===Object.prototype || Object.getPrototypeOf(v)===null); }
function exact(v,keys,where) { if(!plain(v))reject(where+' must be an object'); const extra=Object.keys(v).filter(k=>!keys.includes(k)); if(extra.length)reject(where+' unexpected field: '+extra[0]); }
function ident(v,k) { if(typeof v!=='string'||!/^[-a-zA-Z0-9_.:@/]{1,160}$/.test(v))reject('invalid '+k); }
function utc(v,k){ if(typeof v!=='string'||!ISO_UTC.test(v)||Number.isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,19)!==v.slice(0,19))reject('invalid UTC '+k);}
function strings(v,k){if(!Array.isArray(v)||v.length>100)reject('invalid '+k);for(const x of v)ident(x,k);if(new Set(v).size!==v.length)reject('duplicate '+k);}
function validatePayload(p) {
  exact(p,REQUIRED,'payload');for(const k of REQUIRED) if(!(k in p))reject('missing '+k);
  if(p.schema!==SCHEMA)reject('unsupported schema');
  for(const k of ['tenant_id','mission_id','incident_id','event_id','source_id','agent_id','workload_id','operation_id','actor_id','permission_scope','idempotency_key']) ident(p[k],k);
  utc(p.occurred_at,'occurred_at');utc(p.observed_at,'observed_at');
  if(!Number.isSafeInteger(p.clock_uncertainty_ms)||p.clock_uncertainty_ms<0||p.clock_uncertainty_ms>86400000)reject('invalid clock uncertainty');
  if(!TYPES.has(p.event_type)||!KINDS.has(p.evidence_kind)||!EFFECTS.has(p.external_effect))reject('unsupported classification');
  strings(p.upstream_event_ids,'upstream_event_ids');strings(p.possible_impact,'possible_impact');strings(p.verified_impact,'verified_impact');
  if(p.verified_impact.length!==0)reject('verified impact requires a distinct provider-authoritative readback adapter');
  if(!Array.isArray(p.persistence_paths)||p.persistence_paths.length>100)reject('invalid persistence_paths');
  for(const path of p.persistence_paths) {
    exact(path,['type','resource_id','state'],'persistence_path');
    if(!PATH_TYPES.has(path.type))reject('bad persistence type');
    ident(path.resource_id,'persistence resource');
    if(!['observed_active','observed_inactive','reported','unknown'].includes(path.state))reject('bad persistence state');
  }
  if(new Set(p.persistence_paths.map(x=>x.type+':'+x.resource_id)).size!==p.persistence_paths.length)reject('duplicate persistence path');
  if(p.evidence_kind==='synthetic' && p.external_effect!=='UNKNOWN')reject('synthetic cannot assert effect');
  return p;
}
function strictB64(v){if(typeof v!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(v))reject('invalid signature encoding');const b=Buffer.from(v,'base64');if(b.length!==64||b.toString('base64')!==v)reject('invalid signature bytes');return b;}
function sha(s){return createHash('sha256').update(s).digest('hex');}
// trust records configured outside the ingested message; never accept in-band keys or grants.
// { key_id: {public_key_pem, tenant_id, source_id, actor_ids:[...], permission_scopes:[...]} }
export function ingestSignedAudit(envelope,trust,{tenant_id,mission_id,now=Date.now(),max_age_ms=300000}={}) {
  exact(envelope,['key_id','purpose','payload','signature'],'envelope');
  if(envelope.purpose!=='evercraft.blackbox.readonly-ingest.v1')reject('wrong signature purpose');
  ident(envelope.key_id,'key_id');
  if(!plain(trust)||!Object.hasOwn(trust,envelope.key_id))reject('untrusted key_id');
  const grant=trust[envelope.key_id];
  exact(grant,['public_key_pem','tenant_id','source_id','actor_ids','permission_scopes'],'trust grant');
  const p=validatePayload(envelope.payload);
  if(!tenant_id||!mission_id||p.tenant_id!==tenant_id||p.mission_id!==mission_id)reject('wrong tenant or mission');
  if(p.tenant_id!==grant.tenant_id||p.source_id!==grant.source_id||!grant.actor_ids?.includes(p.actor_id)||!grant.permission_scopes?.includes(p.permission_scope))reject('identity or scope mismatch');
  if(typeof now!=='number'||!Number.isFinite(now)||!Number.isSafeInteger(max_age_ms)||max_age_ms<0)reject('invalid time policy');
  const observed=Date.parse(p.observed_at);
  if(observed>now+30000+p.clock_uncertainty_ms||now-observed>max_age_ms+p.clock_uncertainty_ms)reject('observation outside freshness window');
  const signed='evercraft.blackbox.readonly-ingest.v1\n'+JSON.stringify(p);
  let ok=false;
  try {ok=verify(null,Buffer.from(signed),createPublicKey(grant.public_key_pem),strictB64(envelope.signature));}
  catch {reject('invalid source signature or trust key');}
  if(!ok)reject('invalid source signature');
  const digest=sha(signed);
  const readOnly={schema:'evercraft.blackbox.ingest-receipt.v1',tenant_id:p.tenant_id,mission_id:p.mission_id,incident_id:p.incident_id,
    event_id:p.event_id,source_id:p.source_id,source_key_id:envelope.key_id,event_sha256:digest,identity_state:'CONFIGURED_SOURCE_SIGNATURE_VERIFIED',
    external_effect_state:p.external_effect,external_effect_provider_verified:false,verified_impact:[],possible_impact:[...p.possible_impact],
    persistence_paths:p.persistence_paths.map(x=>({...x})),execution_authority:'NONE_READ_ONLY',
    delivery_state:'LOCAL_CONSUMER_ACCEPTED_NOT_TRANSPORT_ATTESTED'};
  return Object.freeze(readOnly);
}
export function verifyReceipt(envelope,receipt,trust,options){
  const recomputed=ingestSignedAudit(envelope,trust,options);
  if(!plain(receipt)||JSON.stringify(receipt)!==JSON.stringify(recomputed))reject('receipt mismatch');
  return {verified:true,kind:'SAME_TRUST_ROOT_RECOMPUTATION_ONLY',source_sha256:receipt.event_sha256};
}
