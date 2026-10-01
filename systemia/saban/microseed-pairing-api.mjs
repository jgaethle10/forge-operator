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
}={}){
  if(!stateDir) throw new Error('microseed_pairing_api_state_dir_required');
  if(!allowNonLoopback&&!loopback(host)) throw new Error('microseed_pairing_api_loopback_required');
  const registry=new AmbientDeviceRegistry({
    root:path.resolve(registryRoot||path.join(stateDir,'registry')),
  });
  const instanceId='microseed-pairing-'+randomBytes(8).toString('hex');
  let server=null;

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
          pairing_secret_exposed:false,
          device_token_exposed:false,
        });
      }
      if(req.method==='POST'&&req.url==='/v1/enroll'){
        const bundle=await readJson(req);
        const receipt=consumeMicroSeedPairingBundle({
          stateDir,
          registry,
          bundle,
          now:new Date(),
        });
        return send(res,201,{ok:true,...receipt});
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
