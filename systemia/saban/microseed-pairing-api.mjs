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
async function readJson(req,maxBytes=192*1024){
  const chunks=[];
  let total=0;
  for await(const chunk of req){
    total+=chunk.length;
    if(total>maxBytes) throw new Error('microseed_pairing_request_too_large');
    chunks.push(chunk);
  }
  const text=Buffer.concat(chunks).toString('utf8');
  try{return text?JSON.parse(text):{};}
  catch{throw new Error('microseed_pairing_request_invalid_json');}
}

export async function startMicroSeedPairingApi({
  stateDir,
  registryRoot='',
  host='127.0.0.1',
  port=0,
  allowNonLoopback=false,
  tlsTerminatedUpstream=false,
  maxConcurrent=4,
  perTicketAttemptLimit=12,
  attemptWindowMs=10*60*1000,
}={}){
  if(!stateDir) throw new Error('microseed_pairing_api_state_dir_required');
  if(!allowNonLoopback&&!loopback(host)) throw new Error('microseed_pairing_api_loopback_required');
  if(!loopback(host)&&tlsTerminatedUpstream!==true){
    throw new Error('microseed_pairing_api_nonloopback_requires_tls_termination');
  }
  const registry=new AmbientDeviceRegistry({
    root:path.resolve(registryRoot||path.join(stateDir,'registry')),
  });
  const instanceId='microseed-pairing-'+randomBytes(8).toString('hex');
  const attempts=new Map();
  let active=0;
  let server=null;

  function ticketAttemptAllowed(ticketId,now=Date.now()){
    const id=clean(ticketId)||'unknown';
    const row=attempts.get(id)||{window_started_at:now,count:0};
    if(now-row.window_started_at>=Math.max(60_000,Number(attemptWindowMs||0))){
      row.window_started_at=now;
      row.count=0;
    }
    row.count+=1;
    attempts.set(id,row);
    return row.count<=Math.max(1,Number(perTicketAttemptLimit||12));
  }

  server=http.createServer(async(req,res)=>{
    try{
      if(req.method==='GET'&&req.url==='/health'){
        return send(res,200,{
          ok:true,
          schema:'evercraft.microseed.pairing-api-health.v1',
          service:'microseed-pairing-api',
          instance_id:instanceId,
          host_scope:loopback(host)?'loopback':'explicit_non_loopback',
          can_issue_pairing_tickets:false,
          ticket_list_surface:false,
          execution_surface:false,
          pairing_secret_exposed:false,
          device_token_exposed:false,
          cryptographic_bundle_required:true,
          active_enrollments:active,
          max_concurrent:Math.max(1,Number(maxConcurrent||4)),
          tls_terminated_upstream:tlsTerminatedUpstream===true,
        });
      }
      if(req.method==='POST'&&req.url==='/v1/enroll'){
        if(active>=Math.max(1,Number(maxConcurrent||4))){
          return send(res,429,{ok:false,error:'microseed_pairing_api_concurrency_limit'});
        }
        const body=await readJson(req,256*1024);
        const bundle=body?.bundle??body;
        if(!ticketAttemptAllowed(bundle?.ticket_id)){
          return send(res,429,{
            ok:false,
            error:'microseed_pairing_api_ticket_attempt_limit',
            retry_later:true,
          });
        }
        active+=1;
        try{
          const receipt=consumeMicroSeedPairingBundle({
            stateDir,
            registry,
            bundle,
            now:new Date(),
          });
          return send(res,201,{
            ok:true,
            ...receipt,
            production_eligible:false,
            conformance_required:true,
            calibration_required:true,
            ticket_consumed:true,
          });
        }finally{
          active=Math.max(0,active-1);
        }
      }
      return send(res,404,{ok:false,error:'not_found'});
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      const status=
        message.includes('already_consumed')?409:
        message.includes('expired')?410:
        message.includes('request_too_large')?413:
        message.includes('not_found')?404:
        message.includes('rejected')||
        message.includes('mismatch')||
        message.includes('not_allowed')||
        message.includes('invalid')?403:422;
      return send(res,status,{
        ok:false,
        error:message,
        pairing_secret_exposed:false,
        device_token_exposed:false,
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
    schema:'evercraft.microseed.pairing-api.v1',
    instance_id:instanceId,
    url:'http://'+host+':'+actualPort,
    close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())),
  };
}
