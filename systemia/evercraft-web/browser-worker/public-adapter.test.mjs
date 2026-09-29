import test from 'node:test';
import assert from 'node:assert/strict';
import { startBrowserPublicAdapter } from './public-adapter.mjs';

test('public adapter exposes receipt-bound health and bounded render', async()=>{
  let receipt='';
  const runtime={
    instanceId:'browser-test-instance',
    async health(){
      return {
        ok:true,
        service:'evercraft-owned-browser-worker',
        engine:'evercraft-owned-browser-worker-v1',
        runtime:'Evercraft Compute',
        instance_id:'browser-test-instance',
        deployment_receipt_ref:receipt||null,
      };
    },
    async browse(job){
      if(String(job?.url||'').includes('127.0.0.1')) throw new Error('private_or_reserved_target');
      return {
        ok:true,
        mode:'public_read_only',
        final_url:String(job?.url||''),
        evidence_receipt_sha256:'a'.repeat(64),
      };
    },
    setDeploymentReceipt(value){
      receipt=String(value||'');
    },
    async authHandoffPage(sessionId){
      return '<!doctype html><title>Evercraft Browser Handoff</title><p>'+sessionId+'</p>';
    },
    redeemed:false,
    async authRedeem(sessionId,claim){
      if(this.redeemed) throw new Error('authenticated_browser_claim_already_redeemed');
      if(claim!=='claim-ok') throw new Error('authenticated_browser_claim_invalid');
      this.redeemed=true;
      return {
        ok:true,
        session_id:sessionId,
        access_token:'access-ok',
        claim_redeemed:true,
        expires_at:new Date(Date.now()+60000).toISOString(),
      };
    },
    async authSnapshot(sessionId,access){
      if(access!=='access-ok') throw new Error('authenticated_browser_access_invalid');
      return {
        ok:true,
        session_id:sessionId,
        viewport:{width:1280,height:800},
        screenshot_base64:'aGVsbG8=',
        expires_at:new Date(Date.now()+60000).toISOString(),
      };
    },
    async authAction(sessionId,access,action){
      if(access!=='access-ok') throw new Error('authenticated_browser_access_invalid');
      return {ok:true,session_id:sessionId,type:action.type,secret_text_recorded:false};
    },
    async authClose(sessionId,access){
      if(access!=='access-ok') throw new Error('authenticated_browser_access_invalid');
      return {ok:true,closed:true,session_id:sessionId};
    }
  };

  const adapter=await startBrowserPublicAdapter({runtime,maxRequestsPerMinute:10});
  try{
    let health=await fetch(adapter.url+'/health').then(r=>r.json());
    assert.equal(health.service,'evercraft-web-browser-edge');
    assert.equal(health.deployment_receipt_bound,false);
    assert.equal(health.raw_worker_publicly_exposed,false);

    runtime.setDeploymentReceipt('b'.repeat(64));
    health=await fetch(adapter.url+'/health').then(r=>r.json());
    assert.equal(health.deployment_receipt_bound,true);
    assert.equal(health.deployment_receipt_ref,'b'.repeat(64));

    const capabilities=await fetch(adapter.url+'/v1/browser/capabilities').then(r=>r.json());
    assert.equal(capabilities.authenticated_human_handoff,true);
    assert.equal(capabilities.authenticated_handoff_one_time_claim,true);
    assert.equal(capabilities.authenticated_handoff_http_only_cookie,true);
    assert.equal(capabilities.authenticated_handoff_persists_profile,false);
    assert.equal(capabilities.authenticated_handoff_secret_text_returned,false);

    const handoff=await fetch(adapter.url+'/handoff/session-test');
    assert.equal(handoff.status,200);
    assert.match(await handoff.text(),/Evercraft Browser Handoff/);

    const beforeRedeem=await fetch(adapter.url+'/v1/auth-browser/sessions/session-test/snapshot',{
      headers:{'x-evercraft-control-room':'1'}
    });
    assert.equal(beforeRedeem.status,401);

    const redeem=await fetch(adapter.url+'/v1/auth-browser/sessions/session-test/redeem',{
      method:'POST',
      headers:{
        'x-evercraft-browser-claim':'claim-ok',
        'x-evercraft-control-room':'1'
      }
    });
    assert.equal(redeem.status,200);
    const redeemed=await redeem.json();
    assert.equal(redeemed.ok,true);
    assert.equal(redeemed.claim_redeemed,true);
    assert.equal('access_token' in redeemed,false);

    const setCookie=redeem.headers.get('set-cookie')||'';
    assert.match(setCookie,/__Secure-evercraft_control_room=access-ok/);
    assert.match(setCookie,/HttpOnly/i);
    assert.match(setCookie,/Secure/i);
    assert.match(setCookie,/SameSite=Strict/i);
    assert.match(setCookie,/Path=\/v1\/auth-browser\/sessions\/session-test/i);
    const cookie=setCookie.split(';')[0];

    const reused=await fetch(adapter.url+'/v1/auth-browser/sessions/session-test/redeem',{
      method:'POST',
      headers:{
        'x-evercraft-browser-claim':'claim-ok',
        'x-evercraft-control-room':'1'
      }
    });
    assert.equal(reused.status,409);

    const missingGuard=await fetch(adapter.url+'/v1/auth-browser/sessions/session-test/snapshot',{
      headers:{cookie}
    });
    assert.equal(missingGuard.status,403);

    const snapshot=await fetch(adapter.url+'/v1/auth-browser/sessions/session-test/snapshot',{
      headers:{
        cookie,
        'x-evercraft-control-room':'1'
      }
    }).then(r=>r.json());
    assert.equal(snapshot.ok,true);
    assert.equal(snapshot.session_id,'session-test');

    const typed=await fetch(adapter.url+'/v1/auth-browser/sessions/session-test/action',{
      method:'POST',
      headers:{
        'content-type':'application/json',
        cookie,
        'x-evercraft-control-room':'1'
      },
      body:JSON.stringify({type:'type',text:'never-log-me'})
    }).then(r=>r.json());
    assert.equal(typed.ok,true);
    assert.equal(typed.secret_text_recorded,false);
    assert.equal(JSON.stringify(typed).includes('never-log-me'),false);

    const closeResponse=await fetch(adapter.url+'/v1/auth-browser/sessions/session-test',{
      method:'DELETE',
      headers:{
        cookie,
        'x-evercraft-control-room':'1'
      }
    });
    const closed=await closeResponse.json();
    assert.equal(closed.closed,true);
    assert.match(closeResponse.headers.get('set-cookie')||'',/Max-Age=0/i);

    const rendered=await fetch(adapter.url+'/v1/browser/render',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({url:'https://example.com/'})
    }).then(r=>r.json());
    assert.equal(rendered.ok,true);
    assert.equal(rendered.result.mode,'public_read_only');
    assert.match(rendered.result.evidence_receipt_sha256,/^[a-f0-9]{64}$/);

    const denied=await fetch(adapter.url+'/v1/browser/render',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({url:'http://127.0.0.1/'})
    });
    assert.equal(denied.status,400);
    const deniedBody=await denied.json();
    assert.equal(deniedBody.error,'private_or_reserved_target');
  }finally{
    await adapter.close();
  }
});
