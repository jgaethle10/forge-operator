import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { executeMicroSeedWorkload } from './microseed-executor.mjs';

function clean(v){return String(v??'').trim();}
function send(res,status,body){
  const bytes=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{
    'content-type':'application/json',
    'content-length':bytes.length,
    'cache-control':'no-store',
  });
  res.end(bytes);
}
async function readJson(req,maxBytes=128*1024){
  const chunks=[]; let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>maxBytes) throw new Error('microseed_agent_request_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw?JSON.parse(raw):{};
}

export async function startMicroSeedNativeAgent({
  manifest,
  stateDir,
  host='127.0.0.1',
  port=0,
  authorizationToken='',
  telemetryProvider=async()=>({
    primary_function_busy:false,
    cpu_utilization:0,
    memory_free_mb:1024,
    external_power:true,
    network_utilization:0,
    observed_at:new Date().toISOString(),
    max_age_ms:60000,
  }),
}={}){
  if(manifest?.schema!=='evercraft.microseed.device-manifest.v1'){
    throw new Error('microseed_agent_manifest_required');
  }
  if(manifest.compute_execution_mode!=='native_device'){
    throw new Error('microseed_agent_native_device_manifest_required');
  }
  if(manifest.bridge_mode!=='native_agent'){
    throw new Error('microseed_agent_bridge_mode_required');
  }
  if(!stateDir) throw new Error('microseed_agent_state_dir_required');
  if(!clean(authorizationToken)) throw new Error('microseed_agent_token_required');

  const instanceId='microseed-agent-'+randomBytes(8).toString('hex');
  let active=0;
  let server=null;

  const health=()=>({
    schema:'evercraft.microseed.native-agent-health.v1',
    ok:Boolean(server?.listening),
    service:'evercraft-microseed-native-agent',
    instance_id:instanceId,
    device_id:manifest.device_id,
    device_class:manifest.device_class,
    compute_execution_mode:'native_device',
    supported_workloads:manifest.supported_workloads,
    arbitrary_code_execution:false,
    active_executions:active,
  });

  server=http.createServer(async(req,res)=>{
    try{
      if(req.method==='GET'&&req.url==='/health') return send(res,200,health());

      if(clean(req.headers.authorization)!=='Bearer '+authorizationToken){
        return send(res,401,{ok:false,error:'microseed_agent_authorization_required'});
      }

      if(req.method==='GET'&&req.url==='/v1/telemetry'){
        const telemetry=await telemetryProvider({manifest,request:null});
        return send(res,200,{
          ok:true,
          schema:'evercraft.microseed.device-telemetry.v1',
          device_id:manifest.device_id,
          telemetry:{
            ...telemetry,
            observed_at:telemetry?.observed_at||new Date().toISOString(),
          },
          arbitrary_code_execution:false,
        });
      }

      if(req.method==='POST'&&req.url==='/v1/execute'){
        const max=Math.max(1,Number(manifest.constraints?.max_concurrency||1));
        if(active>=max) return send(res,429,{ok:false,error:'microseed_agent_concurrency_limit'});
        const body=await readJson(req);
        active+=1;
        try{
          const telemetry=await telemetryProvider({manifest,request:body.request||body});
          const receipt=await executeMicroSeedWorkload({
            manifest,
            trustDecision:{eligible:true,state:'active',reason:'local_agent_authorized'},
            telemetry,
            request:body.request||body,
            stateDir,
            executionContext:'device',
            now:new Date(),
          });
          return send(res,200,{ok:true,...receipt});
        }finally{
          active=Math.max(0,active-1);
        }
      }

      return send(res,404,{ok:false,error:'not_found'});
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      const status=message.includes('safety_hold')?409:
        message.includes('too_large')?413:422;
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
    schema:'evercraft.microseed.native-agent.v1',
    instance_id:instanceId,
    device_id:manifest.device_id,
    url:'http://'+host+':'+actualPort,
    health,
    close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())),
  };
}
