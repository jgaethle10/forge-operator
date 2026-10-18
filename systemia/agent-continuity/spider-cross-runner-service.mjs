// Real loopback HTTP service on the SECOND GitHub Actions runner. Test-only
// Spider Society adapter: persistent local queue and explicit denial API.
// No production Spider Society, Machine Trust, GitHub token or external API.
import {createServer} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {readSpiderSandbox,rehydrateSpiderSandbox,spiderSandboxAttempt,spiderSandboxRestartProbe} from './spider-sandbox-drill.mjs';
import {validateTransferPacket} from './spider-cross-runner-contract.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function reject(s){throw Error('SPIDER_SECOND_RUNNER_SERVICE_HELD: '+s)}
function summary(root){
 const s=readSpiderSandbox(root),restart=spiderSandboxRestartProbe(root);
 const entries=[...s.queue,...s.callbacks,...s.successors,...s.leases];
 return {status:s.status,generation:s.generation,
  state_sha256:sha(JSON.stringify(s)),pending:entries.filter(x=>x.state==='pending').length,
  queue_held:s.queue.filter(x=>x.state==='held').length,
  callbacks_held:s.callbacks.filter(x=>x.state==='held').length,
  leases_held:s.leases.filter(x=>x.state==='held').length,
  successors_denied:s.successors.filter(x=>x.state==='denied').length,
  ...restart,remote_production_spider_proof:false};
}
function send(res,code,json){
 const bytes=Buffer.from(JSON.stringify(json));
 res.writeHead(code,{'content-type':'application/json','content-length':bytes.length,'cache-control':'no-store'});
 res.end(bytes);
}
async function parseBody(req){
 let parts=[],length=0;
 for await(const p of req){length+=p.length;if(length>65536)reject('request too large');parts.push(p);}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{reject('invalid JSON')}
}
function authorized(auth,token){
 if(typeof auth!=='string'||!auth.startsWith('Bearer '))return false;
 const b=Buffer.from(auth.slice(7));
 const t=Buffer.from(token);
 return b.length===t.length&&timingSafeEqual(b,t);
}
export async function startSpiderCrossRunnerSandboxService({root,token,port=0}){
 if(typeof token!=='string'||token.length<24||!Number.isInteger(port)||port<0||port>65535)reject('invalid dedicated test token or port');
 const srv=createServer(async(req,res)=>{
  try{
   if(!authorized(req.headers.authorization,token)){send(res,401,{ok:false,error:'AUTH_REQUIRED'});return;}
   if(req.url==='/v1/health'&&req.method==='GET'){
    send(res,200,{ok:true,schema:'evercraft.spider.cross-runner-lab-health.v1',
     service:'SEPARATE_RUNNER_LOOPBACK_HTTP_TEST_ONLY',execution_authority:'NONE_READ_ONLY'});return;
   }
   if(req.url==='/v1/import'&&req.method==='POST'){
    const data=await parseBody(req);
    const verification=validateTransferPacket(data);
    const imported=rehydrateSpiderSandbox(root,data.transfer_packet.spider_snapshot);
    send(res,200,{ok:true,imported,verification,snapshot:summary(root),
     true_spider_production_transport:false});return;
   }
   if(req.url==='/v1/attempt'&&req.method==='POST'){
    const data=await parseBody(req);
    if(!data||typeof data!=='object'||Object.keys(data).sort().join(',')!=='id,kind')
      reject('unsupported attempt body');
    if(!['retry','callback','successor','cross_tenant_read'].includes(data.kind)||
       !/^(rogue-retry|rogue-callback|rogue-successor|attacker-cross-tenant)-[a-z0-9-]{1,60}$/.test(data.id))
      reject('attempt not in dedicated synthetic namespace');
    const result=spiderSandboxAttempt(root,data);
    if(result.effect_executed!==false||result.decision==='HELD_AS_SYNTHETIC_PENDING')
      reject('attempt accidentally permitted');
    send(res,200,{ok:true,...result,effect_executed:false});return;
   }
   if(req.url==='/v1/readback'&&req.method==='GET'){
    send(res,200,{ok:true,snapshot:summary(root)});return;
   }
   send(res,404,{ok:false,error:'NOT_FOUND'});
  }catch(e){send(res,409,{ok:false,error:String(e?.message||e).slice(0,240)})}
 });
 await new Promise((resolve,reject)=>{srv.once('error',reject);srv.listen(port,'127.0.0.1',resolve)});
 const address=srv.address();
 if(!address||typeof address==='string')reject('invalid listen socket');
 return {url:'http://127.0.0.1:'+address.port,close:()=>new Promise((resolve,reject)=>srv.close(e=>e?reject(e):resolve()))};
}
