import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {READ_SCOPE,desktopClient,authRequest,callbackCode,exchangeConsent,refreshBinding,readPrivateJson,writeBinding} from './owned-gmail-binding.mjs';
const client=desktopClient({installed:{client_id:'fixture.apps.googleusercontent.com',client_secret:'fixture-secret',auth_uri:'https://accounts.google.com/o/oauth2/auth',token_uri:'https://oauth2.googleapis.com/token'}});
const expectedMailbox='owner@example.test';
const request=authRequest({client,expectedMailbox,redirect:'http://127.0.0.1:43210/callback'});
function mock({scope=READ_SCOPE,mailbox=expectedMailbox,refresh=false}={}){
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url==='https://oauth2.googleapis.com/token')return {ok:true,json:async()=>({access_token:'fixture-access-token',token_type:'Bearer',expires_in:3600,...(scope===null?{}:{scope}),...(refresh?{}:{refresh_token:'fixture-refresh-token'})})};
  assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/profile');
  assert.equal(options.method,'GET');
  assert.equal(options.headers.authorization,'Bearer fixture-access-token');
  return {ok:true,json:async()=>({emailAddress:mailbox})};
 };
 return {fetchImpl,calls};
}
test('desktop consent uses only readonly scope, PKCE and exact callback state',()=>{
 const u=new URL(request.url);
 assert.equal(u.origin,'https://accounts.google.com');
 assert.equal(u.searchParams.get('scope'),READ_SCOPE);
 assert.equal(u.searchParams.get('code_challenge_method'),'S256');
 assert.equal(u.searchParams.get('access_type'),'offline');
 assert.equal(u.searchParams.has('client_secret'),false);
 assert.equal(callbackCode('/callback?state=wrong&code=x',request.state).accepted,false);
 assert.equal(callbackCode('/callback?state='+request.state+'&state='+request.state+'&code=x',request.state).accepted,false);
 assert.deepEqual(callbackCode('/callback?state='+request.state+'&code=fixture-code',request.state),{accepted:true,code:'fixture-code'});
 assert.deepEqual(callbackCode('/callback?state='+request.state+'&error=access_denied',request.state),{accepted:true,error:true});
 assert.throws(()=>desktopClient({web:{}}),/desktop_client_required/);
});
test('consent checks granted scope and mailbox before persisting a refresh grant',async()=>{
 const m=mock();
 const binding=await exchangeConsent({client,request,expectedMailbox,code:'fixture-code',fetchImpl:m.fetchImpl});
 assert.equal(binding.scope,READ_SCOPE);
 assert.equal(binding.refresh_token,'fixture-refresh-token');
 assert.equal(binding.access_token,undefined);
 assert.equal(m.calls[0].options.body.get('code_verifier'),request.verifier);
 for(const options of [{scope:READ_SCOPE+' https://www.googleapis.com/auth/gmail.send'},{scope:null},{mailbox:'other@example.test'}]){
  await assert.rejects(exchangeConsent({client,request,expectedMailbox,code:'fixture-code',fetchImpl:mock(options).fetchImpl}),/readonly_offline_grant_required|identity_mismatch/);
 }
});
test('refresh preserves scope, independently verifies mailbox and rejects widened grant',async()=>{
 const binding=await exchangeConsent({client,request,expectedMailbox,code:'fixture-code',fetchImpl:mock().fetchImpl});
 const m=mock({refresh:true,scope:null});
 assert.equal(await refreshBinding({client,binding,expectedMailbox,fetchImpl:m.fetchImpl}),'fixture-access-token');
 assert.equal(m.calls[0].options.body.get('grant_type'),'refresh_token');
 assert.equal(m.calls[0].options.body.has('scope'),false);
 await assert.rejects(refreshBinding({client,binding,expectedMailbox,fetchImpl:mock({refresh:true,scope:READ_SCOPE+' https://www.googleapis.com/auth/gmail.send'}).fetchImpl}),/scope_changed/);
 await assert.rejects(refreshBinding({client,binding,expectedMailbox:'wrong@example.test',fetchImpl:async()=>{throw Error('unexpected network')}}),/binding_mismatch/);
});
test('private binding file is exclusive, owner-only and symlink denied',()=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'gmail-binding-')));
 try{
  const f=path.join(root,'binding.json'),link=path.join(root,'link.json');
  writeBinding(f,{fixture:true});assert.deepEqual(readPrivateJson(f),{fixture:true});
  assert.equal(fs.statSync(f).mode&0o077,0);
  assert.throws(()=>writeBinding(f,{}),/EEXIST/);
  fs.symlinkSync(f,link);assert.throws(()=>readPrivateJson(link));
  fs.chmodSync(f,0o644);assert.throws(()=>readPrivateJson(f),/private_file_required/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
