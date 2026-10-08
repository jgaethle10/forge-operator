import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createPeopleRuntime } from './runtime.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT=path.join(ROOT,'web');

function clean(value){return String(value??'').trim();}
function tokenEqual(actual,expected){
  if(!actual||!expected)return false;
  const a=Buffer.from(String(actual));
  const b=Buffer.from(String(expected));
  return a.length===b.length&&timingSafeEqual(a,b);
}
function sendJson(res,status,body){
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'content-length':data.length,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
    'x-frame-options':'DENY',
  });
  res.end(data);
}
function sendAsset(res,file,type,cache='public, max-age=300, must-revalidate'){
  const body=fs.readFileSync(file);
  res.writeHead(200,{
    'content-type':type,
    'content-length':body.length,
    'cache-control':cache,
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
    'x-frame-options':'DENY',
    'content-security-policy':"default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  });
  res.end(body);
}
async function readJson(req,maxBytes=1024*1024){
  const chunks=[];let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>maxBytes)throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw?JSON.parse(raw):{};
}
function bearer(req){
  const value=clean(req.headers.authorization);
  return value.startsWith('Bearer ')?value.slice(7).trim():clean(req.headers['x-evercraft-people-token']);
}
function requireSecureTokenFile(file){
  const resolved=path.resolve(file);
  if(!fs.existsSync(resolved)||!fs.statSync(resolved).isFile())throw new Error('people_admin_token_file_missing');
  if((fs.statSync(resolved).mode&0o077)!==0)throw new Error('people_admin_token_file_permissions_too_open');
  const value=fs.readFileSync(resolved,'utf8').trim();
  if(Buffer.byteLength(value)<32)throw new Error('people_admin_token_invalid');
  return value;
}
function errorStatus(message){
  if(/not_found/.test(message))return 404;
  if(/expired|revoked/.test(message))return 410;
  if(/challenge_not_active|mail_delivery_destination_mismatch|trusted_mail_delivery_already_recorded/.test(message))return 409;
  if(/trusted_email_delivery_required/.test(message))return 409;
  if(/required|invalid|exact_|explicit_|forbidden/.test(message))return 400;
  if(/not_consented|verified_owner_identity_required|approved_delete_request_required/.test(message))return 409;
  return 500;
}
function publicPath(url){
  const parsed=new URL(url,'http://people.local');
  return {pathname:parsed.pathname,searchParams:parsed.searchParams};
}

export async function startPeopleLayerRuntime({
  stateDir,
  adminTokenFile,
  mailDeliveryPublicKeysFile,
  mailDispatcher=null,
  publicOrigin='',
  host='127.0.0.1',
  port=0,
}={}){
  if(!stateDir)throw new Error('people_state_dir_required');
  if(!adminTokenFile)throw new Error('people_admin_token_file_required');

  const adminToken=requireSecureTokenFile(adminTokenFile);
  // An operator API credential is never an email-provider attestation credential.
  // The private signing keys must remain with external trusted mail adapters.
  let trustedMailDeliveryPublicKeys={};
  if(mailDeliveryPublicKeysFile){
    const resolved=path.resolve(mailDeliveryPublicKeysFile);
    if(!fs.existsSync(resolved)||!fs.statSync(resolved).isFile())throw new Error('people_mail_public_keys_file_missing');
    if((fs.statSync(resolved).mode&0o077)!==0)throw new Error('people_mail_public_keys_file_permissions_too_open');
    const parsed=JSON.parse(fs.readFileSync(resolved,'utf8'));
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('people_mail_public_keys_invalid');
    trustedMailDeliveryPublicKeys={
      gmail_agent:typeof parsed.gmail_agent==='string'?parsed.gmail_agent:'',
      resend_agent:typeof parsed.resend_agent==='string'?parsed.resend_agent:'',
    };
  }
  const instanceId='people_'+randomUUID();
  const startedAt=new Date().toISOString();
  let deploymentReceiptRef='';
  let server=null;
  const runtime=createPeopleRuntime({stateDir:path.resolve(stateDir),trustedMailDeliveryPublicKeys});
  const health=()=>({
    ...runtime.health(),
    ok:Boolean(server?.listening),
    service:'evercraft-people-layer',
    runtime:'Evercraft Compute',
    public_ui:true,
    instance_id:instanceId,
    operator_auth:'private_token_file',
    public_person_token_flows:true,
    trusted_mail_delivery_configured:Object.values(trustedMailDeliveryPublicKeys).some(Boolean),
    deployment_receipt_bound:Boolean(deploymentReceiptRef),
    deployment_receipt_ref:deploymentReceiptRef||null,
    started_at:startedAt,
    base44_runtime_dependency:false,
  });
  const htmlFile=path.join(WEB_ROOT,'index.html');
  const cssFile=path.join(WEB_ROOT,'style.css');
  const jsFile=path.join(WEB_ROOT,'app.js');
  for(const file of [htmlFile,cssFile,jsFile]){
    if(!fs.existsSync(file))throw new Error('people_web_asset_missing:'+path.basename(file));
  }

  server=http.createServer(async(req,res)=>{
    try{
      const method=String(req.method||'GET').toUpperCase();
      const {pathname,searchParams}=publicPath(req.url||'/');

      if(method==='GET'&&pathname==='/health'){
        return sendJson(res,200,health());
      }

      if(method==='GET'&&pathname==='/people-assets/style.css')return sendAsset(res,cssFile,'text/css; charset=utf-8');
      if(method==='GET'&&pathname==='/people-assets/app.js')return sendAsset(res,jsFile,'text/javascript; charset=utf-8');
      if(method==='GET'&&(pathname==='/people'||pathname==='/people/'||pathname==='/people/consent'||pathname==='/people/verify-email')){
        return sendAsset(res,htmlFile,'text/html; charset=utf-8','no-store');
      }

      const adminOk=()=>tokenEqual(bearer(req),adminToken);
      const needAdmin=()=>{
        if(adminOk())return true;
        sendJson(res,401,{ok:false,error:'unauthorized'});
        return false;
      };

      if(method==='GET'&&pathname==='/api/people/health')return sendJson(res,200,runtime.health());

      if(method==='GET'&&pathname==='/api/people/brains'){
        if(!needAdmin())return;
        return sendJson(res,200,{ok:true,brains:runtime.listBrains()});
      }
      if(method==='POST'&&pathname==='/api/people/brains'){
        if(!needAdmin())return;
        const body=await readJson(req);
        return sendJson(res,201,{ok:true,brain:runtime.createBrain(body)});
      }

      let snapshotMatch=pathname.match(/^\/api\/people\/brains\/([^/]+)$/);
      if(method==='GET'&&snapshotMatch){
        if(!needAdmin())return;
        return sendJson(res,200,{ok:true,snapshot:runtime.brainSnapshot(decodeURIComponent(snapshotMatch[1]))});
      }

      let memoryMatch=pathname.match(/^\/api\/people\/brains\/([^/]+)\/memories$/);
      if(method==='POST'&&memoryMatch){
        if(!needAdmin())return;
        const body=await readJson(req);
        return sendJson(res,201,{ok:true,memory:runtime.createMemory(decodeURIComponent(memoryMatch[1]),body)});
      }

      let relationshipMatch=pathname.match(/^\/api\/people\/brains\/([^/]+)\/relationships$/);
      if(method==='POST'&&relationshipMatch){
        if(!needAdmin())return;
        const body=await readJson(req);
        return sendJson(res,201,{ok:true,relationship:runtime.createRelationship(decodeURIComponent(relationshipMatch[1]),body)});
      }

      let shareMatch=pathname.match(/^\/api\/people\/brains\/([^/]+)\/relationships\/([^/]+)\/(grant|revoke)$/);
      if(method==='POST'&&shareMatch){
        if(!needAdmin())return;
        const body=await readJson(req);
        const brainKey=decodeURIComponent(shareMatch[1]);
        const relationshipKey=decodeURIComponent(shareMatch[2]);
        const result=shareMatch[3]==='grant'
          ? runtime.grantShare(brainKey,relationshipKey,body)
          : runtime.revokeShare(brainKey,relationshipKey,body);
        return sendJson(res,200,{ok:true,share:result});
      }

      let revokeConsentMatch=pathname.match(/^\/api\/people\/brains\/([^/]+)\/revoke-consent$/);
      if(method==='POST'&&revokeConsentMatch){
        if(!needAdmin())return;
        const body=await readJson(req);
        return sendJson(res,200,{ok:true,consent:runtime.revokeConsent(decodeURIComponent(revokeConsentMatch[1]),body)});
      }

      let opportunityMatch=pathname.match(/^\/api\/people\/brains\/([^/]+)\/opportunities$/);
      if(method==='POST'&&opportunityMatch){
        if(!needAdmin())return;
        const body=await readJson(req);
        return sendJson(res,201,{ok:true,opportunity:runtime.createOpportunity(decodeURIComponent(opportunityMatch[1]),body)});
      }

      let opportunityAuthorityMatch=pathname.match(/^\/api\/people\/brains\/([^/]+)\/opportunities\/([^/]+)\/authority$/);
      if(method==='POST'&&opportunityAuthorityMatch){
        if(!needAdmin())return;
        const body=await readJson(req);
        return sendJson(res,200,{ok:true,opportunity:runtime.setOpportunityAuthority(
          decodeURIComponent(opportunityAuthorityMatch[1]),
          decodeURIComponent(opportunityAuthorityMatch[2]),
          body
        )});
      }

      let deliveryMatch=pathname.match(/^\/api\/people\/identity-challenges\/([^/]+)\/delivery$/);
      if(method==='POST'&&deliveryMatch){
        if(!needAdmin())return;
        const body=await readJson(req);
        return sendJson(res,201,{ok:true,delivery:runtime.recordEmailDelivery(decodeURIComponent(deliveryMatch[1]),body)});
      }

      let match=pathname.match(/^\/api\/people\/brains\/([^/]+)\/(invite|email-challenge|export|delete-request|delete)$/);
      if(match){
        if(!needAdmin())return;
        const brainKey=decodeURIComponent(match[1]);
        const action=match[2];
        const body=method==='POST'?await readJson(req):{};
        if(method==='POST'&&action==='invite')return sendJson(res,201,{ok:true,invite:runtime.createInvite(brainKey,body)});
        if(method==='POST'&&action==='email-challenge'){
          let originValid=false;
          try {
            const origin=new URL(publicOrigin);
            originValid=origin.protocol==='https:' && origin.username==='' &&
              origin.password==='' && origin.search==='' && origin.hash==='' &&
              origin.pathname==='/' &&
              !/(^|\.)base44\.app$/i.test(origin.hostname);
          } catch {}
          if(typeof mailDispatcher!=='function'||!originValid)
            return sendJson(res,503,{ok:false,error:'trusted_email_dispatch_unavailable'});
          const challenge=runtime.createEmailChallenge(brainKey,body);
          try {
            const evidence=await mailDispatcher({
              recipient:body.email,
              challenge,
              publicOrigin,
            });
            if(evidence?.challenge_key!==challenge.challenge_key)
              throw new Error('mail_delivery_challenge_mismatch');
            const delivery=runtime.recordEmailDelivery(challenge.challenge_key,evidence);
            if(delivery.trusted_mailbox_delivery!==true)
              throw new Error('trusted_email_delivery_required');
            return sendJson(res,201,{
              ok:true,
              challenge:{
                challenge_key:challenge.challenge_key,
                email_hint:challenge.email_hint,
                expires_at:challenge.expires_at,
                delivery_state:'sent',
              },
              delivery:{
                provider:delivery.provider,
                status:delivery.status,
                delivery_receipt_key:delivery.delivery_receipt_key,
              },
            });
          } catch {
            runtime.abortEmailChallenge(challenge.challenge_key);
            return sendJson(res,502,{ok:false,error:'trusted_email_dispatch_failed'});
          }
        }
        if(method==='POST'&&action==='export')return sendJson(res,200,{ok:true,export:runtime.exportBrain(brainKey,body)});
        if(method==='POST'&&action==='delete-request')return sendJson(res,201,{ok:true,request:runtime.requestDelete(brainKey,body)});
        if(method==='POST'&&action==='delete')return sendJson(res,200,{ok:true,result:runtime.completeDelete(brainKey,body.confirmation_text)});
        return sendJson(res,405,{ok:false,error:'method_not_allowed'});
      }

      if(method==='GET'&&pathname==='/api/people/consent/inspect'){
        return sendJson(res,200,{ok:true,...runtime.inspectInvite(searchParams.get('token')||'')});
      }
      if(method==='POST'&&pathname==='/api/people/consent/accept'){
        const body=await readJson(req);
        return sendJson(res,200,{ok:true,...runtime.acceptInvite(body.token,body)});
      }
      if(method==='GET'&&pathname==='/api/people/verify-email/inspect'){
        return sendJson(res,200,{ok:true,...runtime.inspectEmailChallenge(searchParams.get('token')||'')});
      }
      if(method==='POST'&&pathname==='/api/people/verify-email/verify'){
        const body=await readJson(req);
        return sendJson(res,200,{ok:true,...runtime.verifyEmail(body.token,body)});
      }

      return sendJson(res,404,{ok:false,error:'not_found'});
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      return sendJson(res,errorStatus(message),{ok:false,error:message});
    }
  });

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,resolve);
  });
  const address=server.address();
  const actualPort=typeof address==='object'&&address?address.port:port;
  const service_url=`http://${host}:${actualPort}`;
  return {
    schema:'evercraft.people.resident-runtime.v1',
    service:'evercraft-people-layer',
    runtime:'Evercraft Compute',
    service_url,
    instance_id:instanceId,
    health_url:service_url+'/health',
    ui_path:'/people',
    consent_path:'/people/consent',
    verify_email_path:'/people/verify-email',
    base44_runtime_dependency:false,
    health,
    setDeploymentReceipt(receiptRef){
      const ref=clean(receiptRef);
      if(!ref)throw new Error('deployment_receipt_ref_required');
      deploymentReceiptRef=ref;
      return health();
    },
    async close(){
      await new Promise(resolve=>server.close(()=>resolve()));
    },
  };
}
