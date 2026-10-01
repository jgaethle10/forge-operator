import fs from 'node:fs';
import path from 'node:path';
import {
  createHash,
  createHmac,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';

import { normalizeFabricTask, planHeterogeneousFabric } from './heterogeneous-fabric-planner.mjs';
import { executeAmbientFabricPlan } from './ambient-fabric-executor.mjs';

const shaHex=v=>createHash('sha256').update(v).digest('hex');
const sha=v=>'sha256:'+shaHex(v);
function safeDigest(value){
  const m=String(value||'').trim().toLowerCase().match(/^sha256:([a-f0-9]{64})$/);
  if(!m) throw new Error('ambient_memory_digest_invalid');
  return m[1];
}
function atomicWrite(file,content,mode=0o600){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,content,{mode});
  fs.renameSync(tmp,file);
  fs.chmodSync(file,mode);
}
function atomicJson(file,value){atomicWrite(file,JSON.stringify(value,null,2)+'\n',0o600);}
function masterKeyFile(stateDir){return path.join(stateDir,'.secrets','ambient-memory-master-key');}
function loadOrCreateMasterKey(stateDir){
  const file=masterKeyFile(stateDir);
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  if(!fs.existsSync(file)) atomicWrite(file,randomBytes(32).toString('base64')+'\n',0o600);
  const key=Buffer.from(fs.readFileSync(file,'utf8').trim(),'base64');
  if(key.length!==32) throw new Error('ambient_memory_master_key_invalid');
  return key;
}
function objectKey(master,objectDigest){
  return createHmac('sha256',master)
    .update('evercraft-ambient-memory-object-v1|'+objectDigest)
    .digest();
}
function encryptChunk({key,objectDigest,index,count,plaintext}){
  const iv=randomBytes(12);
  const aad=Buffer.from([objectDigest,index,count].join('|'));
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(aad);
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  const tag=cipher.getAuthTag();
  const packed=Buffer.concat([iv,tag,ciphertext]);
  return {
    packed,
    sha256:sha(packed),
    plaintext_sha256:sha(plaintext),
    plaintext_bytes:plaintext.byteLength,
    cipher_bytes:packed.byteLength,
  };
}
function decryptChunk({key,objectDigest,index,count,packed}){
  if(packed.byteLength<28) throw new Error('ambient_memory_ciphertext_too_short');
  const iv=packed.subarray(0,12);
  const tag=packed.subarray(12,28);
  const ciphertext=packed.subarray(28);
  const decipher=createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAAD(Buffer.from([objectDigest,index,count].join('|')));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext),decipher.final()]);
}
function manifestFile(stateDir,objectDigest){
  return path.join(stateDir,'memory','manifests',safeDigest(objectDigest)+'.json');
}
function makeTask({objectDigest,chunkIndex,replicas,cipherBytes}){
  return normalizeFabricTask({
    task_id:'ambient-memory:'+safeDigest(objectDigest).slice(0,20)+':'+chunkIndex,
    workload_class:'systemia.blob-store.v1',
    execution_shape:'atomic',
    replicas,
    resources:{
      cpu_units:0.03,
      memory_mb:96,
      storage_gb:Math.max(0.000001,cipherBytes/1_000_000_000),
    },
    private_data:true,
    preemptible:true,
    checkpointable:true,
    require_attestation:true,
    allowed_access_classes:['authorized_compute'],
    require_distinct_failure_domains:replicas>1,
    failure_domain_axes:['failure_domain'],
    max_observation_age_ms:120000,
    prefer_lower_power:true,
  });
}
function readTask({objectDigest,chunkIndex}){
  return normalizeFabricTask({
    task_id:'ambient-memory-read:'+safeDigest(objectDigest).slice(0,20)+':'+chunkIndex,
    workload_class:'systemia.blob-store.v1',
    resources:{cpu_units:0.03,memory_mb:96,storage_gb:0},
    private_data:true,
    preemptible:true,
    checkpointable:true,
    require_attestation:true,
    allowed_access_classes:['authorized_compute'],
    max_observation_age_ms:120000,
  });
}
function singlePlacementPlan({task,placement,suffix}){
  const unitId=task.task_id+':s0:r0:'+suffix;
  return {
    schema:'evercraft.saban.heterogeneous-fabric-plan.v1',
    state:'ready',
    placements:[{
      ...placement,
      task_id:task.task_id,
      unit_id:unitId,
      shard_index:0,
      replica_index:0,
    }],
    held:[],
    eligible_offers_by_task:{[task.task_id]:[placement.offer_id]},
    receipt_hash:sha(Buffer.from([
      task.task_hash,placement.offer_id,unitId
    ].join('|'))),
  };
}

export async function storeAmbientMemoryObject({
  bytes,
  offers=[],
  performanceLedger=null,
  gatewayUrl,
  gatewayToken,
  stateDir,
  replication=2,
  chunkBytes=24*1024,
  now=new Date(),
}={}){
  if(!stateDir) throw new Error('ambient_memory_state_dir_required');
  const body=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes??'');
  const objectDigest=sha(body);
  const existing=manifestFile(stateDir,objectDigest);
  if(fs.existsSync(existing)){
    const manifest=JSON.parse(fs.readFileSync(existing,'utf8'));
    return {...manifest,deduplicated_object:true};
  }

  const size=Math.max(1024,Math.min(24*1024,Math.floor(Number(chunkBytes||24*1024))));
  const count=Math.max(1,Math.ceil(body.byteLength/size));
  const master=loadOrCreateMasterKey(stateDir);
  const key=objectKey(master,objectDigest);
  const chunks=[];
  for(let index=0;index<count;index++){
    const plain=body.subarray(index*size,Math.min(body.byteLength,(index+1)*size));
    chunks.push({
      index,
      ...encryptChunk({key,objectDigest,index,count,plaintext:plain}),
    });
  }

  const replicaCount=Math.max(1,Math.min(4,Math.floor(Number(replication||2))));
  const placements=[];
  for(const chunk of chunks){
    const task=makeTask({
      objectDigest,
      chunkIndex:chunk.index,
      replicas:replicaCount,
      cipherBytes:chunk.cipher_bytes,
    });
    const plan=planHeterogeneousFabric({
      tasks:[task],
      offers,
      performanceLedger,
      now,
    });
    if(plan.state!=='ready'||plan.placements.length!==replicaCount){
      throw new Error('ambient_memory_insufficient_distinct_storage_capacity:chunk_'+chunk.index);
    }

    const execution=await executeAmbientFabricPlan({
      plan,
      tasks:[task],
      gatewayUrl,
      gatewayToken,
      stateFile:path.join(stateDir,'memory','execution-state.json'),
      inputProvider:async()=>({
        payload:{
          operation:'put',
          sha256:chunk.sha256,
          bytes_base64:chunk.packed.toString('base64'),
        },
      }),
      maxConcurrency:replicaCount,
    });
    if(execution.failed_units||execution.held_units||execution.completed_units!==replicaCount){
      throw new Error('ambient_memory_replication_failed:chunk_'+chunk.index);
    }
    placements.push({
      index:chunk.index,
      cipher_sha256:chunk.sha256,
      plaintext_sha256:chunk.plaintext_sha256,
      plaintext_bytes:chunk.plaintext_bytes,
      cipher_bytes:chunk.cipher_bytes,
      replicas:execution.results.map(r=>({
        device_id:r.device_id,
        offer_id:r.offer_id,
        gateway_receipt_hash:r.gateway_receipt_hash,
        execution_location:r.execution_location,
      })),
    });
  }

  const manifest={
    schema:'evercraft.saban.ambient-memory-object.v1',
    object_sha256:objectDigest,
    plaintext_bytes:body.byteLength,
    chunk_plaintext_bytes:size,
    chunk_count:count,
    replication:replicaCount,
    encryption:{
      algorithm:'AES-256-GCM',
      key_derivation:'HMAC-SHA256 edge master + object digest',
      plaintext_persisted_on_storage_nodes:false,
      master_key_exposed:false,
    },
    chunks:placements,
    external_cash_spend_usd:0,
    commercial_capacity_authorized:false,
    stored_at:(now instanceof Date?now:new Date(now)).toISOString(),
    deduplicated_object:false,
  };
  atomicJson(existing,manifest);
  return manifest;
}

export async function readAmbientMemoryObject({
  object_sha256,
  gatewayUrl,
  gatewayToken,
  stateDir,
}={}){
  if(!stateDir) throw new Error('ambient_memory_state_dir_required');
  const file=manifestFile(stateDir,object_sha256);
  if(!fs.existsSync(file)) throw new Error('ambient_memory_manifest_not_found');
  const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
  const master=loadOrCreateMasterKey(stateDir);
  const key=objectKey(master,manifest.object_sha256);
  const plainChunks=[];
  const readAttempt=randomBytes(8).toString('hex');

  for(const chunk of manifest.chunks||[]){
    let recovered=null;
    const failures=[];
    for(let ri=0;ri<(chunk.replicas||[]).length;ri++){
      const replica=chunk.replicas[ri];
      const task=readTask({objectDigest:manifest.object_sha256,chunkIndex:chunk.index});
      const plan=singlePlacementPlan({
        task,
        placement:{
          task_id:task.task_id,
          offer_id:replica.offer_id,
          provider_id:replica.offer_id,
          device_id:replica.device_id,
          market:'ambient-fabric',
          access_class:'authorized_compute',
          device_class:'unknown',
          failure_domain:replica.device_id,
          score:0,
          effective_score:0,
          zero_cost:true,
          attested:true,
          preemptible:true,
          checkpointable:true,
        },
        suffix:'replica'+ri+':'+readAttempt,
      });
      const execution=await executeAmbientFabricPlan({
        plan,
        tasks:[task],
        gatewayUrl,
        gatewayToken,
        stateFile:path.join(stateDir,'memory','read-execution-state.json'),
        inputProvider:async()=>({
          payload:{operation:'get',sha256:chunk.cipher_sha256},
        }),
        maxConcurrency:1,
      });
      const result=execution.results?.[0];
      const remote=result?.result?.remote_result??result?.result;
      if(result?.status!=='completed'||remote?.ok!==true||!remote?.bytes_base64){
        failures.push({device_id:replica.device_id,reason:result?.reason||'blob_missing'});
        continue;
      }
      const packed=Buffer.from(remote.bytes_base64,'base64');
      if(sha(packed)!==chunk.cipher_sha256){
        failures.push({device_id:replica.device_id,reason:'cipher_digest_mismatch'});
        continue;
      }
      try{
        const plain=decryptChunk({
          key,
          objectDigest:manifest.object_sha256,
          index:chunk.index,
          count:manifest.chunk_count,
          packed,
        });
        if(sha(plain)!==chunk.plaintext_sha256){
          failures.push({device_id:replica.device_id,reason:'plaintext_digest_mismatch'});
          continue;
        }
        recovered=plain;
        break;
      }catch(error){
        failures.push({device_id:replica.device_id,reason:String(error?.message||error)});
      }
    }
    if(!recovered){
      const err=new Error('ambient_memory_chunk_unrecoverable:'+chunk.index);
      err.failures=failures;
      throw err;
    }
    plainChunks.push(recovered);
  }

  const body=Buffer.concat(plainChunks);
  if(body.byteLength!==manifest.plaintext_bytes) throw new Error('ambient_memory_plaintext_size_mismatch');
  if(sha(body)!==manifest.object_sha256) throw new Error('ambient_memory_object_digest_mismatch');
  return {
    schema:'evercraft.saban.ambient-memory-read.v1',
    object_sha256:manifest.object_sha256,
    byte_count:body.byteLength,
    bytes:body,
    object_integrity_verified:true,
    replica_failover_supported:true,
    plaintext_on_storage_nodes:false,
    external_cash_spend_usd:0,
  };
}
