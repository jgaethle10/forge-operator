import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createMetaPageReconnect, evaluateMetaPage } from './meta-page-reconnect.mjs';
import { ProviderCredentialVault } from './credential-vault.mjs';
import { startEvercraftHomeServer } from './server.mjs';

const appId='123456789123456';
const redirectUri='https://fabric.systemiacommandcenters.com/home/api/clip/facebook/oauth/callback';
const owner={mode:'passport',subject:'user:owner',session_id:'session-1'};
const approved={id:'1253915241138545',name:'Evercraft',tasks:['CREATE_CONTENT','ANALYZE'],access_token:'page-secret-abcdefghijklmnopqrstuv'};
const ignored={id:'924929507380565',name:'Havenly Cleaning',tasks:['CREATE_CONTENT'],access_token:'excluded-secret-abcdefghijklmnop'};

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-meta-oauth-'));
  const secretFile=path.join(root,'meta-secret');
  fs.writeFileSync(secretFile,'b'.repeat(40),{mode:0o600});
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    assert.equal(init.method,'GET');
    assert.equal(init.redirect,'error');
    if(url.includes('/oauth/access_token')){
      return {ok:true,async json(){return {access_token:'user-opaque-access-token-abcdefghijklmnop'};}};
    }
    if(url.includes('/me/accounts')){
      assert.match(init.headers.Authorization,/^Bearer user-opaque-/);
      return {ok:true,async json(){return {data:[approved,ignored,
        {id:'999999999999999',name:'Unknown Brand',tasks:['CREATE_CONTENT'],access_token:'unknown-secret-abcdefghijklmnopqrst'}],paging:{}};}};
    }
    throw Error('unexpected Meta URL');
  };
  const vault=new ProviderCredentialVault({stateDir:path.join(root,'vault')});
  const flow=createMetaPageReconnect({appId,appSecretFile:secretFile,redirectUri,
    credentialVault:vault,fetchImpl});
  return {root,secretFile,calls,vault,flow,fetchImpl,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}

test('historic Page exclusions are enforced by ID AND name; unknown brands never auto-connect',()=>{
  assert.deepEqual(evaluateMetaPage(approved),{eligible:true,reason:'owner_selection_required'});
  assert.equal(evaluateMetaPage(ignored).reason,'excluded_brand');
  assert.equal(evaluateMetaPage({...approved,id:'990957940766644'}).reason,'excluded_brand');
  assert.equal(evaluateMetaPage({...approved,id:'116675248108887'}).reason,'excluded_brand');
  assert.equal(evaluateMetaPage({...approved,name:'  HAVENLY   CLEANING  '}).reason,'excluded_brand');
  assert.equal(evaluateMetaPage({...approved,id:'999999999999999'}).reason,'not_in_approved_registry');
  assert.equal(evaluateMetaPage({...approved,tasks:[]}).reason,'create_content_task_missing');
});

test('unconfigured Meta app fails closed without contacting Meta or disclosing secrets',()=>{
  const flow=createMetaPageReconnect({});
  assert.equal(flow.status(owner).configured,false);
  assert.throws(()=>flow.start(owner),/meta_app_configuration_required/);
});

test('one-time OAuth state discovers only in memory and seals only selected Pages',async()=>{
  const f=fixture();
  try {
    assert.equal(f.flow.status(owner).pages.length,0);
    const started=f.flow.start(owner);
    const auth=new URL(started.authorization_url);
    assert.equal(auth.hostname,'www.facebook.com');
    assert.equal(auth.searchParams.get('redirect_uri'),redirectUri);
    assert.match(auth.searchParams.get('scope'),/pages_show_list/);
    assert.equal(f.vault.list().length,0);
    const wrong=await f.flow.callback({state:'wrong',code:'abc'});
    assert.equal(wrong.ok,false);
    assert.equal(f.calls.length,0);
    const result=await f.flow.callback({state:auth.searchParams.get('state'),code:'fake-auth-code'});
    assert.equal(result.ok,true);
    assert.equal(f.vault.list().length,0);
    assert.equal((await f.flow.callback({state:auth.searchParams.get('state'),code:'fake-auth-code'})).ok,false);
    const pages=f.flow.status(owner);
    assert.equal(pages.pages.length,3);
    assert.equal(pages.pages.filter(x=>x.eligible).length,1);
    assert.equal(JSON.stringify(pages).includes(approved.access_token),false);
    assert.equal(f.flow.status({...owner,session_id:'other-session'}).pages.length,0);
    assert.throws(()=>f.flow.commit({...owner,session_id:'other-session'},[approved.id]),/review_unavailable/);
    assert.throws(()=>f.flow.commit(owner,[ignored.id]),/not_authorized/);
    assert.throws(()=>f.flow.commit(owner,[approved.id,ignored.id]),/not_authorized/);
    assert.equal(f.vault.list().length,0);
    const save=f.flow.commit(owner,[approved.id]);
    assert.equal(save.sealed_count,1);
    assert.equal(save.publishing_enabled,false);
    assert.equal(JSON.stringify(save).includes(approved.access_token),false);
    assert.equal(f.vault.list({provider:'facebook-pages'}).length,1);
    assert.equal(f.vault.readSecret(save.credential_refs[0]).api_secret,approved.access_token);
    assert.throws(()=>f.flow.commit(owner,[approved.id]),/review_unavailable/);
    assert.equal(f.calls.some(x=>x.init.method!=='GET'),false);
  }finally{f.cleanup();}
});

test('OAuth callbacks fail closed on denied consent, expired state, and weak app-secret permissions',async()=>{
  const f=fixture();
  try{
    const deny=new URL(f.flow.start(owner).authorization_url).searchParams.get('state');
    assert.equal((await f.flow.callback({state:deny,error:'access_denied'})).ok,false);
    assert.equal(f.flow.status(owner).pages.length,0);
    const bad=new URL(f.flow.start(owner).authorization_url).searchParams.get('state');
    fs.chmodSync(f.secretFile,0o644);
    assert.equal(f.flow.status(owner).configured,false);
    assert.equal((await f.flow.callback({state:bad,code:'fake-code'})).ok,false);
    assert.equal(f.vault.list().length,0);
  }finally{f.cleanup();}
});

test('Home HTTP routes require Passport and callback never needs or reveals Home session cookie',async()=>{
  const f=fixture();
  const claim='oauth-owner-fixture-claim';
  const claimSha256=createHash('sha256').update(claim).digest('hex');
  let runtime;
  try{
    runtime=await startEvercraftHomeServer({
      port:0,authMode:'passport',cookieSecure:false,
      identitySecret:'unit-test-oauth-signing-secret-012345678901234',
      identityStateDir:path.join(f.root,'identity'),
      passportStateDir:path.join(f.root,'passport'),
      credentialStateDir:path.join(f.root,'vault'),
      ownerClaimSha256:claimSha256,
      ownerSubjectRef:'user:owner',ownerLogin:'jesse',ownerDisplayName:'Jesse',
      serviceOrigins:{
        CLIP_META_APP_ID:appId,CLIP_META_APP_SECRET_FILE:f.secretFile,
        CLIP_META_REDIRECT_URI:redirectUri,CLIP_META_GRAPH_VERSION:'v27.0'
      },
      clipFacebookFetch:f.fetchImpl
    });
    let res=await fetch(runtime.url+'/api/clip/facebook/oauth/status');
    assert.equal(res.status,401);
    res=await fetch(runtime.url+'/api/clip/facebook/oauth/start',{method:'POST'});
    assert.equal(res.status,401);
    res=await fetch(runtime.url+'/api/owner-claim',{method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({claim_code:claim,password:'new-valid-test-owner-password-012345'})});
    assert.equal(res.status,201);
    res=await fetch(runtime.url+'/api/login',{method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({login:'jesse',password:'new-valid-test-owner-password-012345'})});
    assert.equal(res.status,200);
    const cookie=(res.headers.get('set-cookie')||'').split(';')[0];
    assert.match(cookie,/^evercraft_session=/);
    res=await fetch(runtime.url+'/api/clip/facebook/oauth/start',{method:'POST',headers:{cookie}});
    assert.equal(res.status,200);
    const start=await res.json();
    const state=new URL(start.authorization_url).searchParams.get('state');
    res=await fetch(runtime.url+'/api/clip/facebook/oauth/callback?state='+encodeURIComponent(state)+'&code=example-code');
    assert.equal(res.status,200);
    const callbackHtml=await res.text();
    assert.equal(callbackHtml.includes('page-secret-'),false);
    assert.equal(callbackHtml.includes('example-code'),false);
    res=await fetch(runtime.url+'/api/clip/facebook/oauth/status',{headers:{cookie}});
    assert.equal(res.status,200);
    const status=await res.json();
    assert.equal(status.pages.length,3);
    assert.equal(JSON.stringify(status).includes(approved.access_token),false);
    res=await fetch(runtime.url+'/api/clip/facebook/oauth/commit',{
      method:'POST',headers:{cookie,'content-type':'application/json'},
      body:JSON.stringify({page_ids:[ignored.id]})
    });
    assert.equal(res.status,409);
    res=await fetch(runtime.url+'/api/clip/facebook/oauth/commit',{
      method:'POST',headers:{cookie,'content-type':'application/json'},
      body:JSON.stringify({page_ids:[approved.id]})
    });
    assert.equal(res.status,200);
    const final=await res.json();
    assert.equal(final.sealed_count,1);
    assert.equal(final.publishing_enabled,false);
    assert.equal(f.vault.list({provider:'facebook-pages'}).length,1);
  } finally {if(runtime)await runtime.close();f.cleanup();}
});
