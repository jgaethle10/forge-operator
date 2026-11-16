import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createPublicKey } from 'node:crypto';
import { executeMicroSeedWorkload, normalizeMicroSeedExecutionRequest } from './microseed-executor.mjs';
import { signMicroSeedExecutionReceipt, verifyMicroSeedExecutionReceipt } from './microseed-receipt-signature.mjs';
import { signMicroSeedTelemetry } from './microseed-telemetry-signature.mjs';
import { persistSignedMicroSeedReceipt, readSignedMicroSeedReceipt } from './microseed-signed-receipt-store.mjs';
import { reserveSignedMicroSeedExecution } from './microseed-execution-intent-store.mjs';

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
  receiptSigningPrivateKey=null,
  receiptSigningKeyId='microseed-device-key',
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
  if(manifest.attestation?.receipt_signing_required===true&&!receiptSigningPrivateKey){
    throw new Error('microseed_agent_receipt_signing_key_required');
  }

  const instanceId='microseed-agent-'+randomBytes(8).toString('hex');
  let active=0;
  const attemptsInFlight=new Set();
  const receiptVerificationKey=receiptSigningPrivateKey
    ? createPublicKey(receiptSigningPrivateKey) : null;
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
    signed_receipts_required:manifest.attestation?.receipt_signing_required===true,
    signed_telemetry_required:manifest.attestation?.telemetry_signing_required===true,
    signed_receipts_enabled:Boolean(receiptSigningPrivateKey),
    signed_telemetry_enabled:Boolean(receiptSigningPrivateKey),
    // Capability signal only; the field proof must still reopen the journal.
    signed_journal_commit_before_ack:Boolean(receiptSigningPrivateKey),
  });

  server=http.createServer(async(req,res)=>{
    try{
      if(req.method==='GET'&&req.url==='/health') return send(res,200,health());

      if(clean(req.headers.authorization)!=='Bearer '+authorizationToken){
        return send(res,401,{ok:false,error:'microseed_agent_authorization_required'});
      }

      if(req.method==='GET'&&req.url==='/v1/telemetry'){
        const telemetry=await telemetryProvider({manifest,request:null});
        const envelope={
          schema:'evercraft.microseed.device-telemetry.v1',
          device_id:manifest.device_id,
          telemetry:{
            ...telemetry,
            observed_at:telemetry?.observed_at||new Date().toISOString(),
          },
          arbitrary_code_execution:false,
        };
        const signed=receiptSigningPrivateKey
          ? signMicroSeedTelemetry(envelope,{
              privateKey:receiptSigningPrivateKey,
              key_id:manifest.attestation?.receipt_key_id||receiptSigningKeyId,
            })
          : envelope;
        return send(res,200,{ok:true,...signed});
      }

      if(req.method==='POST'&&req.url==='/v1/execute'){
        const max=Math.max(1,Number(manifest.constraints?.max_concurrency||1));
        if(active>=max) return send(res,429,{ok:false,error:'microseed_agent_concurrency_limit'});
        const body=await readJson(req);
        const normalized=normalizeMicroSeedExecutionRequest(body.request||body);
        if(normalized.device_id!==manifest.device_id){
          throw new Error('microseed_execution_device_mismatch');
        }
        // Even when concurrency > 1, a repeated attempt cannot race the
        // immutable journal commit or execute side effects twice.
        if(attemptsInFlight.has(normalized.idempotency_key)){
          return send(res,409,{ok:false,error:'microseed_signed_attempt_in_progress'});
        }
        attemptsInFlight.add(normalized.idempotency_key);
        active+=1;
        try{
          if(receiptSigningPrivateKey){
            let prior=null;
            try {
              prior=await readSignedMicroSeedReceipt({
                stateDir,device_id:normalized.device_id,
                idempotency_key:normalized.idempotency_key,
              });
            }catch(error){
              if(error.code!=='ENOENT') throw error;
            }
            if(prior){
              const verified=verifyMicroSeedExecutionReceipt(prior,{
                publicKey:receiptVerificationKey,
                expected_device_id:manifest.device_id,
              });
              if(!verified.verified||
                verified.key_id!==(manifest.attestation?.receipt_key_id||receiptSigningKeyId)||
                prior.manifest_hash!==manifest.manifest_hash||
                prior.request_hash!==normalized.request_hash||
                prior.workload_class!==normalized.workload_class){
                throw new Error('microseed_signed_attempt_conflict_or_invalid');
              }
              // Replay unchanged signed bytes, never mutate a signed field.
              return send(res,200,{ok:true,...prior});
            }
            // Legacy unsigned attempts cannot be treated as proven success,
            // nor rerun under the same key without operator review.
            const deviceKey=manifest.device_id
              .replace(/[^a-zA-Z0-9._:-]/g,'_').slice(0,180);
            const legacy=path.join(path.resolve(stateDir),'idempotency',
              deviceKey,normalized.idempotency_key+'.json');
            if(fs.existsSync(legacy)){
              throw new Error('microseed_unsigned_legacy_attempt_requires_review');
            }
          }
          const telemetry=await telemetryProvider({manifest,request:normalized});
          // An agent can be halted after workload execution but before the
          // signed journal commits. Reserve BEFORE work so a future restart
          // holds this attempt as uncertain instead of silently rerunning it.
          // A verified signed journal above always wins on a matching replay.
          if(receiptSigningPrivateKey){
            await reserveSignedMicroSeedExecution({
              stateDir,device_id:normalized.device_id,
              idempotency_key:normalized.idempotency_key,
              request_hash:normalized.request_hash,
              manifest_hash:manifest.manifest_hash,
              workload_class:normalized.workload_class,
            });
          }
          const receipt=await executeMicroSeedWorkload({
            manifest,
            trustDecision:{eligible:true,state:'active',reason:'local_agent_authorized'},
            telemetry,
            request:normalized,
            stateDir,
            executionContext:'device',
            persistUnsignedIdempotency:!receiptSigningPrivateKey,
            now:new Date(),
          });
          const signed=receiptSigningPrivateKey
            ? signMicroSeedExecutionReceipt(receipt,{
                privateKey:receiptSigningPrivateKey,
                key_id:manifest.attestation?.receipt_key_id||receiptSigningKeyId,
              })
            : receipt;
          // Signed journal is now the first durable success record for native
          // signed execution. Failure MUST NOT emit HTTP 200.
          if(receiptSigningPrivateKey){
            await persistSignedMicroSeedReceipt({stateDir,signedReceipt:signed});
          }
          return send(res,200,{ok:true,...signed});
        }finally{
          active=Math.max(0,active-1);
          attemptsInFlight.delete(normalized.idempotency_key);
        }
      }

      return send(res,404,{ok:false,error:'not_found'});
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      const status=message.includes('safety_hold')?409:
        message.includes('microseed_signed_receipt_persistence_failed')?503:
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
