import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {projectPrivateEo001ArchiveToBlackBox}
  from './eo001-private-archive-reader.mjs';

const SHA=b=>createHash('sha256').update(b).digest('hex');
const revision='f'.repeat(40);
const scopeId='eo001-g1-synthetic-'+'a'.repeat(32)+'.scope';
const policy=()=>({
  sourceRevision:revision,provenanceMode:'SYNTHETIC_FIXTURE',
  tenant_id:'evercraft',mission_id:'evercraft-agent-continuity-fabric-20261016',
  incident_id:'eo001-archive-fixture',source_id:'eo001-review-collector',
  agent_id:'eo001-synthetic-worker',workload_id:'synthetic-worker',
  operation_id:'lab-case-one',actor_id:'eo001-reviewer',
  occurred_at:'2026-11-15T12:00:00Z',
  observed_at:'2026-11-15T12:00:01Z',
  clock_uncertainty_ms:3000
});
const fixture=()=>{
  const pre={boot_id:'12345678-1234-4123-8123-123456789abc',
    worker:{pid:31001,stat:'PRIVATE_PROCFS_STAT',cgroup:'0::/cgroup'},
    detached:{pid:31002,stat:'PRIVATE_DESCENDANT_STAT'}};
  return {
    schema:'evercraft.eo001.gate1.private-negative-observation.v1',
    state:'SCOPE_LIFECYCLE_OBSERVATION_BLOCKED',
    reason:'POSTSTOP_KERNEL_EVIDENCE_MISSING',
    stage:'POST_KERNEL_READBACK',
    scope_id:scopeId,source_revision:revision,
    pre_sha256:SHA(Buffer.from(JSON.stringify(pre))),
    pre,stop_metadata:{private:'SECRET_STOP_COMMAND'},
    actual_cleanup_verified:false,
    execution_authorized:false,
    independent_hardware_attestation:false
  };
};
const wrap=(receipt=fixture(),patch={})=>({
  schema:'evercraft.eo001.private-evidence-archive.v1',
  category:'supervisor-negative',
  source_revision:revision,
  evidence_provenance_authenticated:false,
  local_file_tamper_resistant:false,
  receipt,...patch
});
function withPrivateDir(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-blackbox-read-ci-'));
  try{return fn(dir);}finally{
    fs.chmodSync(dir,0o700);
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
function save(dir,payload=wrap()){
  const raw=Buffer.from(JSON.stringify(payload),'utf8');
  const file='eo001-private-'+SHA(raw)+'.json';
  fs.writeFileSync(path.join(dir,file),raw,{mode:0o600,flag:'wx'});
  return file;
}
const read=(dir,file,options={})=>projectPrivateEo001ArchiveToBlackBox({
  directory:dir,filename:file,...policy(),...options
});

test('valid private archive yields only canonical unsigned Black Box candidate',()=>{
  withPrivateDir(dir=>{
    const file=save(dir);
    const got=read(dir,file);
    assert.equal(got.state,'ARCHIVE_HASH_MATCHED_UNSIGNED_INCIDENT_CANDIDATE');
    assert.equal(got.archive_sha256,file.slice(14,-5));
    assert.equal(got.archive_local_integrity_checked,true);
    assert.equal(got.archive_signer_authenticated,false);
    assert.equal(got.physical_host_attestation_verified,false);
    assert.equal(got.original_scope_cleanup_verified,false);
    assert.equal(got.execution_authority,'NONE_READ_ONLY');
    assert.equal(got.live_spider_service_invoked,false);
    assert.equal(got.incident_candidate.payload.external_effect,'UNKNOWN');
    assert.equal(got.incident_candidate.payload.evidence_kind,'synthetic');
    assert.equal(got.incident_candidate.payload.verified_impact.length,0);
    assert.deepEqual(got.incident_candidate.payload.persistence_paths,[{
      type:'worker',resource_id:scopeId,state:'unknown'
    }]);
    assert.doesNotMatch(JSON.stringify(got),
      /PRIVATE_PROCFS_STAT|PRIVATE_DESCENDANT_STAT|SECRET_STOP_COMMAND|31001|31002/);
  });
});

test('archive filename and original bytes bind exactly',()=>{
  withPrivateDir(dir=>{
    const file=save(dir);
    fs.appendFileSync(path.join(dir,file),' ');
    assert.throws(()=>read(dir,file),
      /EO001_ARCHIVE_CONTENT_DIGEST_MISMATCH/);
  });
});

test('symlinked file and hard-linked alias are refused even with matching bytes',()=>{
  withPrivateDir(dir=>{
    const file=save(dir);
    const filename=path.join(dir,file);
    const original=filename+'.orig';
    fs.renameSync(filename,original);
    fs.symlinkSync(original,filename);
    assert.throws(()=>read(dir,file),/EO001_ARCHIVE_READ_UNVERIFIED/);
    fs.unlinkSync(filename);
    fs.renameSync(original,filename);
    fs.linkSync(filename,filename+'.hardlink');
    assert.throws(()=>read(dir,file),/EO001_ARCHIVE_FILE_UNTRUSTED/);
  });
});

test('world- or group-readable archive / parent directory are refused',()=>{
  withPrivateDir(dir=>{
    const file=save(dir);
    fs.chmodSync(path.join(dir,file),0o640);
    assert.throws(()=>read(dir,file),/EO001_ARCHIVE_FILE_UNTRUSTED/);
    fs.chmodSync(path.join(dir,file),0o600);
    fs.chmodSync(dir,0o750);
    assert.throws(()=>read(dir,file),/EO001_ARCHIVE_DIRECTORY_UNTRUSTED/);
  });
});

test('reject arbitrary paths, mismatched source pin and fabricated provenance',()=>{
  withPrivateDir(dir=>{
    const file=save(dir);
    assert.throws(()=>read(dir,'../../../etc/passwd'),
      /EO001_ARCHIVE_LOCATION_INVALID/);
    assert.throws(()=>read(dir,file,{sourceRevision:'a'.repeat(40)}),
      /EO001_ARCHIVE_UNVERIFIED_ENVELOPE/);
    assert.throws(()=>read(dir,file,{provenanceMode:'INDEPENDENT_SUPERVISOR'}),
      /EO001_ARCHIVE_PROVENANCE_UNVERIFIED/);
    assert.throws(()=>read(dir,file,{mission_id:'evil mission'}),
      /EO001_PROJECTION_SCOPE_REQUIRED/);
  });
});

test('archive self-reports of attested hardware or successful cleanup fail closed',()=>{
  for(const patch of [
    {evidence_provenance_authenticated:true},
    {local_file_tamper_resistant:true},
    {category:'supervisor-consistency'},
    {source_revision:'a'.repeat(40)}
  ]) withPrivateDir(dir=>{
    const file=save(dir,wrap(fixture(),patch));
    assert.throws(()=>read(dir,file),/EO001_ARCHIVE_UNVERIFIED_ENVELOPE/);
  });
  withPrivateDir(dir=>{
    const record=fixture();record.actual_cleanup_verified=true;
    const file=save(dir,wrap(record));
    assert.throws(()=>read(dir,file),/EO001_NEGATIVE_RECEIPT_UNVERIFIED/);
  });
});

test('cannot treat a locally content-matching archive as a real source signature',()=>{
  withPrivateDir(dir=>{
    const file=save(dir);
    const got=read(dir,file,{provenanceMode:'OPERATOR_REPORTED_PHYSICAL'});
    assert.equal(got.archive_signer_authenticated,false);
    assert.equal(got.incident_candidate.source_signature_verified,false);
    assert.equal(got.incident_candidate.independent_host_attestation_verified,false);
    assert.equal(got.incident_candidate.payload.evidence_kind,'source_report');
  });
});
