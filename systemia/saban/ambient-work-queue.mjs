import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { microSeedWorkloadSpec } from './microseed-workload-registry.mjs';

const sha=v=>'sha256:'+createHash('sha256').update(
  typeof v==='string'?v:JSON.stringify(v)
).digest('hex');
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  }
  return value;
}
function safe(v){
  const x=String(v||'').trim().replace(/[^a-zA-Z0-9._:-]/g,'_').slice(0,220);
  if(!x) throw new Error('ambient_job_safe_id_required');
  return x;
}
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function payloadBytes(payload){return Buffer.byteLength(JSON.stringify(payload??null));}

export class AmbientWorkQueue{
  constructor({root}={}){
    if(!root) throw new Error('ambient_work_queue_root_required');
    this.root=path.resolve(root);
    this.jobsDir=path.join(this.root,'jobs');
    fs.mkdirSync(this.jobsDir,{recursive:true,mode:0o700});
  }

  file(jobId){return path.join(this.jobsDir,safe(jobId)+'.json');}

  get(jobId){
    const file=this.file(jobId);
    return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
  }

  submit({
    workload_class,
    payload,
    idempotency_key,
    resources={},
    private_data=false,
    preemptible=true,
    checkpointable=true,
    max_attempts=3,
    requested_at=new Date().toISOString(),
  }={}){
    const workload=String(workload_class||'').trim();
    const idempotency=String(idempotency_key||'').trim();
    if(!workload) throw new Error('ambient_job_workload_required');
    if(!idempotency) throw new Error('ambient_job_idempotency_key_required');
    const spec=microSeedWorkloadSpec(workload);
    if(!spec) throw new Error('ambient_job_workload_not_registered');
    if(spec.product_submission_allowed===false){
      throw new Error('ambient_job_workload_infrastructure_only');
    }
    if(private_data===true&&spec.private_data_allowed!==true){
      throw new Error('ambient_job_workload_disallows_private_data');
    }
    if(payloadBytes(payload)>spec.max_payload_bytes) throw new Error('ambient_job_payload_too_large');
    if(preemptible===true&&checkpointable!==true){
      throw new Error('ambient_job_preemptible_requires_checkpointable');
    }
    const payloadHash=sha(stable(payload));
    const jobId='ajob-'+createHash('sha256')
      .update(workload+'|'+idempotency)
      .digest('hex').slice(0,24);
    const existing=this.get(jobId);
    if(existing){
      if(existing.payload_hash!==payloadHash||existing.workload_class!==workload){
        throw new Error('ambient_job_idempotency_conflict');
      }
      return {...existing,deduplicated_submission:true};
    }

    const body={
      schema:'evercraft.saban.ambient-job.v1',
      job_id:jobId,
      workload_class:workload,
      idempotency_key:idempotency,
      payload,
      payload_hash:payloadHash,
      resources:{
        cpu_units:Math.max(0,Number(resources.cpu_units||0.05)),
        memory_mb:Math.max(0,Number(resources.memory_mb||64)),
        storage_gb:Math.max(0,Number(resources.storage_gb||0)),
        gpu_count:Math.max(0,Math.floor(Number(resources.gpu_count||0))),
        gpu_models:Array.isArray(resources.gpu_models)
          ? [...new Set(resources.gpu_models.map(x=>String(x).trim().toLowerCase()).filter(Boolean))].slice(0,16)
          : [],
      },
      private_data:private_data===true,
      preemptible:preemptible===true,
      checkpointable:checkpointable===true,
      state:'queued',
      attempts:0,
      max_attempts:Math.max(1,Math.floor(Number(max_attempts||3))),
      checkpoint:null,
      result:null,
      execution_receipt:null,
      last_error:null,
      last_hold:null,
      requested_at,
      updated_at:requested_at,
      deduplicated_submission:false,
    };
    const job={...body,job_hash:sha(body)};
    atomicJson(this.file(jobId),job);
    return job;
  }

  update(jobId,patch={}){
    const current=this.get(jobId);
    if(!current) throw new Error('ambient_job_not_found');
    const next={
      ...current,
      ...patch,
      job_id:current.job_id,
      workload_class:current.workload_class,
      idempotency_key:current.idempotency_key,
      payload_hash:current.payload_hash,
      updated_at:patch.updated_at||new Date().toISOString(),
    };
    atomicJson(this.file(jobId),next);
    return next;
  }

  list({states=null}={}){
    const allowed=states?new Set(states.map(String)):null;
    return fs.readdirSync(this.jobsDir)
      .filter(x=>x.endsWith('.json'))
      .map(x=>JSON.parse(fs.readFileSync(path.join(this.jobsDir,x),'utf8')))
      .filter(x=>!allowed||allowed.has(x.state))
      .sort((a,b)=>a.requested_at.localeCompare(b.requested_at)||a.job_id.localeCompare(b.job_id));
  }
}
