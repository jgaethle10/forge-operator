import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

import { AmbientDeviceRegistry } from './ambient-device-registry.mjs';
import { consumeMicroSeedPairingBundle } from './microseed-pairing.mjs';

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
async function readJson(req,maxBytes=256*1024){
  const chunks=[];
  let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>maxBytes) throw new Error('microseed_enrollment_request_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw?JSON.parse(raw):{};
}
function statusFor(message){
  if(message.includes('too_large')) return 413;
  if(message.includes('already_consumed')) return 409;
  if(message.includes('expired')) return 410;
  if(
    message.includes('rejected')||
    message.includes('signature')||
    message.includes('ticket_device_mismatch')||
    message.includes('workload_not_allowed')||
    message.includes('device_class_not_allowed')
  ) return 403;
  if(message.includes('not_found')||message.includes('required')||message.includes('invalid')) return 400;
  return 422;
}

export async function startMicroSeedEnrollmentGateway({
  stateDir,
  host='127.0.0.1',
  port=0,
  allowNonLoopback=false,
  tlsTerminatedUpstream=false,
  maxConcurrent=4,
  perTicketAttemptLimit=12,
  attemptWindowMs=10*60*1000,
}={}){
  if(!stateDir) throw new Error('microseed_enrollment_state_dir_required');
  if(!allowNonLoopback&&!loopback(host)) throw new Error('microseed_enrollment_loopback_required');
  if(!loopback(host)&&tlsTerminatedUpstream!==true){
    throw new Error('microseed_enrollment_nonloopback_requires_tls_termination');
  }

  const resolvedStateDir=path.resolve(stateDir);
  const registry=new AmbientDeviceRegistry({root:path.join(resolvedStateDir,'registry')});
  const instanceId='microseed-enrollment-'+randomBytes(8).toString('hex');
  const attempts=new Map();
  let active=0;
  let server=null;

  function ticketAttemptAllowed(ticketId,now=Date.now()){
    const id=clean(ticketId)||'unknown';
    const row=attempts.get(id)||{window_started_at:now,count:0};
    if(now-row.window_started_at>=attemptWindowMs){
      row.window_started_at=now;
      row.count=0;
    }
    row.count+=1;
    attempts.set(id,row);
    return {
      allowed:row.count<=Math.max(1,Number(perTicketAttemptLimit||12)),
      count:row.count,
      window_started_at:row.window_started_at,
    };
  }

  const health=()=>({
    schema:'evercraft.microseed.enrollment-gateway-health.v1',
    ok:Boolean(server?.listening),
    service:'evercraft-microseed-enrollment-gateway',
    instance_id:instanceId,
    host_scope:loopback(host)?'loopback':'explicit_non_loopback',
    tls_terminated_upstream:tlsTerminatedUpstream===true,
    ticket_issue_surface:false,
    ticket_list_surface:false,
    execution_surface:false,
    active_enrollments:active,
    max_concurrent:Math.max(1,Number(maxConcurrent||4)),
    cryptographic_bundle_required:true,
  });

  server=http.createServer(async(req,res)=>{
    try{
      if(req.method==='GET'&&req.url==='/health') return send(res,200,health());
      if(req.method!=='POST'||req.url!=='/v1/enroll'){
        return send(res,404,{ok:false,error:'not_found'});
      }

      if(active>=Math.max(1,Number(maxConcurrent||4))){
        return send(res,429,{ok:false,error:'microseed_enrollment_concurrency_limit'});
      }
      const body=await readJson(req);
      const bundle=body?.bundle??body;
      const attempt=ticketAttemptAllowed(bundle?.ticket_id);
      if(!attempt.allowed){
        return send(res,429,{
          ok:false,
          error:'microseed_enrollment_ticket_attempt_limit',
          retry_later:true,
        });
      }

      active+=1;
      try{
        const receipt=consumeMicroSeedPairingBundle({
          stateDir:resolvedStateDir,
          registry,
          bundle,
          now:new Date(),
        });
        return send(res,201,{
          ok:true,
          schema:'evercraft.microseed.enrollment-gateway-receipt.v1',
          receipt,
          production_eligible:false,
          conformance_required:true,
          calibration_required:true,
          ticket_consumed:true,
          device_token_exposed:false,
          pairing_secret_exposed:false,
        });
      }finally{
        active=Math.max(0,active-1);
      }
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      return send(res,statusFor(message),{
        ok:false,
        error:message,
        device_token_exposed:false,
        pairing_secret_exposed:false,
      });
    }
  });

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,resolve);
  });
  const address=server.address();
  const actualPort=typeof address==='object'&&address?address.port:port;

  return {
    schema:'evercraft.microseed.enrollment-gateway.v1',
    instance_id:instanceId,
    url:'http://'+host+':'+actualPort,
    health,
    close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())),
  };
}
