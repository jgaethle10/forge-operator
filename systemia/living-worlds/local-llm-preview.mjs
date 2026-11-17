// Owned-only, loopback-bound optional House 001 local LLM preview.
// No public listener, no arbitrary upstream URL, no external tool execution.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {proposalMessages,parseProposalFromContext,validateDecisionContext} from '../../public/living-worlds/agent-proposals.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../public/living-worlds');
const MIME=new Map([['index.html','text/html; charset=utf-8'],['app.mjs','text/javascript; charset=utf-8'],
  ['house-core.mjs','text/javascript; charset=utf-8'],['house-world-bridge.mjs','text/javascript; charset=utf-8'],['agent-proposals.mjs','text/javascript; charset=utf-8']]);
const PREFIX='/living-worlds/';
const MAX_BODY=12*1024;
const MAX_CALLS_PER_MINUTE=12;
const RESPONSE_LIMIT=2048;

function numericPort(raw,fallback){
  if(raw===undefined||raw==='')return fallback;
  const p=Number(raw);
  if(!Number.isInteger(p)||p<1||p>65535)throw Error('Invalid local port');
  return p;
}

export async function invokeLocalModel(context,{fetcher=fetch,modelPort=numericPort(process.env.EVERCRAFT_LOCAL_MODEL_PORT,8080)}={}){
  if(!validateDecisionContext(context))throw Error('Invalid model context');
  const response=await fetcher('http://127.0.0.1:'+modelPort+'/v1/chat/completions',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      messages:proposalMessages(context),stream:false,temperature:0.35,
      max_tokens:190,response_format:{type:'json_object'}
    }),
    signal:AbortSignal.timeout(14000)
  });
  if(!response.ok)throw Error('Local inference request failed');
  const len=Number(response.headers.get('content-length')||0);
  if(len>32*1024)throw Error('Local model response too large');
  const text=await response.text();
  if(text.length>32*1024)throw Error('Local model response too large');
  let data;
  try{data=JSON.parse(text);}catch{throw Error('Local model response not JSON');}
  const answer=data?.choices?.[0]?.message?.content;
  if(typeof answer!=='string'||answer.length>RESPONSE_LIMIT)throw Error('Local model did not return a text response');
  return answer;
}
function send(res,status,payload){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify(payload));
}
async function readBoundedJson(req){
  const n=Number(req.headers['content-length']);
  if(Number.isFinite(n)&&n>MAX_BODY)throw Error('Request too large');
  let size=0;
  const chunks=[];
  for await(const chunk of req){
    size+=chunk.length;
    if(size>MAX_BODY)throw Error('Request too large');
    chunks.push(chunk);
  }
  if(!size)throw Error('Empty request');
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createHousePreview({inference=invokeLocalModel}={}){
  let busy=false;
  const calls=[];
  const server=http.createServer(async(req,res)=>{
    res.setHeader('x-content-type-options','nosniff');
    res.setHeader('referrer-policy','no-referrer');
    res.setHeader('content-security-policy',"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const listenerPort=server.address()?.port;
    const allowedHosts=['127.0.0.1:'+listenerPort,'localhost:'+listenerPort];
    const host=req.headers.host;
    if(!allowedHosts.includes(host)){send(res,403,{error:'Loopback-only preview'});return;}
    const origin=req.headers.origin;
    if(origin&&origin!=='http://'+host){send(res,403,{error:'Cross-origin actions disabled'});return;}
    const url=req.url?.split('?')[0];
    if(req.method==='GET'&&url===PREFIX+'api/status'){
      send(res,200,{schema:'evercraft.living-worlds.local-gateway.v1',bridge:'ready',inference:'not_checked',
        admission:'local_preview_only',public_deployed:false});return;
    }
    if(req.method==='POST'&&url===PREFIX+'api/propose'){
      if(!(req.headers['content-type']||'').startsWith('application/json')){
        send(res,415,{error:'JSON required'});return;
      }
      const now=Date.now();
      while(calls.length&&calls[0]<=now-60_000)calls.shift();
      if(busy||calls.length>=MAX_CALLS_PER_MINUTE){
        send(res,429,{error:'Local inference rate limit reached'});return;
      }
      busy=true;calls.push(now); // Reserve before reading body so overlapping requests cannot bypass the gate.
      try{
        let payload;
        try{
          payload=await readBoundedJson(req);
          if(!payload||Object.keys(payload).length!==1||!validateDecisionContext(payload.context))
            throw Error('Invalid context');
        }catch{
          send(res,400,{error:'Invalid decision context'});return;
        }
        try{
          const output=await inference(payload.context);
          const proposal=parseProposalFromContext(payload.context,output);
          send(res,200,{schema:'evercraft.living-worlds.inference-result.v1',source:'local_llm',
            proposal});
        }catch{
          send(res,503,{error:'Local model unavailable or invalid proposal. Rules-only simulation continues.'});
        }
      }finally{busy=false;}
      return;
    }
    if(req.method==='GET'&&(url===PREFIX||url===PREFIX+'index.html'||MIME.has(url?.slice(PREFIX.length)))){
      const name=url===PREFIX?'index.html':url.slice(PREFIX.length);
      if(!MIME.has(name)){send(res,404,{error:'Not found'});return;}
      try{
        const content=await readFile(path.join(ROOT,name));
        res.writeHead(200,{'content-type':MIME.get(name),'cache-control':'no-store'});
        res.end(content);
      }catch{send(res,404,{error:'Not found'});}
      return;
    }
    send(res,404,{error:'Not found'});
  });
  return server;
}
export async function startHousePreview({port=numericPort(process.env.EVERCRAFT_HOUSE_PORT,8777),inference}={}){
  const server=createHousePreview({inference});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  startHousePreview().then(s=>{
    process.stdout.write('Evercraft House 001 local preview: http://127.0.0.1:'+s.address().port+'/living-worlds/\n');
    process.stdout.write('Optional LLM upstream: local llama-server only (127.0.0.1:'+numericPort(process.env.EVERCRAFT_LOCAL_MODEL_PORT,8080)+').\n');
  }).catch(()=>{process.stderr.write('Could not start loopback-only House preview.\n');process.exitCode=1;});
}
