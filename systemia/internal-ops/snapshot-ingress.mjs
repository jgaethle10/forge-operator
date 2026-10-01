import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { assertInternalOpsSnapshotAuthority } from './snapshot.mjs';

function clean(value,max=4000){ return String(value??'').trim().slice(0,max); }
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map((k)=>[k,stable(value[k])]));
  }
  return value;
}
function sha(value){
  const input=typeof value==='string'?value:JSON.stringify(stable(value));
  return 'sha256:'+createHash('sha256').update(input).digest('hex');
}
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function readJsonl(file){
  if(!fs.existsSync(file)) return [];
  return fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map((line)=>JSON.parse(line));
}

export class InternalOpsSnapshotIngress {
  constructor({stateDir,clock=()=>new Date()}={}){
    if(!stateDir) throw new Error('internal_ops_ingress_state_dir_required');
    this.stateDir=path.resolve(stateDir);
    this.snapshotsDir=path.join(this.stateDir,'snapshots');
    this.receiptsFile=path.join(this.stateDir,'receipts.jsonl');
    this.clock=clock;
  }

  #appendReceipt(body){
    const receipt={...body,receipt_hash:sha(body)};
    fs.mkdirSync(this.stateDir,{recursive:true,mode:0o700});
    fs.appendFileSync(this.receiptsFile,JSON.stringify(receipt)+'\n',{mode:0o600});
    return receipt;
  }

  ingest({
    missionKey,
    sourceCheckpointId='',
    snapshot
  }={}){
    const mission=clean(missionKey,180);
    if(!mission) throw new Error('internal_ops_ingress_mission_key_required');
    assertInternalOpsSnapshotAuthority(snapshot);

    const payloadHash=sha(snapshot);
    const checkpoint=clean(sourceCheckpointId,220)||'none';
    const idempotencyHash=sha([mission,checkpoint,payloadHash]);
    const existing=readJsonl(this.receiptsFile).find((row)=>row.idempotency_hash===idempotencyHash);
    if(existing){
      return {
        ok:true,
        accepted:true,
        duplicate:true,
        snapshot_key:existing.snapshot_key,
        receipt_key:existing.receipt_key,
        payload_hash:existing.payload_hash,
        execution_authority_granted:false,
        external_side_effects_authorized:false
      };
    }

    const snapshotKey='internalops_snapshot_'+randomUUID();
    const receiptKey='internalops_ingress_'+randomUUID();
    const observedAt=this.clock().toISOString();
    const record={
      schema:'evercraft.internal-ops.snapshot-record.v1',
      snapshot_key:snapshotKey,
      mission_key:mission,
      source_checkpoint_id:checkpoint==='none'?null:checkpoint,
      payload_hash:payloadHash,
      snapshot,
      accepted_at:observedAt,
      execution_authority_granted:false,
      external_side_effects_authorized:false
    };
    atomicJson(path.join(this.snapshotsDir,snapshotKey+'.json'),record);
    const receipt=this.#appendReceipt({
      schema:'evercraft.internal-ops.snapshot-ingress-receipt.v1',
      receipt_key:receiptKey,
      snapshot_key:snapshotKey,
      mission_key:mission,
      source_checkpoint_id:record.source_checkpoint_id,
      payload_hash:payloadHash,
      idempotency_hash:idempotencyHash,
      accepted_at:observedAt,
      snapshot_authority:'read_only_aggregate',
      execution_authority_granted:false,
      external_side_effects_authorized:false
    });
    return {
      ok:true,
      accepted:true,
      duplicate:false,
      snapshot_key:snapshotKey,
      receipt_key:receiptKey,
      receipt_hash:receipt.receipt_hash,
      payload_hash:payloadHash,
      execution_authority_granted:false,
      external_side_effects_authorized:false
    };
  }

  getSnapshot(snapshotKey){
    const key=clean(snapshotKey,255);
    if(!/^internalops_snapshot_[A-Za-z0-9-]+$/.test(key)) throw new Error('internal_ops_snapshot_key_invalid');
    const file=path.join(this.snapshotsDir,key+'.json');
    if(!fs.existsSync(file)) throw new Error('internal_ops_snapshot_not_found');
    return JSON.parse(fs.readFileSync(file,'utf8'));
  }

  health(){
    return {
      schema:'evercraft.internal-ops.snapshot-ingress-health.v1',
      state:'healthy',
      accepted_contract:'eps_systemia_read_only_snapshot_v1',
      idempotent:true,
      execution_authority_granted:false,
      external_side_effects_authorized:false,
      source_platform_dependency:false
    };
  }
}
