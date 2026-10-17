// Local, private, write-once custody for verified Black Box incident events.
// Not a network transport, provider verifier, operator permission, or production lease adapter.
import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { ingestSignedAudit, verifyReceipt } from './incident-event.mjs';

const JOURNAL_SCHEMA = 'evercraft.blackbox.local-custody.v1';
const MAX_RECORD_BYTES = 262144;
const MAX_EVENTS = 1000;
const SHA = x => createHash('sha256').update(x).digest('hex');
function hold(message) { throw new Error('BLACKBOX_CUSTODY_HELD: ' + message); }
function requireId(value) { if (typeof value !== 'string' || !/^[-a-zA-Z0-9_.:@/]{1,160}$/.test(value)) hold('invalid scope identifier'); }
function assertPrivateDirectory(path) {
  let stat;
  try { stat = lstatSync(path); } catch { hold('custody directory not available'); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) hold('custody directory is not an owned directory');
  // A trusted, operator-selected root is required. World/group access is disallowed.
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) hold('custody directory permissions not private');
}
function rootPath(journal_root,create) {
  if (typeof journal_root !== 'string' || !isAbsolute(journal_root)) hold('operator must configure absolute custody root');
  const root = resolve(journal_root);
  if (create) mkdirSync(root,{recursive:true,mode:0o700});
  assertPrivateDirectory(root);
  return root;
}
function scopeDir(root,tenant_id,mission_id,incident_id,create) {
  for (const id of [tenant_id,mission_id,incident_id]) requireId(id);
  const dir=join(root,SHA(JSON.stringify([tenant_id,mission_id,incident_id])));
  if (create) mkdirSync(dir,{recursive:true,mode:0o700});
  assertPrivateDirectory(dir);
  return dir;
}
function eventFile(dir,event_id) {
  requireId(event_id);
  return join(dir,SHA(event_id)+'.json');
}
function syncDirectory(dir) {
  const fd=openSync(dir,constants.O_RDONLY);
  try {fsyncSync(fd);} finally {closeSync(fd);}
}
function writeOnce(file,raw) {
  if (Buffer.byteLength(raw)>MAX_RECORD_BYTES) hold('record too large');
  let fd;
  try {
    fd=openSync(file,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  } catch (e) {
    if(e?.code==='EEXIST') hold('replay or conflicting event id already held');
    throw e;
  }
  try {writeFileSync(fd,raw,'utf8');fsyncSync(fd);} finally {closeSync(fd);}
  syncDirectory(resolve(file,'..'));
}
function readPrivate(file) {
  let fd;
  try {fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);} catch (e) {hold('missing or unreadable stored record');}
  try {
    const stat=fstatSync(fd);
    if (!stat.isFile() || stat.size<=0 || stat.size>MAX_RECORD_BYTES) hold('unsafe stored record');
    if (process.platform !== 'win32' && (stat.mode & 0o077)!==0) hold('stored record permissions not private');
    return readFileSync(fd,{encoding:'utf8'});
  } finally {closeSync(fd);}
}
function revalidateRecord(file,trust,options) {
  let record;
  try {record=JSON.parse(readPrivate(file));} catch (e) {hold('stored record invalid JSON or unavailable');}
  if (!record || typeof record!=='object' || Array.isArray(record) ||
      Object.keys(record).sort().join(',')!=='accepted_at_ms,envelope,receipt,schema' ||
      record.schema!==JOURNAL_SCHEMA || !Number.isSafeInteger(record.accepted_at_ms)) hold('stored record invalid schema');
  try {
    verifyReceipt(record.envelope,record.receipt,trust,{...options,now:record.accepted_at_ms});
  } catch {hold('stored record signature or receipt mismatch');}
  if (record.receipt.execution_authority!=='NONE_READ_ONLY' || record.receipt.external_effect_provider_verified!==false) hold('unsafe stored authority');
  return record;
}
/** A validated signature is required before the custody filesystem is touched. */
export function appendJournalEvent({envelope,trust,policy,journal_root}) {
  const acceptedAt=policy?.now??Date.now();
  const scopedPolicy={...policy,now:acceptedAt};
  const receipt=ingestSignedAudit(envelope,trust,scopedPolicy);
  if (Buffer.byteLength(JSON.stringify(envelope))>MAX_RECORD_BYTES/2) hold('source envelope too large');
  const root=rootPath(journal_root,true);
  const dir=scopeDir(root,receipt.tenant_id,receipt.mission_id,receipt.incident_id,true);
  const path=eventFile(dir,receipt.event_id);
  const record={schema:JOURNAL_SCHEMA,accepted_at_ms:acceptedAt,envelope,receipt};
  writeOnce(path,JSON.stringify(record));
  return {receipt,local_custody_state:'WRITE_ONCE_FILE_SYNCED_NOT_REMOTE_OR_INDEPENDENT',path};
}
/** Revalidates the source signature and local receipt after process restart. */
export function readJournalEvent({journal_root,tenant_id,mission_id,incident_id,event_id,trust,policy={}}) {
  const root=rootPath(journal_root,false);
  const dir=scopeDir(root,tenant_id,mission_id,incident_id,false);
  const record=revalidateRecord(eventFile(dir,event_id),trust,{...policy,tenant_id,mission_id});
  if (record.receipt.incident_id!==incident_id || record.receipt.event_id!==event_id) hold('stored identity mismatch');
  return record;
}
/** Tenant/mission/incident binding is mandatory; no cross-tenant inventory query. */
export function readJournalIncident({journal_root,tenant_id,mission_id,incident_id,trust,policy={}}) {
  const root=rootPath(journal_root,false);
  const dir=scopeDir(root,tenant_id,mission_id,incident_id,false);
  const files=readdirSync(dir);
  if (files.length>MAX_EVENTS) hold('incident event budget exceeded');
  const result=[];
  for (const name of files) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) hold('unexpected custody directory entry');
    const record=revalidateRecord(join(dir,name),trust,{...policy,tenant_id,mission_id});
    if (record.receipt.tenant_id!==tenant_id || record.receipt.mission_id!==mission_id || record.receipt.incident_id!==incident_id ||
        SHA(record.receipt.event_id)+'.json'!==name) hold('misplaced record identity');
    result.push(record);
  }
  return result.sort((a,b)=>a.envelope.payload.occurred_at.localeCompare(b.envelope.payload.occurred_at)||a.receipt.event_id.localeCompare(b.receipt.event_id));
}
/** Pure read-only local projections, NOT dispatch into actual CHUM / Spider services. */
export function localIncidentProjections(input) {
  const events=readJournalIncident(input);
  const incident={tenant_id:input.tenant_id,mission_id:input.mission_id,incident_id:input.incident_id};
  const source_refs=events.map(e=>({event_id:e.receipt.event_id,event_sha256:e.receipt.event_sha256,source_id:e.receipt.source_id,authenticated_source:true}));
  const trace=events.map(e=>({event_id:e.receipt.event_id,kind:e.envelope.payload.event_type,upstream_event_ids:e.envelope.payload.upstream_event_ids,
    observed_at:e.envelope.payload.observed_at,source_event_sha256:e.receipt.event_sha256,evidence_kind:e.envelope.payload.evidence_kind}));
  const trails=events.filter(e=>['tool_attempt','retry_scheduled','callback_registered','lease_snapshot','queue_snapshot'].includes(e.envelope.payload.event_type))
    .map(e=>({event_id:e.receipt.event_id,operation_id:e.envelope.payload.operation_id,idempotency_key:e.envelope.payload.idempotency_key,
      candidate_kind:e.envelope.payload.event_type,evidence_state:e.envelope.payload.evidence_kind,source_event_sha256:e.receipt.event_sha256}));
  const persistence=events.flatMap(e=>e.receipt.persistence_paths.map(path=>({...path,source_event_id:e.receipt.event_id,source_event_sha256:e.receipt.event_sha256})));
  return {schema:'evercraft.blackbox.local-readonly-projections.v1',...incident,source_refs,
    black_box:{timeline:trace,external_provider_verification:'NOT_PERFORMED',verified_impact:[],possible_impact:[...new Set(events.flatMap(e=>e.receipt.possible_impact))],retry_authority:'NONE'},
    chum:{incident_trail_candidates:trails,real_chum_invocation:false},
    spider_society:{persistence_candidates:persistence,live_process_inventory:false,no_regeneration_proven:false},
    proof_state:'LOCAL_SIGNED_SOURCE_REVALIDATION_NOT_INDEPENDENT_REMOTE_ATTESTATION',execution_authority:'NONE_READ_ONLY'};
}
