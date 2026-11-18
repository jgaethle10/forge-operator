#!/usr/bin/env node
// Evercraft Network: consenting two-device offline LAN laboratory.
// Uses the existing secure-envelope and transport selection modules.
// Explicit private-IP binding only. No scanning, auto-joining, radio, or upstream dependencies.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { sealEnvelope, openEnvelope } from './secure-envelope.mjs';
import { selectTransport, defaultTransportCatalog } from './transport-router.mjs';

const args = process.argv.slice(2);
const mode = args[0];
const val = (key, fallback = '') => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] || fallback : fallback; };
const has = key => args.includes(key);
const assertId = value => { if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(value || '')) throw Error('invalid_node_id'); return value; };
const nodeId = () => assertId(val('--id'));
const peerId = () => assertId(val('--peer-id'));
const stateDir = () => {
  const dir = val('--state');
  if (!dir || !path.isAbsolute(dir)) throw Error('absolute_state_directory_required');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if ((fs.statSync(dir).mode & 0o077) !== 0) throw Error('state_directory_must_be_private_0700');
  return dir;
};
const keyBytes = () => {
  const file = val('--key-file');
  if (!file || !path.isAbsolute(file)) throw Error('absolute_key_file_required');
  if ((fs.statSync(file).mode & 0o077) !== 0) throw Error('key_file_must_be_private_0600');
  const key = fs.readFileSync(file);
  if (key.length !== 32) throw Error('key_must_be_32_random_bytes');
  return key;
};
const digest = v => crypto.createHash('sha256').update(v).digest('hex');
const mac = (key, value) => crypto.createHmac('sha256', key).update(value).digest('hex');
const eq = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const validIp = ip => {
  if (ip === '127.0.0.1') return true;
  const o = ip.split('.').map(Number);
  return o.length === 4 && o.every((v, i) => /^\d+$/.test(ip.split('.')[i]) && v >= 0 && v <= 255) &&
    (o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168));
};
const assignedIp = ip => ip === '127.0.0.1' || Object.values(os.networkInterfaces()).flat().some(x => x?.family === 'IPv4' && x.address === ip);
const ensureDirs = root => { for (const d of ['outbox','inbox']) { const dir=path.join(root,d); fs.mkdirSync(dir,{recursive:true,mode:0o700}); const st=fs.lstatSync(dir); if(!st.isDirectory() || (st.mode & 0o077)) throw Error('queue_directory_must_be_private_0700'); } };
const regularPrivateFile = file => { const st=fs.lstatSync(file); if(!st.isFile() || (st.mode & 0o077)) throw Error('queue_file_must_be_private_regular_file'); return fs.readFileSync(file,'utf8'); };
const safeFile = (root, folder, id) => path.join(root, folder, `${id}.json`);
function durableWrite(file, value) {
  const temp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const fd = fs.openSync(temp, 'wx', 0o600);
  try { fs.writeSync(fd, JSON.stringify(value) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
  const dir = fs.openSync(path.dirname(file), 'r');
  try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
}
function logReceipt(root, event, extra={}) {
  const file=path.join(root, 'receipts.jsonl');
  const rows = fs.existsSync(file) ? fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean) : [];
  const previous = rows.length ? JSON.parse(rows[rows.length-1]).receipt_hash : 'GENESIS';
  const record={schema:'evercraft.network.field-outage-lab.receipt.v1',at:new Date().toISOString(),event,previous_hash:previous,...extra};
  record.receipt_hash=digest(JSON.stringify(record));
  const fd=fs.openSync(file,'a',0o600);
  try { fs.writeSync(fd,JSON.stringify(record)+'\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return record;
}
async function bodyJson(req) {
  const chunks=[]; let size=0;
  for await (const chunk of req) { size+=chunk.length; if(size>64000) throw Error('request_too_large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const respond=(res,status,obj)=>{const b=Buffer.from(JSON.stringify(obj));res.writeHead(status,{'content-type':'application/json','content-length':b.length,'cache-control':'no-store'});res.end(b)};
async function serve() {
  const me=nodeId(), expectedPeer=peerId(), root=stateDir(), key=keyBytes();ensureDirs(root);
  const bind=val('--bind','127.0.0.1'), port=Number(val('--port','47820'));
  if (!validIp(bind) || !assignedIp(bind)) throw Error('bind_requires_assigned_private_ipv4');
  if (bind!=='127.0.0.1' && !has('--consent-to-lan')) throw Error('explicit_lan_consent_required');
  if (!Number.isInteger(port) || port<1024 || port>65535) throw Error('invalid_port');
  const server=http.createServer(async(req,res)=>{
    try {
      const u=new URL(req.url,'http://local');
      if(req.method==='GET'&&u.pathname==='/v1/hello'){
        const challenge=u.searchParams.get('challenge');
        if(!/^[0-9a-f]{32}$/.test(challenge||''))return respond(res,400,{error:'invalid_challenge'});
        return respond(res,200,{schema:'evercraft.network.peer-proof.v1',node_id:me,proof:mac(key,`hello:${me}:${challenge}`)});
      }
      if(req.method==='POST'&&u.pathname==='/v1/envelope'){
        const envelope=await bodyJson(req);
        if(envelope.source!==expectedPeer || envelope.destination!==me || envelope.irreversible!==false)
          return respond(res,403,{error:'peer_or_destination_not_authorized'});
        const opened=openEnvelope({envelope,key,expected_destination:me});
        if(typeof opened.payload?.message!=='string'||opened.payload.message.length>32000) throw Error('unsupported_message');
        if(!/^[a-z0-9_]{8,64}$/.test(envelope.message_id||''))throw Error('invalid_message_id');
        const file=safeFile(root,'inbox',envelope.message_id);
        const envelope_hash=digest(JSON.stringify(envelope));
        const duplicate=fs.existsSync(file);
        if(duplicate && digest(JSON.stringify(JSON.parse(regularPrivateFile(file))))!==envelope_hash) {
          logReceipt(root,'message.conflicting_duplicate_held',{message_id:envelope.message_id});
          return respond(res,409,{error:'message_id_payload_conflict'});
        }
        if(!duplicate) durableWrite(file,envelope);
        const r=logReceipt(root,duplicate?'message.duplicate_ack':'message.received',{message_id:envelope.message_id,source:expectedPeer,envelope_hash});
        return respond(res,200,{schema:'evercraft.network.delivery-ack.v1',message_id:envelope.message_id,envelope_hash,node_id:me,duplicate,proof:mac(key,`ack:${me}:${envelope.message_id}:${envelope_hash}`),receipt_hash:r.receipt_hash});
      }
      return respond(res,404,{error:'not_found'});
    }catch(err){respond(res,400,{error:err.message==='request_too_large'?'request_too_large':'invalid_or_unauthenticated_envelope'});}
  });
  server.listen(port,bind,()=>{logReceipt(root,'node.listener.ready',{node_id:me,transport:'lan_http',physical_peer_verified:false});console.log(JSON.stringify({state:'LISTENING',node_id:me,bind,port,upstream_required:false,field_validated:false}));});
}
async function send() {
  const me=nodeId(), peer=peerId(), root=stateDir(), key=keyBytes();ensureDirs(root);
  let s='';for await(const c of process.stdin){s+=c.toString('utf8');if(s.length>32000)throw Error('message_too_large');}
  s=s.trimEnd();if(!s)throw Error('stdin_message_required');
  const envelope=sealEnvelope({key,key_id:'offline-paired-lab',source:me,destination:peer,kind:'continuity.message',payload:{message:s},expires_at:new Date(Date.now()+24*3600*1000).toISOString(),irreversible:false});
  durableWrite(safeFile(root,'outbox',envelope.message_id),envelope);
  const r=logReceipt(root,'message.queued',{message_id:envelope.message_id,destination:peer});
  console.log(JSON.stringify({state:'QUEUED',message_id:envelope.message_id,receipt_hash:r.receipt_hash,offline:true}));
}
async function requestJson(url, options={}) {
  const c=new AbortController(), t=setTimeout(()=>c.abort(),2000);
  try {const r=await fetch(url,{...options,redirect:'error',signal:c.signal});const v=await r.json();if(!r.ok)throw Error(`peer_${r.status}`);return v;} finally {clearTimeout(t);}
}
async function flush() {
  const me=nodeId(), peer=peerId(), root=stateDir(), key=keyBytes();ensureDirs(root);
  const address=val('--peer-url');let parsed;
  try{parsed=new URL(address);}catch{throw Error('peer_url_required');}
  if(parsed.protocol!=='http:' || !validIp(parsed.hostname) || !parsed.port || parsed.username || parsed.password || parsed.pathname!=='/' || parsed.search || parsed.hash)
    throw Error('explicit_private_ipv4_http_peer_required');
  const challenge=crypto.randomBytes(16).toString('hex');
  let hello;
  try{hello=await requestJson(`${parsed.origin}/v1/hello?challenge=${challenge}`);}catch{
    const receipt=logReceipt(root,'peer.unreachable',{peer_id:peer});
    console.log(JSON.stringify({state:'NO_ROUTE',queued:fs.readdirSync(path.join(root,'outbox')).length,receipt_hash:receipt.receipt_hash}));return;
  }
  if(hello.node_id!==peer || !eq(hello.proof,mac(key,`hello:${peer}:${challenge}`)))throw Error('peer_identity_authentication_failed');
  const transport=selectTransport({transports:defaultTransportCatalog({lanAvailable:true,fileCourierAvailable:false}),purpose:'data',payload_bytes:1000,requires_offline:true,max_latency_class:'realtime'});
  if(transport.status!=='ROUTE_READY'||transport.selected.id!=='lan_http')throw Error('verified_lan_route_not_available');
  const files=fs.readdirSync(path.join(root,'outbox')).filter(x=>/^[a-z0-9_]{8,64}\.json$/.test(x)).sort();
  let delivered=0,held=0,expired=0;
  for(const name of files){
    const file=path.join(root,'outbox',name), env=JSON.parse(regularPrivateFile(file));
    if(Date.parse(env.expires_at)<=Date.now()){expired++;held++;logReceipt(root,'message.expired_hold',{message_id:env.message_id});continue;}
    try{
      const ack=await requestJson(`${parsed.origin}/v1/envelope`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(env)});
      const envelope_hash=digest(JSON.stringify(env));
      if(ack.message_id!==env.message_id||ack.node_id!==peer||ack.envelope_hash!==envelope_hash||!eq(ack.proof,mac(key,`ack:${peer}:${env.message_id}:${envelope_hash}`)))throw Error('ack_authentication_failed');
      fs.unlinkSync(file);
      const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
      logReceipt(root,'message.delivered',{message_id:env.message_id,peer_id:peer,transport:transport.selected.id});delivered++;
    }catch{held++;logReceipt(root,'message.retry_held',{message_id:env.message_id});}
  }
  console.log(JSON.stringify({state:held?'PARTIAL':'SYNCHRONIZED',peer_authenticated:true,route:transport.selected.id,delivered,held,expired,field_validated:false}));
}
function status(){const root=stateDir();ensureDirs(root);const out=Object.fromEntries(['inbox','outbox'].map(x=>[x,fs.readdirSync(path.join(root,x)).filter(f=>f.endsWith('.json')).length]));console.log(JSON.stringify({schema:'evercraft.network.local-state.v1',...out}));}
function inbox(){const root=stateDir(), key=keyBytes(), me=nodeId();ensureDirs(root);const rows=fs.readdirSync(path.join(root,'inbox')).filter(f=>f.endsWith('.json')).sort().map(name=>{const e=JSON.parse(regularPrivateFile(path.join(root,'inbox',name)));const opened=openEnvelope({envelope:e,key,expected_destination:me});return {message_id:e.message_id,from:e.source,message:opened.payload.message};});console.log(JSON.stringify({messages:rows}));}
function initKey(){const file=val('--key-file');if(!file||!path.isAbsolute(file))throw Error('absolute_key_file_required');const fd=fs.openSync(file,'wx',0o600);try{fs.writeSync(fd,crypto.randomBytes(32));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}console.log(JSON.stringify({state:'KEY_GENERATED',path:file,bytes:32,share_out_of_band_only:true}));}
function simulate(){const offers=[
{id:'sim-pc',permission:true,reachable:true,watts:18,bandwidth_kbps:2000,reliability:0.9,compute:8},
{id:'sim-router',permission:true,reachable:true,watts:6,bandwidth_kbps:800,reliability:0.98,compute:1},
{id:'sim-stranger',permission:false,reachable:true,watts:2,bandwidth_kbps:50000,reliability:1,compute:100},
{id:'sim-offline',permission:true,reachable:false,watts:3,bandwidth_kbps:1000,reliability:1,compute:4}
];const admissible=offers.filter(x=>x.permission&&x.reachable).map(x=>({...x,score:Math.round(100*x.reliability + Math.min(30,x.bandwidth_kbps/100) + x.compute*4 - x.watts/2)})).sort((a,b)=>b.score-a.score);
console.log(JSON.stringify({schema:'evercraft.network.saban-negotiation-simulation.v1',simulation_only:true,offers,admissible,selected:admissible[0]?.id??null,unconsented_rejected:true}));}
try {switch(mode){case 'init-key':initKey();break;case 'serve':await serve();break;case 'send':await send();break;case 'flush':await flush();break;case 'status':status();break;case 'inbox':inbox();break;case 'simulate':simulate();break;default:throw Error('usage: init-key|serve|send|flush|status|inbox|simulate');}}catch(e){console.error(JSON.stringify({state:'BLOCKED',error:e.message}));process.exitCode=1;}
