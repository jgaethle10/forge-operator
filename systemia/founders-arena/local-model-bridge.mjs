/**
 * Founders Arena experimental LOCAL model bridge.
 * A genuine Ollama or OpenAI-compatible local model server can be used, but
 * test fixtures are mocks; neither response text nor this bridge proves
 * that an actual neural inference occurred.
 *
 * Nothing is sent to a public/cloud model endpoint. No fallback decisions.
 */
import {createServer} from 'node:http';
import {ACTIONS} from './league.mjs';
import {requireLocalEndpoint} from './local-agent-runner.mjs';

const REQUEST_SCHEMA='evercraft.founders-arena.request.v1';
const MAX_REQUEST_BYTES=16384;
const MAX_PROVIDER_RESPONSE_BYTES=32768;
const MAX_MODEL_NAME_LENGTH=128;
const FORMATS=new Set(['ollama','openai']);

function assertModelName(value) {
  if (typeof value!=='string' || value.length<1 || value.length>MAX_MODEL_NAME_LENGTH ||
      !/^[A-Za-z0-9_.:/@-]+$/.test(value)) throw Error('Invalid local model identifier');
  return value;
}

function exact(value,keys){return value && typeof value==='object'&&!Array.isArray(value) &&
  Object.keys(value).every(k=>keys.includes(k));}

function assertObservation(value){
  if (!value || value.schema!=='evercraft.founders-arena.observation.v1' ||
      !Number.isInteger(value.turn) || value.turn<1 ||
      !value.self || typeof value.self.id!=='string' ||
      !Array.isArray(value.opponents) || !Array.isArray(value.allowed_actions) ||
      !value.allowed_actions.every(a=>ACTIONS.includes(a))) throw Error('Invalid agent observation');
  return value;
}

export function parseModelDecision(content,observation){
  if (typeof content!=='string'||content.length>2048) throw Error('Invalid model decision content');
  let decoded;
  try {decoded=JSON.parse(content)}catch{throw Error('Model must return a JSON decision object')}
  if(!exact(decoded,['action','target_id']) || typeof decoded.action!=='string' ||
     !observation.allowed_actions.includes(decoded.action)) throw Error('Invalid model action');
  if(decoded.action==='aid'){
    if(typeof decoded.target_id!=='string'||!observation.opponents.some(p=>p.id===decoded.target_id))
      throw Error('Invalid aid target');
    return {action:'aid',target_id:decoded.target_id};
  }
  if(decoded.target_id!==undefined && decoded.target_id!==null)
    throw Error('Unexpected model target');
  return {action:decoded.action};
}

export function makeModelPrompt(observation){
  assertObservation(observation);
  return [
    {role:'system', content:'You are one player in an isolated fictional strategy simulation. Make your own strategic choice using only the supplied observation. You have no tools, no network, and no authority outside the simulation. Return ONLY a JSON object: {"action":"<allowed action>"}. For aid return {"action":"aid","target_id":"<opponent id>"}. No prose, no markdown, no extra keys.'},
    {role:'user',content:JSON.stringify(observation)},
  ];
}

async function boundedBody(response,limit){
  const len=response.headers.get('content-length');
  if(len!==null && Number(len)>limit) throw Error('Model response too large');
  let size=0;const chunks=[];
  for await(const chunk of response.body){
    size+=chunk.byteLength;
    if(size>limit){await response.body.cancel().catch(()=>{});throw Error('Model response too large');}
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readRequest(req,limit){
  const parts=[];let size=0;
  for await(const chunk of req){
    size+=chunk.byteLength;
    if(size>limit) throw Error('Request too large');
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString('utf8');
}

export function createLocalModelDecider({provider,endpoint,model,modelByAgent={},timeoutMs=8000,fetchImpl=fetch}={}){
  if(!FORMATS.has(provider))throw Error('Provider must be ollama or openai');
  const url=requireLocalEndpoint(endpoint);
  const defaultModel=assertModelName(model);
  if(!exact(modelByAgent,Object.keys(modelByAgent)) || Object.keys(modelByAgent).length>19 ||
     Object.keys(modelByAgent).some(id=>!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(id)))
    throw Error('Invalid model-by-agent map');
  const namedModels=Object.fromEntries(Object.entries(modelByAgent).map(([id,value])=>[id,assertModelName(value)]));
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw Error('Invalid timeout');
  const metrics={requests:0,completions:0,rejections:0};
  async function decide(observation){
    assertObservation(observation);
    const chosen=namedModels[observation.self.id]??defaultModel;
    const messages=makeModelPrompt(observation);
    const payload=provider==='ollama'
      ? {model:chosen,messages,stream:false,format:'json',options:{temperature:0}}
      : {model:chosen,messages,stream:false,temperature:0,response_format:{type:'json_object'}};
    metrics.requests++;
    try{
      const response=await fetchImpl(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),
        headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!response.ok)throw Error(`Local model provider returned HTTP ${response.status}`);
      const body=await boundedBody(response,MAX_PROVIDER_RESPONSE_BYTES);
      let data;try{data=JSON.parse(body)}catch{throw Error('Local model provider returned malformed JSON')}
      const content=provider==='ollama'?data?.message?.content:data?.choices?.[0]?.message?.content;
      const answer=parseModelDecision(content,observation);
      metrics.completions++;
      return answer;
    }catch(err){metrics.rejections++;throw err;}
  }
  return {decide,metrics,provider,model:defaultModel,endpoint:url};
}

/** Serve a local arena decision endpoint. Runs only on explicit loopback IPv4. */
export async function startLocalModelBridge(opts={}){
  const decider=createLocalModelDecider(opts);
  let busy=false;
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json');
    if(req.method!=='POST'||req.url!=='/decide'){
      res.writeHead(404);res.end(JSON.stringify({error:'Not found'}));return;
    }
    if(busy){res.writeHead(429);res.end(JSON.stringify({error:'Bridge busy'}));return;}
    busy=true;
    try{
      if(req.headers['content-type']?.split(';')[0]!=='application/json')throw Error('JSON required');
      const request=JSON.parse(await readRequest(req,MAX_REQUEST_BYTES));
      if(!exact(request,['schema','observation']) || request.schema!==REQUEST_SCHEMA)
        throw Error('Invalid arena request');
      const answer=await decider.decide(request.observation);
      res.writeHead(200);res.end(JSON.stringify(answer));
    }catch(err){res.writeHead(422);res.end(JSON.stringify({error:err.message}));}
    finally{busy=false;}
  });
  try{await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(opts.listenPort??0,'127.0.0.1',resolve);
  });}catch(e){server.close();throw e;}
  const address=`http://127.0.0.1:${server.address().port}/decide`;
  return {address,metrics:decider.metrics,close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))};
}
