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
import { createSeedPlan, makeProposal, decideProposal, digest, secureCompare, myProposalSummaries } from './reignite-layout-engine.mjs';

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
const cookieName=clientOrigin===origin?'reignite_editor':'__Secure-reignite_editor';
const cookiePath=clientOrigin===origin?'/':'/reignite/layout/';
const cookieSecure=clientOrigin!==origin;
const sessionSeconds=12*3600;
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
function sessionCookie(value,maxAge=sessionSeconds){
 return cookieName+'='+value+'; Path='+cookiePath+'; Max-Age='+maxAge+'; HttpOnly; SameSite=Strict'+(cookieSecure?'; Secure':'');
}
function extractCookie(header){
 if(typeof header!=='string')return null;
 const value=header.split(';').map(part=>part.trim()).find(part=>part.startsWith(cookieName+'='));
 const candidate=value?.slice(cookieName.length+1);
 return candidate&&/^[A-Za-z0-9_-]{43}$/.test(candidate)?candidate:null;
}
function cli(){
 const action=process.argv[2];
 if(action==='init'){
   root();
   if(fs.existsSync(authPath)||fs.existsSync(dbPath))throw Error('already_initialized_no_overwrite');
   const secret=token();
   privateWrite(authPath,{schema:1,owner_hash:hash(secret),invites:[],sessions:[]});
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
 if(action==='invite-link'){
   root();
   const label=String(process.argv[3]||'').trim();
   const hours=Number(process.argv[4]||24);
   if(label.length<3||label.length>80)throw Error('invite_label_length_3_to_80_required');
   if(!Number.isInteger(hours)||hours<1||hours>72)throw Error('invite_link_hours_must_be_1_to_72');
   const data=privateRead(authPath);
   const id='editor-'+randomBytes(6).toString('hex'),grant=token();
   data.invites.push({
     id,label,hash:null,grant_hash:hash(grant),redeemed_at:null,
     grant_expires_at_ms:Date.now()+hours*3600000,revoked:false,
     created_at:new Date().toISOString()
   });
   privateWrite(authPath,data);
   const entryPath=clientOrigin===origin?'/':'/reignite/layout/';
   process.stdout.write('Invite ID: '+id+'\nOne-time link (share privately, '+hours+'h expiry): '+
     clientOrigin+entryPath+'#join='+grant+'\n');
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
 throw Error('usage: node reignite-layout-server.mjs init|invite "<name>"|invite-link "<name>" [hours=24]|revoke "<id>"|serve');
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
 function identify(raw,cookie){
   const authNow=privateRead(authPath),now=Date.now();
   if(typeof raw==='string'&&raw.length>=32&&raw.length<=256){
     const candidate=hash(raw);
     if(secureCompare(candidate,authNow.owner_hash))
       return {role:'owner',label:'Evercraft owner',id:'owner',auth_kind:'key'};
     for(const invite of authNow.invites){
       if(!invite.revoked&&secureCompare(candidate,invite.hash))
         return {role:'editor',label:invite.label,id:invite.id,auth_kind:'key'};
     }
     for(const session of authNow.sessions||[]){
       const invite=authNow.invites.find(i=>i.id===session.invite_id);
       if(!session.revoked&&invite&&!invite.revoked&&session.expires_at_ms>now&&
          secureCompare(candidate,session.hash))
         return {role:'editor',label:invite.label,id:invite.id,auth_kind:'key'};
     }
   }
   if(cookie){
     const candidate=hash(cookie);
     for(const session of authNow.sessions||[]){
       if(!session.cookie_hash||session.revoked||session.expires_at_ms<=now)continue;
       const invite=authNow.invites.find(i=>i.id===session.invite_id);
       if(invite&&!invite.revoked&&secureCompare(candidate,session.cookie_hash)){
         return {role:'editor',label:invite.label,id:invite.id,auth_kind:'cookie',
           session_id:session.id,csrf_token:session.csrf_token,
           session_expires_at_ms:session.expires_at_ms};
       }
     }
   }
   return null;
 }
 function send(res,code,data,extraHeaders={}){
   res.writeHead(code,{'Content-Type':'application/json; charset=utf-8',...extraHeaders});
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
  '/':'index.html','/app.js':'app.js','/app.css':'app.css',
  '/quick-idea.mjs':'quick-idea.mjs','/seed.json':'seed.json'
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
     const type=/\.(mjs|js)$/.test(filename)?'text/javascript':filename.endsWith('.css')?'text/css':
       filename.endsWith('.json')?'application/json':'text/html';
     try{res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});return res.end(fs.readFileSync(file))}
     catch{return send(res,404,{error:'file_not_found'})}
   }
   if(req.method==='GET'&&url==='/health')return send(res,200,{ok:true,kind:'private-owner-layout',live_event_authorized:false});
   // One-use invite grant in URL fragment; raw grant never appears in a server URL.
   // The browser exchanges it through a same-origin JSON POST for a temporary
   // editor-only session. The owner key cannot be minted by this route.
   if(req.method==='POST'&&url==='/api/invite/redeem'){
     if(req.headers.origin!==clientOrigin)
       return send(res,403,{error:'same_origin_post_required'});
     try{
       const submitted=await body(req);
       const grant=submitted?.grant;
       if(typeof grant!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(grant))
         return send(res,422,{error:'grant_invalid'});
       const authNow=privateRead(authPath),candidate=hash(grant),now=Date.now();
       const invite=authNow.invites.find(i=>i.grant_hash&&secureCompare(candidate,i.grant_hash));
       if(!invite||invite.revoked||invite.redeemed_at||invite.grant_expires_at_ms<=now)
         return send(res,410,{error:'invite_not_available_or_already_used'});
       const secret=token(),csrf=token(),expires_at_ms=now+sessionSeconds*1000;
       authNow.sessions??=[];
       authNow.sessions.push({
         id:'session-'+randomBytes(8).toString('hex'),
         invite_id:invite.id,cookie_hash:hash(secret),csrf_token:csrf,expires_at_ms,
         created_at:new Date(now).toISOString()
       });
       invite.redeemed_at=new Date(now).toISOString();
       invite.grant_hash=null;
       privateWrite(authPath,authNow);
       return send(res,200,{
         schema:'evercraft.reignite.invited-editor-session.v2',
         session_mode:'cookie',csrf_token:csrf,scope:'propose_and_read_own',
         expires_at:new Date(expires_at_ms).toISOString(),
         event_approved:false,venue_authorized:false
       },{'Set-Cookie':sessionCookie(secret)});
     }catch(e){return send(res,e.http||422,{error:e.message})}
   }
   const who=identify(req.headers['x-reignite-key'],extractCookie(req.headers.cookie));
   if(!who)return send(res,401,{error:'valid_owner_or_invite_session_required'});
   if(req.method==='GET'&&url==='/api/session')
     return send(res,200,{authenticated:true,role:who.role,actor:who.label,
       auth_mode:who.auth_kind,csrf_token:who.auth_kind==='cookie'?who.csrf_token:null,
       expires_at:who.auth_kind==='cookie'?new Date(who.session_expires_at_ms).toISOString():null,
       event_approved:false,venue_authorized:false});
   if(req.method==='GET'&&url==='/api/plan')
     return send(res,200,{plan:db.plan,role:who.role,actor:who.label,pending_count:who.role==='owner'?db.proposals.filter(p=>p.status==='pending').length:undefined});
   if(req.method==='GET'&&url==='/api/mine')
     return send(res,200,{schema:'evercraft.reignite.contributor-status.v1',
       revision:db.plan.revision,items:myProposalSummaries(db.proposals,who.id,db.plan.revision),
       event_approved:false,venue_authorized:false});
   if(req.method==='GET'&&url==='/api/reviews'){
     if(who.role!=='owner')return send(res,403,{error:'owner_only'});
     return send(res,200,{proposals:db.proposals.filter(p=>p.status==='pending').slice(-100),revision:db.plan.revision});
   }
   if(req.method==='POST'&&req.headers.origin!==clientOrigin)
     return send(res,403,{error:'same_origin_post_required'});
   if(req.method==='POST'&&who.auth_kind==='cookie'&&
      !secureCompare(req.headers['x-reignite-csrf'],who.csrf_token))
     return send(res,403,{error:'csrf_token_required'});
   if(req.method==='POST'&&url==='/api/session/logout'){
     if(who.auth_kind!=='cookie')return send(res,403,{error:'cookie_session_required'});
     const data=privateRead(authPath);
     const session=(data.sessions||[]).find(item=>item.id===who.session_id);
     if(!session||session.revoked)return send(res,401,{error:'session_already_revoked'});
     session.revoked=true;privateWrite(authPath,data);
     return send(res,200,{signed_out:true},{'Set-Cookie':sessionCookie('',0)});
   }
   if(req.method==='POST'&&url==='/api/proposals'){
     if(db.proposals.filter(p=>p.status==='pending').length>=100)return send(res,429,{error:'review_queue_full'});
     const current=quotas.get(who.id)||{at:Date.now(),count:0};
     if(Date.now()-current.at>3600000){current.at=Date.now();current.count=0}
     if(current.count>=12)return send(res,429,{error:'hourly_proposal_limit'});
     try{
       const submitted=await body(req);
       const proposal=makeProposal(db.plan,submitted.candidate,{
         actor_id:who.id,actor_ref:who.label,reason:submitted.reason,base_revision:submitted.base_revision
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
