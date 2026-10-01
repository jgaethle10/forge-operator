import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { AmbientWorkQueue } from './ambient-work-queue.mjs';
import { AmbientDeviceRegistry } from './ambient-device-registry.mjs';
import {
  issueMicroSeedPairingTicket,
  listMicroSeedPairingTickets,
  showMicroSeedPairingTicket,
  revokeMicroSeedPairingTicket,
  consumeMicroSeedPairingBundle,
} from './microseed-pairing.mjs';

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
  stateDir='',
  host='127.0.0.1',
  port=0,
  authorizationToken='',
  pairingAuthorizationToken='',
  allowNonLoopback=false,
}={}){
  if(!queueRoot) throw new Error('ambient_work_api_queue_root_required');
  if(!clean(authorizationToken)) throw new Error('ambient_work_api_token_required');
  if(!allowNonLoopback&&!loopback(host)) throw new Error('ambient_work_api_loopback_required');

  const queue=new AmbientWorkQueue({root:queueRoot});
  const resolvedStateDir=path.resolve(stateDir||path.dirname(queueRoot));
  const registry=new AmbientDeviceRegistry({root:path.join(resolvedStateDir,'registry')});
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
    pairing_desk_enabled:Boolean(clean(pairingAuthorizationToken)),
    pairing_authority_separate:true,
  });

  server=http.createServer(async(req,res)=>{
    try{
      if(req.method==='GET'&&req.url==='/health'){
        return send(res,200,health());
      }

      if(req.url?.startsWith('/v1/pairing/')){
        if(!clean(pairingAuthorizationToken)){
          return send(res,503,{ok:false,error:'pairing_desk_not_configured'});
        }
        if(clean(req.headers['x-evercraft-pairing-token'])!==pairingAuthorizationToken){
          return send(res,401,{ok:false,error:'pairing_authorization_required'});
        }

        if(req.method==='POST'&&req.url==='/v1/pairing/tickets'){
          const body=await readJson(req);
          const issue=issueMicroSeedPairingTicket({
            stateDir:resolvedStateDir,
            approval_ref:body.approval_ref,
            device_id:body.device_id||null,
            allowed_device_classes:Array.isArray(body.allowed_device_classes)?body.allowed_device_classes:[],
            allowed_workloads:Array.isArray(body.allowed_workloads)?body.allowed_workloads:[],
            ttl_ms:body.ttl_ms??15*60*1000,
            enrollment_url:body.enrollment_url||'',
            now:new Date(),
          });
          return send(res,201,{
            ok:true,
            schema:'evercraft.saban.pairing-api-ticket.v1',
            ticket:issue.ticket_card,
            pairing_secret_exposed_in_ticket:true,
            execution_gateway_authority:false,
          });
        }

        if(req.method==='GET'&&req.url==='/v1/pairing/tickets'){
          return send(res,200,{
            ok:true,
            ...listMicroSeedPairingTickets({
              stateDir:resolvedStateDir,
              now:new Date(),
            }),
          });
        }

        if(req.method==='GET'&&req.url?.startsWith('/v1/pairing/tickets/')){
          const ticketId=decodeURIComponent(req.url.slice('/v1/pairing/tickets/'.length).split('?')[0]);
          return send(res,200,{
            ok:true,
            ticket:showMicroSeedPairingTicket({
              stateDir:resolvedStateDir,
              ticket_id:ticketId,
              now:new Date(),
            }),
          });
        }

        if(req.method==='DELETE'&&req.url?.startsWith('/v1/pairing/tickets/')){
          const ticketId=decodeURIComponent(req.url.slice('/v1/pairing/tickets/'.length).split('?')[0]);
          return send(res,200,{
            ok:true,
            receipt:revokeMicroSeedPairingTicket({
              stateDir:resolvedStateDir,
              ticket_id:ticketId,
              reason:'pairing_api_revoked',
              now:new Date(),
            }),
          });
        }

        if(req.method==='POST'&&req.url==='/v1/pairing/enroll'){
          const body=await readJson(req,256*1024);
          const receipt=consumeMicroSeedPairingBundle({
            stateDir:resolvedStateDir,
            registry,
            bundle:body.bundle??body,
            now:new Date(),
          });
          return send(res,201,{
            ok:true,
            receipt,
            production_eligible:false,
            conformance_required:true,
            calibration_required:true,
          });
        }

        return send(res,404,{ok:false,error:'pairing_route_not_found'});
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
