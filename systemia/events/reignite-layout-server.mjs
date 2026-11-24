#!/usr/bin/env node
/**
 * Owner-operated proposal review for REIGNITE layout.
 * One process, loopback only, no third-party hosts or autonomous publication.
 * Authenticated editor invitations can propose only. Only owner can review.
 */
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createSeedPlan, makeProposal, decideProposal, digest, secureCompare } from './reignite-layout-engine.mjs';

const stateDir=path.resolve(process.env.REIGNITE_LAYOUT_STATE ||
 path.join(process.env.XDG_STATE_HOME||path.join(os.homedir(),'.local','state'),'evercraft','reignite-layout'));
const authPath=path.join(stateDir,'auth.json');
const dbPath=path.join(stateDir,'workspace.json');
const lockPath=path.join(stateDir,'runtime.lock');
const host='127.0.0.1',port=Number(process.env.REIGNITE_LAYOUT_PORT||8809);
const origin='http://'+host+':'+port;
function resolveClientOrigin(){
  const candidate=process.env.REIGNITE_LAYOUT_PUBLIC_ORIGIN?.trim();
  if(!candidate)return origin;
  let u;try{u=new URL(candidate)}catch{throw Error('public_origin_invalid')}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||
     u.pathname!=='/'||!u.hostname||candidate!==u.origin)throw Error('public_origin_must_be_exact_https_origin');
  return u.origin;
}
const clientOrigin=resolveClientOrigin();
const clientHost=new URL(clientOrigin).host;
const publicDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../public/reignite/layout');
const MAX_BYTES=128*1024;
const json=(value)=>JSON.stringify(value,null,2)+'\n';
const hash=s=>createHash('sha256').update(s).digest('hex');
function root(){
 fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
 const perms=fs.statSync(stateDir).mode&0o777;
 if(perms&0o077)throw Error('state_dir_must_be_private_mode_0700');
}
function privateRead(file){
 const stat=fs.statSync(file);
 if(stat.mode&0o077)throw Error('private_file_permissions_required: '+path.basename(file));
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
function privateWrite(file,data){
 const tmp=file+'.tmp-'+process.pid;
 fs.writeFileSync(tmp,json(data),{mode:0o600,flag:'wx'});
 fs.renameSync(tmp,file);
}
const token=()=>randomBytes(32).toString('base64url');
function cli(){
 const action=process.argv[2];
 if(action==='init'){
   root();
   if(fs.existsSync(authPath)||fs.existsSync(dbPath))throw Error('already_initialized_no_overwrite');
   const secret=token();
   privateWrite(authPath,{schema:1,owner_hash:hash(secret),invites:[]});
   privateWrite(dbPath,{schema:1,plan:createSeedPlan(),proposals:[],reviews:[]});
   process.stdout.write('Owner key (store privately; shown once): '+secret+'\n');
   return;
 }
 if(action==='invite'){
   root();
   const label=String(process.argv[3]||'').trim();
   if(label.length<3||label.length>80)throw Error('invite_label_length_3_to_80_required');
   const data=privateRead(authPath);
   const id='editor-'+randomBytes(6).toString('hex'),secret=token();
   data.invites.push({id,label,hash:hash(secret),revoked:false,created_at:new Date().toISOString()});
   privateWrite(authPath,data);
   process.stdout.write('Invite ID: '+id+'\nEditor key (share securely; shown once): '+secret+'\n');
   return;
 }
 if(action==='revoke'){
   root();
   const id=String(process.argv[3]||'');
   const data=privateRead(authPath);
   const item=data.invites.find(i=>i.id===id);
   if(!item)throw Error('invite_not_found');
   item.revoked=true;privateWrite(authPath,data);
   process.stdout.write('Revoked '+id+'\n');return;
 }
 throw Error('usage: node reignite-layout-server.mjs init|invite "<name>"|revoke "<id>"|serve');
}
function serve(){
 root();
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('port_invalid');
 if(!fs.existsSync(authPath)||!fs.existsSync(dbPath))throw Error('initialize_first');
 const auth=privateRead(authPath);
 if(auth.schema!==1||!Array.isArray(auth.invites))throw Error('auth_schema_invalid');
 const lock=fs.openSync(lockPath,'wx',0o600);
 fs.writeSync(lock,String(process.pid));
 let db=privateRead(dbPath);
 if(db.schema!==1||!db.plan||!Array.isArray(db.proposals)||!Array.isArray(db.reviews))throw Error('workspace_schema_invalid');
 const quotas=new Map();
 const release=()=>{try{fs.closeSync(lock);fs.unlinkSync(lockPath)}catch{}};
 process.once('SIGTERM',()=>{release();process.exit(0)});
 process.once('SIGINT',()=>{release();process.exit(0)});
 process.once('exit',release);
 function identify(raw){
   if(typeof raw!=='string'||raw.length<32||raw.length>256)return null;
   // Reload private credentials each request, including revocations or newly invited editors.
   const currentAuth=privateRead(authPath);
   const candidate=hash(raw);
   if(secureCompare(candidate,currentAuth.owner_hash))return {role:'owner',label:'Evercraft owner',id:'owner'};
   for(const invite of currentAuth.invites)
     if(!invite.revoked&&secureCompare(candidate,invite.hash))
       return {role:'editor',label:invite.label,id:invite.id};
   return null;
 }
 function send(res,code,data){
   res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});
   res.end(JSON.stringify(data));
 }
 async function body(req){
   if(req.headers['content-type']!=='application/json')throw Object.assign(Error('json_required'),{http:415});
   const parts=[];let bytes=0;
   for await(const chunk of req){
     bytes+=chunk.length;if(bytes>MAX_BYTES)throw Object.assign(Error('request_too_large'),{http:413});
     parts.push(chunk);
   }
   try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}
   catch{throw Object.assign(Error('invalid_json'),{http:400})}
 }
 function persist(next){
   privateWrite(dbPath,next);db=next;
 }
 const routes={
  '/':'index.html','/app.js':'app.js','/app.css':'app.css','/seed.json':'seed.json'
 };
 createServer(async(req,res)=>{
   res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Cache-Control','no-store');
   res.setHeader('Referrer-Policy','no-referrer');
   res.setHeader('X-Frame-Options','DENY');
   res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
   if(req.headers.host!==clientHost||(req.headers.origin&&req.headers.origin!==clientOrigin))
     return send(res,403,{error:'same_origin_required'});
   const url=req.url?.split('?')[0];
   if(req.method==='GET'&&has(routes,url)){
     const filename=routes[url],file=path.join(publicDir,filename);
     const type=filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':
       filename.endsWith('.json')?'application/json':'text/html';
     try{res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});return res.end(fs.readFileSync(file))}
     catch{return send(res,404,{error:'file_not_found'})}
   }
   if(req.method==='GET'&&url==='/health')return send(res,200,{ok:true,kind:'private-owner-layout',live_event_authorized:false});
   const who=identify(req.headers['x-reignite-key']);
   if(!who)return send(res,401,{error:'valid_owner_or_invite_key_required'});
   if(req.method==='GET'&&url==='/api/plan')
     return send(res,200,{plan:db.plan,role:who.role,actor:who.label,pending_count:who.role==='owner'?db.proposals.filter(p=>p.status==='pending').length:undefined});
   if(req.method==='GET'&&url==='/api/reviews'){
     if(who.role!=='owner')return send(res,403,{error:'owner_only'});
     return send(res,200,{proposals:db.proposals.filter(p=>p.status==='pending').slice(-100),revision:db.plan.revision});
   }
   if(req.method==='POST'&&req.headers.origin!==clientOrigin)
     return send(res,403,{error:'same_origin_post_required'});
   if(req.method==='POST'&&url==='/api/proposals'){
     if(db.proposals.filter(p=>p.status==='pending').length>=100)return send(res,429,{error:'review_queue_full'});
     const current=quotas.get(who.id)||{at:Date.now(),count:0};
     if(Date.now()-current.at>3600000){current.at=Date.now();current.count=0}
     if(current.count>=12)return send(res,429,{error:'hourly_proposal_limit'});
     try{
       const submitted=await body(req);
       const proposal=makeProposal(db.plan,submitted.candidate,{
         actor_ref:who.label,reason:submitted.reason,base_revision:submitted.base_revision
       });
       persist({...db,proposals:[...db.proposals,proposal]});
       current.count++;quotas.set(who.id,current);
       return send(res,201,{proposal_id:proposal.id,status:'pending',base_revision:proposal.base_revision,changes:proposal.changes,event_approved:false});
     }catch(e){return send(res,e.http||(/revision_conflict/.test(e.message)?409:422),{error:e.message})}
   }
   if(req.method==='POST'&&url?.startsWith('/api/review/')){
     if(who.role!=='owner')return send(res,403,{error:'owner_only'});
     const id=decodeURIComponent(url.slice('/api/review/'.length));
     if(!/^p-[0-9a-f-]{36}$/.test(id))return send(res,404,{error:'unknown_proposal'});
     const proposal=db.proposals.find(p=>p.id===id);
     if(!proposal)return send(res,404,{error:'unknown_proposal'});
     try{
       const submitted=await body(req);
       const outcome=decideProposal(db.plan,proposal,{
         decision:submitted.decision,reviewer_ref:who.label,review_note:submitted.review_note
       });
       const proposals=db.proposals.map(p=>p.id===id?outcome.proposal:p);
       persist({schema:1,plan:outcome.plan,proposals,reviews:[...db.reviews,outcome.receipt]});
       return send(res,200,{receipt:outcome.receipt,new_revision:outcome.plan.revision});
     }catch(e){return send(res,e.http||(/revision_conflict/.test(e.message)?409:422),{error:e.message})}
   }
   return send(res,404,{error:'unknown_route'});
 }).listen(port,host,()=>process.stdout.write('REIGNITE private layout service on '+origin+'; allowed browser origin '+clientOrigin+'\n'));
}
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
try{if(process.argv[2]==='serve')serve();else cli()}
catch(err){process.stderr.write('HOLD '+err.message+'\n');process.exitCode=2}
