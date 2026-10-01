#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AmbientWorkQueue } from './ambient-work-queue.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};
const has=name=>process.argv.includes(name);

function payloadFromFile(file){
  const target=path.resolve(file||'');
  if(!target||!fs.existsSync(target)) throw new Error('ambient_work_payload_file_missing');
  const text=fs.readFileSync(target,'utf8');
  try{return JSON.parse(text);}
  catch{throw new Error('ambient_work_payload_file_invalid_json');}
}

async function main(){
  const command=process.argv[2]||'list';
  const root=path.resolve(
    arg('--root',process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient'))
  );
  const queue=new AmbientWorkQueue({root:path.join(root,'work-queue')});

  if(command==='submit'){
    const workload=arg('--workload','');
    const idempotency=arg('--idempotency-key','');
    const payloadFile=arg('--payload-file','');
    const job=queue.submit({
      workload_class:workload,
      idempotency_key:idempotency,
      payload:payloadFromFile(payloadFile),
      resources:{
        cpu_units:Number(arg('--cpu-units','0.05')),
        memory_mb:Number(arg('--memory-mb','64')),
        storage_gb:Number(arg('--storage-gb','0')),
      },
      private_data:has('--private-data'),
      preemptible:!has('--non-preemptible'),
      checkpointable:!has('--non-checkpointable'),
      max_attempts:Number(arg('--max-attempts','3')),
    });
    process.stdout.write(JSON.stringify({
      schema:'evercraft.saban.ambient-work-submit-receipt.v1',
      job_id:job.job_id,
      state:job.state,
      workload_class:job.workload_class,
      payload_hash:job.payload_hash,
      deduplicated_submission:job.deduplicated_submission===true,
      arbitrary_code_execution:false,
      commercial_capacity_authorized:false,
    },null,2)+'\n');
    return;
  }

  if(command==='get'){
    const jobId=arg('--job-id','');
    const job=queue.get(jobId);
    if(!job) throw new Error('ambient_job_not_found');
    process.stdout.write(JSON.stringify(job,null,2)+'\n');
    return;
  }

  if(command==='list'){
    const states=arg('--states','')
      .split(',')
      .map(x=>x.trim())
      .filter(Boolean);
    const jobs=queue.list({states:states.length?states:null});
    process.stdout.write(JSON.stringify({
      schema:'evercraft.saban.ambient-work-list.v1',
      count:jobs.length,
      jobs,
    },null,2)+'\n');
    return;
  }

  throw new Error('ambient_work_command_unsupported:'+command);
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.saban.ambient-work-cli-error.v1',
      error:error instanceof Error?error.message:String(error),
      arbitrary_code_execution:false,
      commercial_capacity_authorized:false,
    })+'\n');
    process.exitCode=1;
  });
}
