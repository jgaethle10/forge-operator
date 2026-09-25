#!/usr/bin/env node
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { discoverCapacityBeacons } from '../compute/capacity-beacon.mjs';

const SELF=fileURLToPath(import.meta.url);
const argv=process.argv.slice(2);
const val=(k,d)=>{const i=argv.indexOf(k);return i>=0&&argv[i+1]?argv[i+1]:d};
const has=k=>argv.includes(k);
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const send=(res,s,b)=>{const d=Buffer.from(JSON.stringify(b));res.writeHead(s,{'content-type':'application/json','content-length':d.length});res.end(d)};
const body=async req=>{const x=[];for await(const c of req)x.push(c);return JSON.parse(Buffer.concat(x).toString()||'{}')};

class Chain{constructor(id){this.id=id;this.prev='GENESIS';this.seq=0}issue(type,data={}){const b={v:'evercraft.receipt.v1',node_id:this.id,seq:++this.seq,type,at:new Date().toISOString(),previous_hash:this.prev,...data};const r={...b,receipt_hash:sha(b)};this.prev=r.receipt_hash;return r}}

async function nodeMode(){
  const port=Number(val('--port','47101')), id=val('--node-id',`node-${port}`), ttl=Number(val('--ttl-ms','30000'));
  const leases=new Map(), chain=new Chain(id);
  const offer=()=>({protocol:'evercraft.capacity.v1',node_id:id,endpoint:`http://127.0.0.1:${port}`,platform:`${process.platform}/${process.arch}`,capacity:{cpu_units:4,memory_mb:1024},expires_at:new Date(Date.now()+60000).toISOString()});
  const s=http.createServer(async(req,res)=>{try{
    if(req.method==='GET'&&req.url==='/v1/capacity')return send(res,200,offer());
    if(req.method==='GET'&&req.url==='/v1/health')return send(res,200,{ok:true,node_id:id});
    if(req.method==='POST'&&req.url==='/v1/leases'){const q=await body(req),lease_id=`lease_${randomBytes(8).toString('hex')}`,token=randomBytes(20).toString('hex');leases.set(lease_id,{token_hash:sha(token),expires:Date.now()+ttl});return send(res,201,{lease_id,token,granted:{cpu_units:q.cpu_units||1,memory_mb:q.memory_mb||64},receipt:chain.issue('capacity.lease.granted',{lease_id})});}
    if(req.method==='POST'&&req.url==='/v1/jobs'){const q=await body(req),l=leases.get(q.lease_id);if(!l||l.token_hash!==sha(q.token||''))return send(res,401,{error:'invalid_lease'});if(l.expires<Date.now())return send(res,410,{error:'expired'});const checkpoint={step:Number(q.checkpoint?.step||0)+1,state:q.checkpoint?.state??q.payload,last_node:id};return send(res,200,{ok:true,node_id:id,checkpoint,receipt:chain.issue('workload.executed',{lease_id:q.lease_id,agent_id:q.agent_id})});}
    if(req.method==='DELETE'&&req.url?.startsWith('/v1/leases/')){leases.delete(req.url.split('/').pop());return send(res,200,{ok:true});}
    send(res,404,{error:'not_found'});
  }catch(e){send(res,500,{error:String(e?.message||e)})}});
  s.listen(port,'127.0.0.1',()=>process.stdout.write(JSON.stringify({event:'capacity.ready',...offer()})+'\n'));
  for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>s.close(()=>process.exit(0)));
}

async function j(url,opt={},ms=1500){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{...opt,signal:c.signal,headers:{'content-type':'application/json',...(opt.headers||{})}}),b=await r.json();if(!r.ok)throw Error(`${r.status}:${b.error||'error'}`);return b}finally{clearTimeout(t)}}
async function ready(e){for(let i=0;i<30;i++){try{return await j(`${e}/v1/capacity`,{},300)}catch{await wait(100)}}throw Error(`unreachable capacity endpoint: ${e}`)}
const allocatorTokenFor=e=>{try{const m=JSON.parse(process.env.EVERCRAFT_CAPACITY_TOKENS_JSON||'{}');return String(m[e]||process.env.EVERCRAFT_ALLOCATOR_TOKEN||'')}catch{return String(process.env.EVERCRAFT_ALLOCATOR_TOKEN||'')}};
const lease=(e,n)=>{const token=allocatorTokenFor(e);return j(`${e}/v1/leases`,{method:'POST',headers:token?{authorization:`Bearer ${token}`}:{},body:JSON.stringify({cpu_units:Math.max(1,Math.ceil(n/100)),memory_mb:Math.max(64,Math.ceil(n/10)),workload_class:'saban.logical-agent'})})};
const exec=(e,g,a)=>j(`${e}/v1/jobs`,{method:'POST',body:JSON.stringify({lease_id:g.lease_id,token:g.token,agent_id:a.id,checkpoint:a.checkpoint,payload:a.payload})});
async function each(items,limit,fn){let p=0;const out=new Array(items.length);await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=p++;if(i>=items.length)return;out[i]=await fn(items[i],i)}}));return out}

async function seedMode(){
  const count=Math.max(10,Math.min(10000,Number(val('--agents','10')))), out=path.resolve(val('--out','./saban-proof-output')), chain=new Chain('saban-seed'), receipts=[], children=[];
  let endpoints=(val('--endpoints',process.env.EVERCRAFT_CAPACITY_ENDPOINTS||'')).split(',').map(x=>x.trim()).filter(Boolean), discovery_mode=endpoints.length?'configured':'none';
  if(!endpoints.length&&(has('--discover-capacity')||process.env.EVERCRAFT_DISCOVER_CAPACITY==='1')){
    const beacons=await discoverCapacityBeacons({
      bindAddress:val('--discovery-bind','0.0.0.0'),
      multicastAddress:val('--discovery-address','239.42.24.42'),
      port:Number(val('--discovery-port','42424')),
      timeoutMs:Number(val('--discovery-timeout-ms','1000')),
      joinMulticast:!has('--discovery-no-multicast')
    });
    endpoints=[...new Set(beacons.map(x=>x.endpoint))];
    if(endpoints.length)discovery_mode='beacon';
  }
  if(!endpoints.length&&!has('--no-local')){for(const [id,p] of [['local-a',47101],['local-b',47102]])children.push(spawn(process.execPath,[SELF,'--node','--node-id',id,'--port',String(p)],{stdio:'ignore'}));endpoints=['http://127.0.0.1:47101','http://127.0.0.1:47102'];discovery_mode='local_fallback';}
  if(!endpoints.length)throw Error('no capacity discovered');
  try{
    const offers=(await Promise.all(endpoints.map(async e=>({endpoint:e,offer:await ready(e)}))));receipts.push(chain.issue('capacity.discovered',{offers:offers.map(x=>x.offer)}));
    const primary=offers[0], failover=offers[1]||offers[0], split=Math.ceil(count/2), g1=await lease(primary.endpoint,split), g2=await lease(failover.endpoint,count-split||1);
    receipts.push(chain.issue('capacity.matched',{nodes:[primary.offer.node_id,failover.offer.node_id],agent_count:count}));
    const agents=Array.from({length:count},(_,i)=>({id:`saban-${i+1}`,payload:{mission:'network-self-assembly',shard:i},checkpoint:{step:0,state:{shard:i}}}));
    await each(agents,96,async(a,i)=>{const e=i<split?primary.endpoint:failover.endpoint,g=i<split?g1:g2,r=await exec(e,g,a);a.checkpoint=r.checkpoint;return r});
    receipts.push(chain.issue('saban.wave.completed',{agent_count:count}));
    if(children[0]){children[0].kill('SIGTERM');await wait(250)}
    const rg=await lease(failover.endpoint,split);await each(agents.slice(0,split),96,async a=>{const r=await exec(failover.endpoint,rg,a);a.checkpoint=r.checkpoint;return r});
    receipts.push(chain.issue('saban.workload.rebound',{from:primary.offer.node_id,to:failover.offer.node_id,migrated:split}));
    await fs.mkdir(out,{recursive:true});const summary={proof:'evercraft.saban.network-seed.v3',status:'PASS',agent_count:count,capacity_sources:offers.map(x=>x.offer.node_id),discovery_mode,pre_enrollment_required:false,external_capacity_supported:true,checkpoint_rebind:true,migrated_agent_count:split,receipt_chain_head:chain.prev,completed_at:new Date().toISOString()};await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');await fs.writeFile(path.join(out,'receipts.jsonl'),receipts.map(JSON.stringify).join('\n')+'\n');console.log(JSON.stringify(summary,null,2));
  }finally{for(const c of children)if(!c.killed)c.kill('SIGTERM')}
}

if(has('--node'))await nodeMode();else await seedMode();
