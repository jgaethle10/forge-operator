#!/usr/bin/env node
// Owner-operated desktop OAuth enrollment for the EXISTING read-only collector.
// No send scope, browser credential automation, new vault, scheduler or public listener.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {fetchOwnedGmailMetadata,savePrivateGmailSnapshot} from './owned-gmail-import.mjs';

export const READ_SCOPE='https://www.googleapis.com/auth/gmail.readonly';
const AUTH='https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN='https://oauth2.googleapis.com/token';
const PROFILE='https://gmail.googleapis.com/gmail/v1/users/me/profile';
const SCHEMA='evercraft.gmail.readonly-binding.v1';
const fail=c=>{throw Error(c)};
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const textValue=(x,max=4096)=>typeof x==='string'&&x.length>0&&x.length<=max&&!/[\r\n\0]/.test(x);
const email=x=>typeof x==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)&&x.length<=254;
const onlyRead=s=>typeof s==='string'&&s.trim()===READ_SCOPE;
function ownedDir(p){
 if(!path.isAbsolute(p)||fs.realpathSync(p)!==p)fail('gmail_private_directory_required');
 const st=fs.lstatSync(p);
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))fail('gmail_private_directory_required');
}
export function readPrivateJson(p){
 if(typeof p!=='string'||!path.isAbsolute(p))fail('gmail_private_absolute_file_required');
 ownedDir(path.dirname(p));
 const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{
  const st=fs.fstatSync(fd);
  if(!st.isFile()||st.uid!==process.getuid()||(st.mode&0o077)||st.size>32768)fail('gmail_private_file_required');
  return JSON.parse(fs.readFileSync(fd,'utf8'));
 }finally{fs.closeSync(fd)}
}
export function writeBinding(p,binding){
 if(typeof p!=='string'||!path.isAbsolute(p))fail('gmail_private_absolute_file_required');
 ownedDir(path.dirname(p));
 const fd=fs.openSync(p,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(binding,null,2)+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
}
export function desktopClient(config){
 const c=config?.installed;
 if(!c||config.web||!textValue(c.client_id,512)||!c.client_id.endsWith('.apps.googleusercontent.com')||!textValue(c.client_secret,512)||c.auth_uri!=='https://accounts.google.com/o/oauth2/auth'&&c.auth_uri!==AUTH||c.token_uri!==TOKEN)fail('gmail_desktop_client_required');
 return {id:c.client_id,secret:c.client_secret};
}
export function authRequest({client,redirect,expectedMailbox,state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url')}){
 if(!email(expectedMailbox)||!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/callback$/.test(redirect)||!textValue(state)||!textValue(verifier))fail('gmail_consent_request_invalid');
 const url=new URL(AUTH);
 url.search=new URLSearchParams({client_id:client.id,redirect_uri:redirect,response_type:'code',scope:READ_SCOPE,access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',login_hint:expectedMailbox}).toString();
 return {url:url.toString(),state,verifier,redirect};
}
async function tokenRequest(fields,fetchImpl){
 let r;try{r=await fetchImpl(TOKEN,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body:new URLSearchParams(fields),redirect:'error',signal:AbortSignal.timeout(15000)})}catch{fail('gmail_oauth_transport_held')}
 if(!r.ok)fail('gmail_oauth_authorization_held');
 let t;try{t=await r.json()}catch{fail('gmail_oauth_response_invalid')}
 if(!textValue(t?.access_token)||String(t.token_type).toLowerCase()!=='bearer'||!Number.isFinite(t.expires_in)||t.expires_in<=0)fail('gmail_oauth_response_invalid');
 return t;
}
export async function verifyMailbox(accessToken,expectedMailbox,fetchImpl=globalThis.fetch){
 if(!email(expectedMailbox))fail('gmail_expected_mailbox_required');
 let r;try{r=await fetchImpl(PROFILE,{method:'GET',headers:{authorization:'Bearer '+accessToken,accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)})}catch{fail('gmail_profile_transport_held')}
 if(!r.ok)fail('gmail_profile_authorization_held');
 let p;try{p=await r.json()}catch{fail('gmail_profile_invalid')}
 if(!email(p?.emailAddress)||p.emailAddress.toLowerCase()!==expectedMailbox.toLowerCase())fail('gmail_mailbox_identity_mismatch');
 return {mailbox_identity_verified:true};
}
export async function exchangeConsent({client,request,code,expectedMailbox,fetchImpl=globalThis.fetch}){
 if(!textValue(code))fail('gmail_consent_code_invalid');
 const t=await tokenRequest({client_id:client.id,client_secret:client.secret,code,code_verifier:request.verifier,redirect_uri:request.redirect,grant_type:'authorization_code'},fetchImpl);
 if(!onlyRead(t.scope)||!textValue(t.refresh_token))fail('gmail_readonly_offline_grant_required');
 await verifyMailbox(t.access_token,expectedMailbox,fetchImpl);
 return {schema:SCHEMA,client_id:client.id,expected_mailbox:expectedMailbox.toLowerCase(),scope:READ_SCOPE,refresh_token:t.refresh_token,consented_at:new Date().toISOString()};
}
export async function refreshBinding({client,binding,expectedMailbox,fetchImpl=globalThis.fetch}){
 if(binding?.schema!==SCHEMA||binding.client_id!==client.id||!email(expectedMailbox)||binding.expected_mailbox!==expectedMailbox.toLowerCase()||!onlyRead(binding.scope)||!textValue(binding.refresh_token))fail('gmail_binding_mismatch');
 const t=await tokenRequest({client_id:client.id,client_secret:client.secret,refresh_token:binding.refresh_token,grant_type:'refresh_token'},fetchImpl);
 // OAuth refresh responses may omit scope when unchanged; rely on exact original
 // recorded grant and request no wider scope. Any returned changed scope is held.
 if(t.scope!==undefined&&!onlyRead(t.scope))fail('gmail_readonly_scope_changed');
 await verifyMailbox(t.access_token,expectedMailbox,fetchImpl);
 if(t.refresh_token&&t.refresh_token!==binding.refresh_token)fail('gmail_refresh_rotation_requires_owner_rebind');
 return t.access_token;
}
export function callbackCode(url,state){
 const u=new URL(url,'http://127.0.0.1');
 if(u.pathname!=='/callback'||u.searchParams.getAll('state').length!==1||!same(u.searchParams.get('state'),state))return {accepted:false};
 if(u.searchParams.has('error'))return {accepted:true,error:true};
 const codes=u.searchParams.getAll('code');
 if(codes.length!==1||!textValue(codes[0]))return {accepted:false};
 return {accepted:true,code:codes[0]};
}
async function enroll(client,expectedMailbox,bindingFile){
 ownedDir(path.dirname(bindingFile));
 if(fs.existsSync(bindingFile))fail('gmail_binding_already_exists');
 let request,resolveCode,rejectCode;
 const result=new Promise((resolve,reject)=>{resolveCode=resolve;rejectCode=reject});
 const server=http.createServer((req,res)=>{
  let parsed={accepted:false};
  try{if(request&&req.method==='GET')parsed=callbackCode(req.url,request.state)}catch{}
  res.writeHead(parsed.accepted?200:400,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','connection':'close'});
  res.end(parsed.accepted?'Authorization callback received. Return to the Evercraft terminal.':'Invalid callback.');
  if(parsed.error)rejectCode(Error('gmail_owner_consent_denied'));
  else if(parsed.accepted)resolveCode(parsed.code);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const timer=setTimeout(()=>rejectCode(Error('gmail_consent_timeout')),300000);
 try{
  request=authRequest({client,expectedMailbox,redirect:'http://127.0.0.1:'+server.address().port+'/callback'});
  console.log('Open this Google consent URL in your own browser. Do not share the callback or tokens:\n'+request.url);
  const code=await result;
  const binding=await exchangeConsent({client,request,code,expectedMailbox});
  writeBinding(bindingFile,binding);
  console.log(JSON.stringify({state:'gmail_readonly_bound',mailbox_identity_verified:true,offline_grant:true,send_authority:false,secret_values_exported:false}));
 }finally{clearTimeout(timer);server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
async function main(){
 const mode=process.argv[2],args=process.argv.slice(3);
 const flag=n=>{const i=args.indexOf(n);return i<0?null:args[i+1]};
 const expectedMailbox=flag('--mailbox'),clientFile=flag('--client-file'),bindingFile=flag('--binding-file');
 if(!email(expectedMailbox)||!bindingFile||!path.isAbsolute(bindingFile)||!['--enroll','--probe','--import-recent'].includes(mode))fail('gmail_binding_usage');
 const client=desktopClient(readPrivateJson(clientFile));
 if(mode==='--enroll')return enroll(client,expectedMailbox,bindingFile);
 const accessToken=await refreshBinding({client,binding:readPrivateJson(bindingFile),expectedMailbox});
 if(mode==='--probe'){
  console.log(JSON.stringify({state:'gmail_readonly_refresh_verified',mailbox_identity_verified:true,send_authority:false,secret_values_exported:false}));return;
 }
 const outFile=flag('--out-file');
 if(!outFile||!path.isAbsolute(outFile))fail('gmail_snapshot_path_required');
 ownedDir(path.dirname(outFile));
 const snapshot=await fetchOwnedGmailMetadata({accessToken,lookbackHours:30});
 const saved=savePrivateGmailSnapshot({snapshot,outFile});
 console.log(JSON.stringify({state:'gmail_recent_metadata_imported',messages:saved.count,pages:snapshot.listing_pages,mailbox_identity_verified:true,full_history_confirmed:false,send_authority:false,private_output:true}));
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)
 main().catch(e=>{const c=String(e?.message||'');console.error('OWNED_GMAIL_BINDING_HELD '+(/^gmail_[a-z0-9_]+$/.test(c)?c:'private_input_or_operation_failed'));process.exitCode=1});
