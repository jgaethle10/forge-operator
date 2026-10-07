import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  prepareNativeBrowserRuntime,
} from './native-runtime.mjs';

const configuredState=String(process.env.EVERCRAFT_NATIVE_BROWSER_STATE_DIR||'').trim();
const ownsState=!configuredState;
const state=configuredState
  ? path.resolve(configuredState)
  : fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-native-browser-proof-'));
fs.mkdirSync(state,{recursive:true});
let runtime=null;

try{
  const prepared=await prepareNativeBrowserRuntime({
    sourceDir:process.cwd(),
    stateDir:state,
    allowInstall:true,
  });
  assert.equal(prepared.ready,true);
  assert.equal(prepared.mode,'native_user_playwright');
  assert.equal(prepared.sudo_used,false);
  assert.equal(prepared.system_package_manager_used,false);
  assert.equal(typeof prepared.browserRuntimeFactory,'function');
  assert.ok(String(prepared.chromium_version||'').length>0);
  assert.ok(String(prepared.receipt_hash||'').startsWith('sha256:'));

  runtime=await prepared.browserRuntimeFactory({
    maxConcurrency:1,
  });

  const health=await runtime.health();
  assert.equal(health.ok,true);
  assert.equal(health.service,'evercraft-owned-browser-worker');
  assert.equal(health.runtime,'Evercraft Compute');
  assert.equal(health.execution_mode,'native_user_playwright');

  const browse=await runtime.browse({
    url:'https://example.com/',
    actions:[],
    viewport:{width:1024,height:768},
    timeout_ms:15_000,
    max_text_chars:10_000,
    include_screenshot:false,
    include_screenshot_base64:false,
  });
  assert.equal(browse.ok,true);
  assert.match(String(browse.final_url||''),/^https:\/\/example\.com/);
  assert.ok(String(browse.evidence_receipt_sha256||'').match(/^[a-f0-9]{64}$/));

  const session=await runtime.createAuthSession({
    url:'https://example.com/',
    viewport:{width:1024,height:768},
  });
  assert.equal(session.ok,true);
  assert.equal(session.mode,'human_authorized_ephemeral');
  assert.equal(session.persisted_profile,false);
  assert.equal(session.secret_text_returned,false);
  const handoff=new URL(session.handoff_path,'https://evercraft.invalid');
  const claim=new URLSearchParams(handoff.hash.slice(1)).get('claim');
  assert.ok(session.session_id);
  assert.ok(claim&&claim.length>=32);

  const delegation=await runtime.authDelegate(
    session.session_id,
    claim,
    {scopes:['read','same_origin_navigation','draft_form_fill','draft_save']}
  );
  assert.equal(delegation.ok,true);
  assert.equal(delegation.delegated,true);
  assert.equal(delegation.final_submission_authority,false);
  assert.equal(delegation.payment_authority,false);
  assert.equal(delegation.accepts_new_terms,false);

  const snapshot=await runtime.delegatedSnapshot(session.session_id);
  assert.equal(snapshot.ok,true);
  assert.equal(snapshot.mode,'competition_draft_automation');
  assert.equal(snapshot.delegation.final_submission_authority,false);

  const close=await runtime.authClose(session.session_id,claim);
  assert.equal(close.ok,true);
  assert.equal(close.closed,true);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.browser.native-runtime-proof.v1',
    mode:'native_user_playwright',
    chromium_version:prepared.chromium_version,
    browser_worker_health:true,
    live_https_browse:true,
    authenticated_handoff:true,
    delegated_draft_automation:true,
    final_submission_authority:false,
    payment_authority:false,
    accepts_new_terms:false,
    sudo_used:false,
    system_package_manager_used:false,
    preflight_receipt_hash:prepared.receipt_hash,
  },null,2));
}finally{
  if(runtime){
    try{await runtime.close();}catch{}
  }
  if(ownsState) fs.rmSync(state,{recursive:true,force:true});
}
