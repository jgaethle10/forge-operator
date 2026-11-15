/**
 * Black Box <- EO-001: one incident, one read-only evidence trail.
 *
 * Maps a PRIVATE EO-001 failed-supervisor observation into an UNSIGNED,
 * STRICT Black Box incident_event.v1 candidate. Nothing is stored, signed,
 * transmitted, inferred as hardware attestation, or authorized by this file.
 *
 * The existing configured-source Ed25519 trust boundary in incident-event.mjs
 * remains mandatory; do NOT treat this candidate as accepted evidence until
 * an external signer with a separately provisioned private key and a scoped,
 * out-of-band trust record signs it. This source does not sign.
 *
 * The original source bytes and all procfs/process IDs remain PRIVATE. The
 * returned candidate carries only a source-bytes digest as an idempotency key,
 * an exact source revision, a possible worker persistence path (UNKNOWN),
 * and zero verified impacts. This is never proof a worker survived or died.
 */
import {createHash} from 'node:crypto';
import {SCHEMA} from './incident-event.mjs';

const reject=code=>{const e=new Error(code);e.code=code;throw e;};
const ensure=(yes,code)=>{if(!yes)reject(code);};
const SHA40=/^[a-f0-9]{40}$/;
const SHA256=/^[a-f0-9]{64}$/;
const UNIT=/^eo001-g1-synthetic-[a-f0-9]{32}\.scope$/;
const IDENT=/^[-a-zA-Z0-9_.:@/]{1,160}$/;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const MAX_BYTES=256*1024;
const PERMISSION_SCOPE='audit:read';
const MODES=new Set(['SYNTHETIC_FIXTURE','OPERATOR_REPORTED_PHYSICAL']);

const hash=b=>createHash('sha256').update(b).digest('hex');
function utc(value){
  return typeof value==='string'&&UTC.test(value)&&
    Number.isFinite(Date.parse(value))&&
    new Date(value).toISOString().slice(0,19)===value.slice(0,19);
}
function exactId(value){return typeof value==='string'&&IDENT.test(value);}
function failClosedReceipt(sourceBytes,sourceRevision){
  ensure(typeof sourceBytes==='string'||Buffer.isBuffer(sourceBytes),
    'EO001_SOURCE_BYTES_REQUIRED');
  const raw=Buffer.isBuffer(sourceBytes)?
    Buffer.from(sourceBytes):Buffer.from(sourceBytes,'utf8');
  ensure(raw.byteLength>0&&raw.byteLength<=MAX_BYTES&&
    raw.toString('utf8').includes('{'),
    'EO001_SOURCE_BYTES_INVALID');
  // Refuse malformed UTF-8 rather than silently hashing replacement glyphs.
  ensure(Buffer.from(raw.toString('utf8'),'utf8').equals(raw),
    'EO001_SOURCE_ENCODING_INVALID');
  let packet;
  try{packet=JSON.parse(raw.toString('utf8'));}
  catch{reject('EO001_SOURCE_JSON_INVALID');}
  ensure(packet&&typeof packet==='object'&&!Array.isArray(packet)&&
    packet.schema==='evercraft.eo001.gate1.private-negative-observation.v1'&&
    packet.state==='SCOPE_LIFECYCLE_OBSERVATION_BLOCKED'&&
    typeof packet.reason==='string'&&/^[A-Z_]{3,80}$/.test(packet.reason)&&
    ['POST_KERNEL_READBACK','PACKET_CONSISTENCY_CHECK'].includes(packet.stage)&&
    UNIT.test(packet.scope_id||'')&&
    SHA40.test(packet.source_revision||'')&&
    packet.source_revision===sourceRevision&&
    SHA256.test(packet.pre_sha256||'')&&
    packet.pre&&typeof packet.pre==='object'&&
    packet.actual_cleanup_verified===false&&
    packet.execution_authorized===false&&
    packet.independent_hardware_attestation===false,
    'EO001_NEGATIVE_RECEIPT_UNVERIFIED');
  ensure(hash(Buffer.from(JSON.stringify(packet.pre),'utf8'))===
    packet.pre_sha256,'EO001_PRE_SNAPSHOT_DIGEST_MISMATCH');
  return {packet,source_sha256:hash(raw)};
}
/**
 * Creates one strict candidate; does not sign it or grant a trusted source.
 * All scope identifiers and UTC timestamps must come from a separately
 * reviewed canonical Systemia mission context, never guessed by the adapter.
 */
export function projectEo001NegativeToBlackBox({
  sourceBytes,sourceRevision,provenanceMode,
  tenant_id,mission_id,incident_id,source_id,agent_id,
  workload_id,operation_id,actor_id,
  occurred_at,observed_at,clock_uncertainty_ms
}={}){
  ensure(SHA40.test(sourceRevision||'')&&MODES.has(provenanceMode),
    'EO001_PROJECTION_UNAPPROVED_SOURCE_MODE');
  for(const v of [tenant_id,mission_id,incident_id,source_id,agent_id,
    workload_id,operation_id,actor_id]){
    ensure(exactId(v),'EO001_PROJECTION_SCOPE_REQUIRED');
  }
  ensure(utc(occurred_at)&&utc(observed_at)&&
    Date.parse(observed_at)>=Date.parse(occurred_at)&&
    Number.isSafeInteger(clock_uncertainty_ms)&&
    clock_uncertainty_ms>=0&&clock_uncertainty_ms<=86400000,
    'EO001_PROJECTION_TIME_UNVERIFIED');
  const {packet,source_sha256}=failClosedReceipt(sourceBytes,sourceRevision);
  const payload={
    schema:SCHEMA,tenant_id,mission_id,incident_id,
    event_id:'eo001-'+source_sha256.slice(0,32),
    source_id,agent_id,workload_id,operation_id,
    occurred_at,observed_at,clock_uncertainty_ms,
    // "worker_exit" would falsely assert termination; observation is safer.
    event_type:'permission_observation',
    evidence_kind:provenanceMode==='SYNTHETIC_FIXTURE'?
      'synthetic':'source_report',
    actor_id,permission_scope:PERMISSION_SCOPE,
    idempotency_key:'eo001:'+source_sha256,
    upstream_event_ids:[],
    // A negative scope receipt cannot prove a surviving process.
    persistence_paths:[{
      type:'worker',resource_id:packet.scope_id,state:'unknown'
    }],
    possible_impact:['possible-unverified-worker-continuity'],
    verified_impact:[],
    external_effect:'UNKNOWN'
  };
  return Object.freeze({
    schema:'evercraft.eo001.blackbox.unsigned-candidate.v1',
    state:'UNSIGNED_EO001_NEGATIVE_EVENT_CANDIDATE_REVIEW_ONLY',
    source_receipt_sha256:source_sha256,
    source_revision:sourceRevision,
    source_failure_stage:packet.stage,
    source_failure_reason:packet.reason,
    source_provenance_label:provenanceMode,
    payload,
    source_signature_verified:false,
    independent_host_attestation_verified:false,
    verified_worker_survival:false,
    verified_worker_death:false,
    private_procfs_exported:false,
    blackbox_ingestion_performed:false,
    execution_authority:'NONE_READ_ONLY',
    provider_effects_authorized:false
  });
}
