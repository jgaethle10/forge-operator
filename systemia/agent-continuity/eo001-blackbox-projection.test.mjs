import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SCHEMA,ingestSignedAudit} from './incident-event.mjs';
import {appendJournalEvent,localIncidentProjections} from './incident-journal.mjs';
import {projectEo001NegativeToBlackBox}
  from './eo001-blackbox-projection.mjs';

const revision='f'.repeat(40);
const scope='eo001-g1-synthetic-'+'a'.repeat(32)+'.scope';
const sha=b=>createHash('sha256').update(b).digest('hex');
const pre=()=>({
  boot_id:'12345678-1234-4123-8123-123456789abc',
  worker:{pid:31232,stat:'SECRET_PRIVATE_PROCFS_31232',cgroup:'0::/private'},
  detached:{pid:31233,stat:'SECRET_PRIVATE_PROCFS_31233',
    cgroup:'0::/private'}
});
const negative=(patch={})=>{
  const captured=pre();
  return {
    schema:'evercraft.eo001.gate1.private-negative-observation.v1',
    state:'SCOPE_LIFECYCLE_OBSERVATION_BLOCKED',
    reason:'POSTSTOP_KERNEL_EVIDENCE_MISSING',
    stage:'POST_KERNEL_READBACK',
    scope_id:scope,source_revision:revision,
    pre_sha256:sha(Buffer.from(JSON.stringify(captured))),
    pre:captured,stop_metadata:{secret:'PRIVATE_STOP_METADATA'},
    actual_cleanup_verified:false,execution_authorized:false,
    independent_hardware_attestation:false,...patch
  };
};
const config=()=>({
  sourceRevision:revision,provenanceMode:'SYNTHETIC_FIXTURE',
  tenant_id:'evercraft',mission_id:'evercraft-agent-continuity-fabric-20261016',
  incident_id:'eo001-private-negative-drill-001',source_id:'eo001-review-collector',
  agent_id:'eo001-synthetic-worker',workload_id:'synthetic-31000',
  operation_id:'eo001-drill-1',actor_id:'eo001-reviewer',
  occurred_at:'2026-11-15T12:00:00Z',
  observed_at:'2026-11-15T12:00:01Z',
  clock_uncertainty_ms:1500
});
function project(data=negative(),options={}){
  return projectEo001NegativeToBlackBox({
    ...config(),sourceBytes:JSON.stringify(data),...options
  });
}

test('negative EO-001 input creates strict unsigned Black Box candidate, no claims',()=>{
  const result=project();
  assert.equal(result.state,'UNSIGNED_EO001_NEGATIVE_EVENT_CANDIDATE_REVIEW_ONLY');
  assert.equal(result.payload.schema,SCHEMA);
  assert.equal(result.payload.event_type,'permission_observation');
  assert.equal(result.payload.evidence_kind,'synthetic');
  assert.equal(result.payload.permission_scope,'audit:read');
  assert.equal(result.payload.external_effect,'UNKNOWN');
  assert.deepEqual(result.payload.verified_impact,[]);
  assert.deepEqual(result.payload.possible_impact,
    ['possible-unverified-worker-continuity']);
  assert.deepEqual(result.payload.persistence_paths,[{
    type:'worker',resource_id:scope,state:'unknown'
  }]);
  for(const field of ['source_signature_verified',
    'independent_host_attestation_verified','verified_worker_survival',
    'verified_worker_death','private_procfs_exported',
    'blackbox_ingestion_performed','provider_effects_authorized'])
    assert.equal(result[field],false);
  assert.equal(result.execution_authority,'NONE_READ_ONLY');
  const shown=JSON.stringify(result);
  assert.doesNotMatch(shown,/PRIVATE_STOP_METADATA|SECRET_PRIVATE_PROCFS|31232|31233/);
  assert.equal(result.source_receipt_sha256,sha(Buffer.from(JSON.stringify(negative()))));
  assert.equal(result.payload.idempotency_key,
    'eo001:'+result.source_receipt_sha256);
});

test('source report is still unverified, even after signed Black Box test ingest',()=>{
  const result=project(negative(),{provenanceMode:'OPERATOR_REPORTED_PHYSICAL'});
  assert.equal(result.payload.evidence_kind,'source_report');
  assert.equal(result.independent_host_attestation_verified,false);
  assert.equal(result.payload.external_effect,'UNKNOWN');

  // Synthetic CI key: authenticates a test source, NOT a physical host.
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const trust={'eo001-ci-only':{
    public_key_pem:publicKey.export({type:'spki',format:'pem'}),
    tenant_id:'evercraft',source_id:'eo001-review-collector',
    actor_ids:['eo001-reviewer'],permission_scopes:['audit:read']
  }};
  const purpose='evercraft.blackbox.readonly-ingest.v1';
  const envelope={key_id:'eo001-ci-only',purpose,payload:result.payload,
    signature:sign(null,Buffer.from(purpose+'\n'+JSON.stringify(result.payload)),
      privateKey).toString('base64')};
  const accepted=ingestSignedAudit(envelope,trust,{
    tenant_id:config().tenant_id,mission_id:config().mission_id,
    now:Date.parse('2026-11-15T12:00:20Z')
  });
  assert.equal(accepted.identity_state,'CONFIGURED_SOURCE_SIGNATURE_VERIFIED');
  assert.equal(accepted.external_effect_provider_verified,false);
  assert.equal(accepted.external_effect_state,'UNKNOWN');
  assert.deepEqual(accepted.verified_impact,[]);
  assert.equal(accepted.execution_authority,'NONE_READ_ONLY');
  assert.equal(accepted.persistence_paths[0].state,'unknown');
  assert.equal(accepted.delivery_state,
    'LOCAL_CONSUMER_ACCEPTED_NOT_TRANSPORT_ATTESTED');

  const wrongTrust=structuredClone(trust);
  wrongTrust['eo001-ci-only'].tenant_id='someone-else';
  assert.throws(()=>ingestSignedAudit(envelope,wrongTrust,{
    tenant_id:config().tenant_id,mission_id:config().mission_id,
    now:Date.parse('2026-11-15T12:00:20Z')
  }),/identity or scope mismatch/);
});

test('source revision mismatch and unrecognized provenance always reject',()=>{
  assert.throws(()=>project(negative(),{sourceRevision:'a'.repeat(40)}),
    /EO001_NEGATIVE_RECEIPT_UNVERIFIED/);
  for(const provenanceMode of ['INDEPENDENTLY_VERIFIED','MODEL_AUTHORITATIVE',
    'PROVIDER_VERIFIED',undefined]){
    assert.throws(()=>project(negative(),{provenanceMode}),
      /EO001_PROJECTION_UNAPPROVED_SOURCE_MODE/);
  }
});

test('cannot promote synthetic record to verified cleanup, execution or host attestation',()=>{
  for(const field of ['actual_cleanup_verified','execution_authorized',
    'independent_hardware_attestation']){
    assert.throws(()=>project(negative({[field]:true})),
      /EO001_NEGATIVE_RECEIPT_UNVERIFIED/);
  }
  assert.throws(()=>project(negative({state:'SCOPE_CLEANUP_SUCCESS'})),
    /EO001_NEGATIVE_RECEIPT_UNVERIFIED/);
  assert.throws(()=>project(negative({schema:'evil'})),
    /EO001_NEGATIVE_RECEIPT_UNVERIFIED/);
  assert.throws(()=>project(negative({scope_id:'other.scope'})),
    /EO001_NEGATIVE_RECEIPT_UNVERIFIED/);
});

test('mutated pre-observation digest and source bytes are rejected',()=>{
  const changed=negative();
  changed.pre.detached.stat='tampered';
  assert.throws(()=>project(changed),/EO001_PRE_SNAPSHOT_DIGEST_MISMATCH/);
  assert.throws(()=>project(negative(),{
    sourceBytes:'not-json'
  }),/EO001_SOURCE_BYTES_INVALID|EO001_SOURCE_JSON_INVALID/);
  assert.throws(()=>project(negative(),{
    sourceBytes:Buffer.from([0x7b,0xff,0x7d])
  }),/EO001_SOURCE_ENCODING_INVALID/);
  assert.throws(()=>project(negative(),{
    sourceBytes:'{'+ 'x'.repeat(256*1024)+'}'
  }),/EO001_SOURCE_BYTES_INVALID/);
});

test('wrong tenant/scope IDs and fabricated times cannot become event candidates',()=>{
  for(const options of [
    {tenant_id:'../other'},
    {mission_id:'bad mission'},
    {incident_id:'../scope'},
    {source_id:'fake key with spaces'},
    {actor_id:null},
    {occurred_at:'not-a-time'},
    {observed_at:'2026-11-15T11:59:59Z'},
    {clock_uncertainty_ms:-1},
    {clock_uncertainty_ms:86400001}
  ]) assert.throws(()=>project(negative(),options),
    /EO001_PROJECTION_SCOPE_REQUIRED|EO001_PROJECTION_TIME_UNVERIFIED/);
});

test('identical evidence is idempotent but raw changes cannot reuse the event ID',()=>{
  const a=project();
  const b=project();
  assert.equal(a.payload.event_id,b.payload.event_id);
  assert.equal(a.payload.idempotency_key,b.payload.idempotency_key);
  const changed=negative();
  changed.stop_metadata.secret='another-private-error';
  const c=project(changed);
  assert.notEqual(c.payload.event_id,a.payload.event_id);
  assert.notEqual(c.payload.idempotency_key,a.payload.idempotency_key);
});

test('no implicit sign, filesystem mutation, provider request or containment action',()=>{
  const source=String(projectEo001NegativeToBlackBox);
  for(const bad of ['writeFileSync(','process.kill(','spawn(','fetch(',
    'sign(','systemctl stop']){
    assert.equal(source.includes(bad),false);
  }
});

test('synthetic EO-001 failure flows through original custody and Spider candidate projection',()=>{
  // Entire path runs in one CI process with test-only keys; no live Spider API.
  const result=project();
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const trust={'eo001-ci-source':{
    public_key_pem:publicKey.export({type:'spki',format:'pem'}),
    tenant_id:config().tenant_id,source_id:config().source_id,
    actor_ids:[config().actor_id],permission_scopes:['audit:read']
  }};
  const purpose='evercraft.blackbox.readonly-ingest.v1';
  const envelope={key_id:'eo001-ci-source',purpose,payload:result.payload,
    signature:sign(null,Buffer.from(purpose+'\\n'+JSON.stringify(result.payload)),
      privateKey).toString('base64')};
  const policy={
    tenant_id:config().tenant_id,mission_id:config().mission_id,
    now:Date.parse('2026-11-15T12:00:20Z')
  };
  const journal_root=mkdtempSync(join(tmpdir(),'eo001-blackbox-custody-ci-'));
  try{
    const stored=appendJournalEvent({envelope,trust,policy,journal_root});
    assert.equal(stored.receipt.execution_authority,'NONE_READ_ONLY');
    assert.equal(stored.receipt.external_effect_provider_verified,false);
    assert.equal(stored.receipt.external_effect_state,'UNKNOWN');
    assert.deepEqual(stored.receipt.verified_impact,[]);
    assert.equal(stored.local_custody_state,
      'WRITE_ONCE_FILE_SYNCED_NOT_REMOTE_OR_INDEPENDENT');
    const view=localIncidentProjections({
      journal_root,trust,policy,
      tenant_id:config().tenant_id,mission_id:config().mission_id,
      incident_id:config().incident_id
    });
    assert.equal(view.schema,'evercraft.blackbox.local-readonly-projections.v1');
    assert.equal(view.black_box.timeline.length,1);
    assert.equal(view.black_box.timeline[0].kind,'permission_observation');
    assert.equal(view.black_box.external_provider_verification,'NOT_PERFORMED');
    assert.deepEqual(view.black_box.verified_impact,[]);
    assert.deepEqual(view.black_box.possible_impact,
      ['possible-unverified-worker-continuity']);
    assert.deepEqual(view.spider_society.persistence_candidates.map(x=>({
      type:x.type,resource_id:x.resource_id,state:x.state
    })),[{type:'worker',resource_id:scope,state:'unknown'}]);
    assert.equal(view.spider_society.live_process_inventory,false);
    assert.equal(view.spider_society.no_regeneration_proven,false);
    assert.equal(view.chum.real_chum_invocation,false);
    assert.equal(view.execution_authority,'NONE_READ_ONLY');
    assert.equal(view.proof_state,
      'LOCAL_SIGNED_SOURCE_REVALIDATION_NOT_INDEPENDENT_REMOTE_ATTESTATION');
    assert.throws(()=>appendJournalEvent({envelope,trust,policy,journal_root}),
      /replay or conflicting event id already held/);
    assert.doesNotMatch(JSON.stringify(view),/SECRET_PRIVATE_PROCFS|PRIVATE_STOP_METADATA/);
  }finally{
    rmSync(journal_root,{recursive:true,force:true});
  }
});
