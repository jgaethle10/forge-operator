import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { AmbientWorkQueue } from './ambient-work-queue.mjs';

const clean=v=>String(v??'').trim();
const loopback=host=>['127.0.0.1','localhost','::1'].includes(clean(host).toLowerCase());

function send(res,status,body){
  const bytes=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{
    'content-type':'application/json',
    'content-length':bytes.length,
    'cache-control':'no-store',
  });
  res.end(bytes);
}
async function readJson(req,maxBytes=96*1024){
  const chunks=[];
  let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>maxBytes) throw new Error('ambient_work_api_request_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw?JSON.parse(raw):{};
}

export async function startAmbientWorkApi({
  queueRoot,
  host='127.0.0.1',
  port=0,
  authorizationToken='',
  allowNonLoopback=false,
}={}){
  if(!queueRoot) throw new Error('ambient_work_api_queue_root_required');
  if(!clean(authorizationToken)) throw new Error('ambient_work_api_token_required');
  if(!allowNonLoopback&&!loopback(host)) throw new Error('ambient_work_api_loopback_required');

  const queue=new AmbientWorkQueue({root:queueRoot});
  const instanceId='ambient-work-api-'+randomBytes(8).toString('hex');
  let server=null;

  const health=()=>({
    schema:'evercraft.saban.ambient-work-api-health.v1',
    ok:Boolean(server?.listening),
    service:'saban-ambient-work-api',
    instance_id:instanceId,
    host_scope:loopback(host)?'loopback':'explicit_non_loopback',
    arbitrary_code_execution:false,
    commercial_capacity_authorized:false,
    queued_jobs:queue.list({states:['queued']}).length,
    held_jobs:queue.list({states:['held']}).length,
    retry_wait_jobs:queue.list({states:['retry_wait']}).length,
  });

  server=http.createServer(async(req,res)=>{
    try{
      if(req.method==='GET'&&req.url==='/health'){
        return send(res,200,health());
      }

      if(clean(req.headers.authorization)!=='Bearer '+authorizationToken){
        return send(res,401,{ok:false,error:'ambient_work_api_authorization_required'});
      }

      if(req.method==='POST'&&req.url==='/v1/jobs'){
        const body=await readJson(req);
        const job=queue.submit({
          workload_class:body.workload_class,
          payload:body.payload,
          idempotency_key:body.idempotency_key,
          resources:body.resources||{},
          private_data:body.private_data===true,
          preemptible:body.preemptible!==false,
          checkpointable:body.checkpointable!==false,
          max_attempts:body.max_attempts??3,
        });
        return send(res,job.deduplicated_submission?200:202,{
          ok:true,
          schema:'evercraft.saban.ambient-work-api-submit.v1',
          job_id:job.job_id,
          state:job.state,
          workload_class:job.workload_class,
          payload_hash:job.payload_hash,
          deduplicated_submission:job.deduplicated_submission===true,
          arbitrary_code_execution:false,
          commercial_capacity_authorized:false,
        });
      }

      if(req.method==='GET'&&req.url?.startsWith('/v1/jobs/')){
        const jobId=decodeURIComponent(req.url.slice('/v1/jobs/'.length).split('?')[0]);
        const job=queue.get(jobId);
        if(!job) return send(res,404,{ok:false,error:'ambient_job_not_found'});
        return send(res,200,{ok:true,job});
      }

      if(req.method==='GET'&&req.url==='/v1/summary'){
        const jobs=queue.list();
        const states=jobs.reduce((acc,j)=>{
          acc[j.state]=(acc[j.state]||0)+1;
          return acc;
        },{});
        return send(res,200,{
          ok:true,
          schema:'evercraft.saban.ambient-work-api-summary.v1',
          total:jobs.length,
          states,
          arbitrary_code_execution:false,
          commercial_capacity_authorized:false,
        });
      }

      return send(res,404,{ok:false,error:'not_found'});
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      const status=message.includes('too_large')?413:
        message.includes('conflict')?409:
        message.includes('required')||message.includes('invalid')?400:422;
      return send(res,status,{ok:false,error:message});
    }
  });

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,resolve);
  });
  const address=server.address();
  const actualPort=typeof address==='object'&&address?address.port:port;

  return {
    schema:'evercraft.saban.ambient-work-api.v1',
    service:'saban-ambient-work-api',
    instance_id:instanceId,
    url:'http://'+host+':'+actualPort,
    health,
    close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())),
  };
}
