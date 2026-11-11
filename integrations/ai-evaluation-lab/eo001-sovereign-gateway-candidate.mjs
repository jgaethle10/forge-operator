/**
 * EO-001 research-only transport for the original Evercraft Sovereign AI gateway.
 *
 * Reuses the current bounded model prompt, deterministic signed-evidence guard,
 * and separate model-vs-guard receipt recorder. Replaces ONLY Raven/Ollama I/O.
 * It never starts services, touches Systemia, or calls a payment provider.
 *
 * This is NOT an approved four-scenario model run or production adapter.
 */
import {request as httpRequest} from 'node:http';
import {constants as fsConstants, openSync, readFileSync, fstatSync, closeSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {liveModelDecision} from './eo001-raven-local-candidate.mjs';
import {mkdirSync,writeFileSync,lstatSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

export const MODEL_ID='qwen3-4b-q4-k-m';
export const DEFAULT_TIMEOUT_MS=12000;
export const MAX_OUTPUT_TOKENS=128;
export const UNKNOWN=Object.freeze({action:'finish',payment_status:'unknown',fulfillment_authorized:false,receipt_id:null});
const MAX_RESPONSE_BYTES=65536;
const MAX_INPUT_BYTES=65536;

function blocked(kind){
  const error=new Error(kind);
  error.name=kind;
  return error;
}

export function parseLoopbackPort(value){
  if(typeof value!=='string'||!/^[1-9][0-9]{0,4}$/.test(value))throw blocked('INVALID_PORT');
  const port=Number(value);
  if(port<1024||port>65535)throw blocked('INVALID_PORT');
  return port;
}

/** A user-owned private file containing only the ephemeral gateway bearer token. */
export function readPrivateToken(file){
  if(typeof file!=='string'||!path.isAbsolute(file))throw blocked('TOKEN_FILE_REQUIRED');
  let fd;
  try{
    fd=openSync(file,fsConstants.O_RDONLY|fsConstants.O_NOFOLLOW|fsConstants.O_NONBLOCK);
    const st=fstatSync(fd);
    if(!st.isFile()||st.nlink!==1||st.size<16||st.size>512||
       (st.mode&0o077)!==0||(typeof process.getuid==='function'&&st.uid!==process.getuid())){
      throw blocked('TOKEN_FILE_SECURITY');
    }
    const token=readFileSync(fd,'utf8').trim();
    if(!/^[A-Za-z0-9_~.\-]{16,512}$/.test(token))throw blocked('TOKEN_FILE_SECURITY');
    return token;
  }catch{
    throw blocked('TOKEN_FILE_SECURITY');
  }finally{
    if(fd!==undefined)closeSync(fd);
  }
}

/** No redirects, proxies, hostname resolution, or non-loopback destinations. */
export function localJsonRequest({port,route,method='GET',token,body=null,
  timeoutMs=DEFAULT_TIMEOUT_MS,signal=null}){
  if(!Number.isInteger(port)||port<1024||port>65535)throw blocked('INVALID_PORT');
  if(!['/health','/v1/chat/completions'].includes(route)||
     !((route==='/health'&&method==='GET')||(route!=='/health'&&method==='POST'))){
    throw blocked('UNAPPROVED_ROUTE');
  }
  if(typeof token!=='string'||!token)throw blocked('TOKEN_REQUIRED');
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>14500)throw blocked('INVALID_TIMEOUT');
  if(signal!==null&&!(signal instanceof AbortSignal))throw blocked('INVALID_ABORT_SIGNAL');
  const payload=body===null?null:JSON.stringify(body);
  if(payload!==null&&Buffer.byteLength(payload)>16384)throw blocked('REQUEST_TOO_LARGE');
  if(signal?.aborted)return Promise.reject(blocked('GATEWAY_ABORTED'));
  return new Promise((resolve,reject)=>{
    let settled=false;
    let req=null;
    let timer=null;
    const onAbort=()=>{
      if(settled)return;
      req?.destroy();
      finish(blocked('GATEWAY_ABORTED'));
    };
    const finish=(error,value)=>{
      if(settled)return;
      settled=true;
      if(timer!==null)clearTimeout(timer);
      if(signal)signal.removeEventListener('abort',onAbort);
      if(error)reject(error);else resolve(value);
    };
    req=httpRequest({hostname:'127.0.0.1',port,path:route,method,
      agent:false,headers:{'accept':'application/json',
        'authorization':'Bearer '+token,
        ...(payload===null?{}:{'content-type':'application/json','content-length':Buffer.byteLength(payload)})}},res=>{
      if(res.statusCode!==200){res.resume();finish(blocked('GATEWAY_HTTP_STATUS'));return;}
      const chunks=[];let count=0;
      res.on('data',chunk=>{
        count+=chunk.length;
        if(count>MAX_RESPONSE_BYTES){req.destroy();finish(blocked('GATEWAY_RESPONSE_TOO_LARGE'));return;}
        chunks.push(chunk);
      });
      res.on('end',()=>{
        if(settled)return;
        try{
          const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('bad shape');
          finish(null,parsed);
        }catch{finish(blocked('GATEWAY_INVALID_JSON'));}
      });
      res.on('error',()=>finish(blocked('GATEWAY_TRANSPORT_FAILURE')));
    });
    req.on('error',()=>finish(blocked('GATEWAY_TRANSPORT_FAILURE')));
    if(signal){
      signal.addEventListener('abort',onAbort,{once:true});
      if(signal.aborted){onAbort();return;}
    }
    timer=setTimeout(()=>{req.destroy();finish(blocked('GATEWAY_TIMEOUT'));},timeoutMs);
    req.end(payload??undefined);
  });
}

export function validateGatewayHealth(health){
  if(!health||health.ok!==true||health.bind!=='127.0.0.1'||health.tools_enabled!==false){
    throw blocked('GATEWAY_NOT_ISOLATED');
  }
  return true;
}

/** Injection makes the transport testable without a real local model or socket. */
export function createSovereignInfer({port,tokenFile,request=localJsonRequest,readToken=readPrivateToken,
  timeoutMs=DEFAULT_TIMEOUT_MS,maxTokens=MAX_OUTPUT_TOKENS}={}){
  if(!Number.isInteger(port)||port<1024||port>65535)throw blocked('INVALID_PORT');
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>12500)throw blocked('INVALID_TIMEOUT');
  if(!Number.isInteger(maxTokens)||maxTokens<1||maxTokens>512)throw blocked('INVALID_TOKEN_BUDGET');
  return async ({input,signal=null})=>{
    if(typeof input!=='string'||Buffer.byteLength(input)>8192)throw blocked('PROMPT_INVALID');
    if(signal?.aborted)throw blocked('GATEWAY_ABORTED');
    const token=readToken(tokenFile);
    const startedAt=new Date().toISOString();
    const health=await request({port,route:'/health',method:'GET',token,timeoutMs:Math.min(1500,timeoutMs),signal});
    validateGatewayHealth(health);
    if(signal?.aborted)throw blocked('GATEWAY_ABORTED');
    const reply=await request({port,route:'/v1/chat/completions',method:'POST',token,
      body:{model:MODEL_ID,temperature:0,max_tokens:maxTokens,stream:false,
        messages:[{role:'user',content:input}]},timeoutMs,signal});
    if(reply.model!==undefined&&reply.model!==MODEL_ID)throw blocked('MODEL_ID_MISMATCH');
    if(!Array.isArray(reply.choices)||reply.choices.length!==1||
       typeof reply.choices[0]?.message?.content!=='string')throw blocked('INFERENCE_INVALID_RESPONSE');
    if(reply.choices[0].finish_reason==='length')throw blocked('OUTPUT_TRUNCATED');
    return {text:reply.choices[0].message.content,provider:'evercraft-sovereign-gateway',
      model:MODEL_ID,started_at:startedAt,completed_at:new Date().toISOString(),
      provider_receipt:{finish_reason:reply.choices[0].finish_reason??null,
        provenance:'SELF_REPORTED_LOCAL_GATEWAY'}};
  };
}

export function privateRecorder(dir){
  if(typeof dir!=='string'||!path.isAbsolute(dir))throw blocked('PRIVATE_RECEIPT_DIR_REQUIRED');
  mkdirSync(dir,{recursive:true,mode:0o700});
  const st=lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
     (typeof process.getuid==='function'&&st.uid!==process.getuid()))throw blocked('PRIVATE_RECEIPT_DIR_INSECURE');
  return item=>writeFileSync(path.join(dir,'eo001-sovereign-decision-'+randomUUID()+'.json'),
    JSON.stringify(item,null,2)+'\n',{flag:'wx',mode:0o600});
}

async function readOneContext(stdin){
  const chunks=[];let size=0;
  for await(const chunk of stdin){
    size+=chunk.length;
    if(size>MAX_INPUT_BYTES)throw blocked('CONTEXT_TOO_LARGE');
    chunks.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw blocked('CONTEXT_INVALID_JSON');}
}
function options(argv){
  const result={};
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--probe'){
      if(result.probe)throw blocked('DUPLICATE_ARGUMENT');
      result.probe=true;continue;
    }
    if(!['--port','--token-file','--receipt-dir'].includes(argv[i])||!argv[i+1]||argv[i+1].startsWith('--')||result[argv[i]])throw blocked('INVALID_ARGUMENT');
    result[argv[i]]=argv[++i];
  }
  return result;
}
async function main(){
  if(process.argv.slice(2).includes('--help')){
    process.stdout.write('Usage: node eo001-sovereign-gateway-candidate.mjs --port LOOPBACK_PORT --token-file PRIVATE_FILE [--probe | --receipt-dir PRIVATE_DIR]\n');
    return;
  }
  let action={...UNKNOWN};
  try{
    const args=options(process.argv.slice(2));
    const port=parseLoopbackPort(args['--port']);
    const tokenFile=args['--token-file'];
    if(!tokenFile)throw blocked('TOKEN_FILE_REQUIRED');
    const infer=createSovereignInfer({port,tokenFile});
    if(args.probe){
      const token=readPrivateToken(tokenFile);
      const health=await localJsonRequest({port,route:'/health',token,timeoutMs:1500});
      validateGatewayHealth(health);
      process.stdout.write(JSON.stringify({state:'ISOLATED_GATEWAY_HEALTH_REPORTED',
        model:MODEL_ID,decision_run_authorized:false,model_inference_executed:false})+'\n');
      return;
    }
    if(!args['--receipt-dir'])throw blocked('PRIVATE_RECEIPT_DIR_REQUIRED');
    const record=privateRecorder(args['--receipt-dir']);
    const context=await readOneContext(process.stdin);
    action=await liveModelDecision(context,{infer,record});
  }catch(error){
    process.stderr.write(JSON.stringify({state:'sovereign_decision_blocked',
      reason:/^[A-Z_]+$/.test(error?.name)?error.name:'UNCLASSIFIED_FAILURE'})+'\n');
    process.exitCode=2;
  }
  process.stdout.write(JSON.stringify(action)+'\n');
}
if(process.argv[1]&&import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href){
  main().catch(()=>{process.stderr.write('{"state":"sovereign_candidate_failed_closed"}\n');process.exitCode=2;});
}
