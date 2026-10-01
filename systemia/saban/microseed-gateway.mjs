import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { AmbientDeviceRegistry } from './ambient-device-registry.mjs';
import { evaluateAmbientTrust } from './ambient-device-trust.mjs';
import { executeMicroSeedWorkload } from './microseed-executor.mjs';
import { loadPerformanceLedger, recordPerformanceSample, savePerformanceLedger } from './performance-learning.mjs';
import { runMicroSeedConformance } from './microseed-conformance.mjs';
import { runMicroSeedCalibration } from './microseed-calibration.mjs';

function clean(v){return String(v??'').trim();}
function loopback(host){
  return ['127.0.0.1','localhost','::1'].includes(clean(host).toLowerCase());
}
function observedEnergyWh(telemetry,durationMs){
  if(telemetry?.power_measurement_state!=='observed') return null;
  const watts=Number(telemetry?.power_watts);
  if(!Number.isFinite(watts)||watts<0) return null;
  return Number((watts*Math.max(0,Number(durationMs||0))/3600000).toFixed(9));
}
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
    if(bytes>maxBytes) throw new Error('microseed_gateway_request_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw?JSON.parse(raw):{};
}

export async function startMicroSeedGateway({
  registryRoot,
  stateDir,
  host='127.0.0.1',
  port=0,
  authorizationToken='',
  bridgeAdapters={},
  performanceLedgerFile='',
  allowNonLoopback=false,
  globalMaxConcurrency=8,
}={}){
  if(!registryRoot) throw new Error('microseed_gateway_registry_root_required');
  if(!stateDir) throw new Error('microseed_gateway_state_dir_required');
  if(!clean(authorizationToken)) throw new Error('microseed_gateway_token_required');
  if(!allowNonLoopback&&!loopback(host)) throw new Error('microseed_gateway_loopback_required');

  const registry=new AmbientDeviceRegistry({root:registryRoot});
  const performanceFile=performanceLedgerFile||stateDir+'/performance-ledger.json';
  const instanceId='microseed-gateway-'+randomBytes(8).toString('hex');
  const activeByDevice=new Map();
  let activeGlobal=0;
  let server=null;

  const health=()=>({
    schema:'evercraft.saban.microseed-gateway-health.v1',
    ok:Boolean(server?.listening),
    service:'saban-microseed-gateway',
    instance_id:instanceId,
    host_scope:loopback(host)?'loopback':'explicit_non_loopback',
    arbitrary_code_execution:false,
    commercial_capacity:false,
    active_executions:activeGlobal,
    registered_device_count:registry.list({now:new Date()}).device_count,
    eligible_device_count:registry.list({now:new Date()}).eligible_count,
  });

  async function executeAndLearn({manifest,trustDecision,telemetry,request}){
    const startedAt=Date.now();
    const deviceId=manifest.device_id;
    try{
      const receipt=await executeMicroSeedWorkload({
        manifest,
        trustDecision,
        telemetry:telemetry||{},
        request,
        stateDir,
        bridgeAdapters,
        executionContext:'gateway',
        now:new Date(),
      });
      const duration=Math.max(0,Date.now()-startedAt);
      const ledger=loadPerformanceLedger(performanceFile);
      recordPerformanceSample(ledger,{
        device_id:deviceId,
        workload_class:String(request?.workload_class||'unknown'),
        ok:true,
        duration_ms:duration,
        bytes_processed:
          receipt?.result?.byte_count??
          receipt?.result?.remote_result?.byte_count??
          null,
        checkpointed:Boolean(receipt?.checkpoint),
        preempted:false,
        thermal_hold:false,
        energy_wh:observedEnergyWh(telemetry,duration),
        observed_at:new Date().toISOString(),
      });
      savePerformanceLedger(performanceFile,ledger);
      return receipt;
    }catch(error){
      const duration=Math.max(0,Date.now()-startedAt);
      const ledger=loadPerformanceLedger(performanceFile);
      recordPerformanceSample(ledger,{
        device_id:deviceId,
        workload_class:String(request?.workload_class||'unknown'),
        ok:false,
        duration_ms:duration,
        checkpointed:false,
        preempted:String(error?.message||error).includes('preempt'),
        thermal_hold:String(error?.message||error).includes('temperature'),
        energy_wh:observedEnergyWh(telemetry,duration),
        observed_at:new Date().toISOString(),
      });
      savePerformanceLedger(performanceFile,ledger);
      throw error;
    }
  }

  server=http.createServer(async(req,res)=>{
    try{
      if(req.method==='GET'&&req.url==='/health'){
        return send(res,200,health());
      }

      const auth=clean(req.headers.authorization);
      if(auth!=='Bearer '+authorizationToken){
        return send(res,401,{ok:false,error:'microseed_gateway_authorization_required'});
      }

      if(req.method==='POST'&&req.url==='/v1/conformance'){
        const body=await readJson(req);
        const deviceId=clean(body?.device_id);
        if(!deviceId) return send(res,400,{ok:false,error:'device_id_required'});
        const record=registry.get(deviceId);
        const manifest=registry.manifest(deviceId);
        if(!record||!manifest) return send(res,404,{ok:false,error:'microseed_device_not_registered'});

        const trustDecision=evaluateAmbientTrust(record,{now:new Date()});
        if(!trustDecision.eligible){
          return send(res,403,{
            ok:false,
            error:'microseed_device_not_eligible',
            trust_state:trustDecision.state,
            reason:trustDecision.reason,
          });
        }
        if(!body.telemetry||typeof body.telemetry!=='object'){
          return send(res,400,{ok:false,error:'conformance_telemetry_required'});
        }

        const conformance=await runMicroSeedConformance({
          manifest,
          trustDecision,
          execute:({workload_class,idempotency_key,payload})=>
            executeAndLearn({
              manifest,
              trustDecision,
              telemetry:body.telemetry,
              request:{
                device_id:deviceId,
                workload_class,
                idempotency_key,
                payload,
                requested_memory_mb:64,
                requested_cpu_fraction:0.05,
              },
            }),
          now:new Date(),
        });
        registry.setConformance({device_id:deviceId,receipt:conformance});
        return send(res,200,{
          ok:true,
          ...conformance,
          authorization_changed:false,
          production_eligibility_requires_fresh_conformance:true,
        });
      }

      if(req.method==='POST'&&req.url==='/v1/calibrate'){
        const body=await readJson(req);
        const deviceId=clean(body?.device_id);
        if(!deviceId) return send(res,400,{ok:false,error:'device_id_required'});
        const record=registry.get(deviceId);
        const manifest=registry.manifest(deviceId);
        const conformance=registry.conformance(deviceId);
        if(!record||!manifest) return send(res,404,{ok:false,error:'microseed_device_not_registered'});

        const trustDecision=evaluateAmbientTrust(record,{now:new Date()});
        if(!trustDecision.eligible){
          return send(res,403,{
            ok:false,
            error:'microseed_device_not_eligible',
            trust_state:trustDecision.state,
            reason:trustDecision.reason,
          });
        }
        if(!body.telemetry||typeof body.telemetry!=='object'){
          return send(res,400,{ok:false,error:'calibration_telemetry_required'});
        }

        const calibration=await runMicroSeedCalibration({
          manifest,
          conformance,
          trustDecision,
          samplesPerWorkload:body.samples_per_workload,
          maxTotalSamples:body.max_total_samples,
          execute:({workload_class,idempotency_key,payload})=>
            executeAndLearn({
              manifest,
              trustDecision,
              telemetry:body.telemetry,
              request:{
                device_id:deviceId,
                workload_class,
                idempotency_key,
                payload,
                requested_memory_mb:64,
                requested_cpu_fraction:0.05,
              },
            }),
          now:new Date(),
        });
        return send(res,200,{
          ok:true,
          ...calibration,
          performance_ledger_updated:true,
          authorization_changed:false,
          conformance_changed:false,
        });
      }

      if(req.method==='POST'&&req.url==='/v1/execute'){
        if(activeGlobal>=Math.max(1,Number(globalMaxConcurrency||8))){
          return send(res,429,{ok:false,error:'microseed_gateway_global_concurrency_limit'});
        }
        const body=await readJson(req);
        const deviceId=clean(body?.request?.device_id||body?.device_id);
        if(!deviceId) return send(res,400,{ok:false,error:'device_id_required'});

        const record=registry.get(deviceId);
        const manifest=registry.manifest(deviceId);
        if(!record||!manifest) return send(res,404,{ok:false,error:'microseed_device_not_registered'});

        const trustDecision=evaluateAmbientTrust(record,{now:new Date()});
        if(!trustDecision.eligible){
          return send(res,403,{
            ok:false,
            error:'microseed_device_not_eligible',
            trust_state:trustDecision.state,
            reason:trustDecision.reason,
          });
        }

        const deviceActive=Number(activeByDevice.get(deviceId)||0);
        const deviceMax=Math.max(1,Number(manifest.constraints?.max_concurrency||1));
        if(deviceActive>=deviceMax){
          return send(res,429,{ok:false,error:'microseed_device_concurrency_limit'});
        }

        activeGlobal+=1;
        activeByDevice.set(deviceId,deviceActive+1);
        const request=body.request||body;
        try{
          const receipt=await executeAndLearn({
            manifest,
            trustDecision,
            telemetry:body.telemetry||{},
            request,
          });
          return send(res,200,{ok:true,...receipt});
        }finally{
          activeGlobal=Math.max(0,activeGlobal-1);
          const next=Math.max(0,Number(activeByDevice.get(deviceId)||1)-1);
          if(next===0) activeByDevice.delete(deviceId);
          else activeByDevice.set(deviceId,next);
        }
      }

      if(req.method==='GET'&&req.url==='/v1/registry-summary'){
        const snapshot=registry.list({now:new Date()});
        return send(res,200,{
          ok:true,
          schema:'evercraft.saban.microseed-registry-summary.v1',
          device_count:snapshot.device_count,
          eligible_count:snapshot.eligible_count,
          states:snapshot.rows.reduce((acc,row)=>{
            acc[row.state]=(acc[row.state]||0)+1;
            return acc;
          },{}),
          device_ids_exposed:false,
        });
      }

      return send(res,404,{ok:false,error:'not_found'});
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      const status=message.includes('safety_hold')?409:
        message.includes('not_authorized')||message.includes('not_trusted')?403:
        message.includes('payload_too_large')||message.includes('request_too_large')?413:422;
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
    schema:'evercraft.saban.microseed-gateway.v1',
    service:'saban-microseed-gateway',
    instance_id:instanceId,
    url:'http://'+host+':'+actualPort,
    health,
    close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())),
  };
}
