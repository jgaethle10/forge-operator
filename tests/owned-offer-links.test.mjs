import test from 'node:test';
import assert from 'node:assert/strict';
import {ownedOfferLink} from '../systemia/mcp/owned-offer-links.mjs';
import {loadFabricCatalogFromRepository, matchFabricCapabilities} from '../systemia/mcp/fabric-directory.mjs';
test('owned native offer links replace obsolete holds only for exact approved price and sale state',()=>{
 const catalog=loadFabricCatalogFromRepository();
 const audit=catalog.find(x=>x.public_id==='audit-center-website-audit-machine-v1');
 assert.equal(audit.human_offer_url,'https://fabric.systemiacommandcenters.com/offers/website-audit');assert.equal(audit.start_url_state,'owned_offer_page_available');
 assert.equal(ownedOfferLink({...audit,commercial_state:'hold'}),null);assert.equal(ownedOfferLink({...audit,entry_paid_offer:{price_usd_normalized:1}}),null);
 assert.equal(ownedOfferLink({...audit,public_id:'unknown'}),null);
 assert.equal(ownedOfferLink(audit).payment_verified,false);
});
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('Saban cold-client read-only MCP and crawler surfaces work while provider-held buyer links fail closed',async()=>{
 const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,faieSurfaceEnabled:false});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'saban-discovery-'));
 try{
  let stdout;
  try {
    const result=await promisify(execFile)(process.execPath,['systemia/saban/discovery-path-probe.mjs'],{env:{...process.env,EVERCRAFT_PROBE_ORIGIN:runtime.url,EVERCRAFT_PROBE_OUT:dir}});
    stdout=result.stdout;
  } catch (error) {
    assert.equal(error.code,1,'policy-held buyer handoff fails closed, not a script crash');
    stdout=error.stdout;
  }
  const receipt=JSON.parse(stdout);
  assert.equal(receipt.ok,false,'checkout held is not a commercially healthy probe');
  assert.equal(receipt.diagnosis.code,'buyer_handoff_held_by_payment_authority');
  assert.equal(receipt.probe_layers.state,'discovery_ok_buyer_handoff_held');
  assert.equal(receipt.probe_layers.mcp_readonly_ok,true);
  assert.equal(receipt.probe_layers.public_discovery_surfaces_ok,true);
  assert.equal(receipt.probe_layers.catalog_matches_ok,true);
  assert.equal(receipt.probe_layers.buyer_handoff_authorized,false);
  assert.equal(receipt.probe_layers.paid_order_verified,false);
  assert.equal(receipt.profiles.length,2);
  assert.equal(receipt.checkout_created,false);
  assert.equal(receipt.provider_recommendation_observed,false);
  assert.ok(receipt.profiles.every(p=>p.initialized&&p.errors.length===0),'MCP discovery remains healthy');
  assert.ok(receipt.profiles.every(p=>p.intents.length===3&&p.intents.every(i=>i.match_ok&&!i.offer_link_ok&&i.buyer_handoff_state==='held_payment_authority')),'held buyer handoffs never revive catalog-only offer URLs');
  assert.ok(receipt.surfaces.every(s=>s.status===200),'public HTTP discovery remains locally healthy');
  const catalog=await fetch(runtime.url+'/offers.json').then(r=>r.json());assert.equal(catalog.offers.length,15);assert.equal(new Set(catalog.offers.map(o=>o.url)).size,15);
 }finally{await runtime.close();fs.rmSync(dir,{recursive:true,force:true});}
});


test('Workflow X-Ray is a distinct, fixed-price, consent-gated owned diagnosis door',()=>{
 const catalog=loadFabricCatalogFromRepository();
 const xray=catalog.find(x=>x.public_id==='workflow-foundry-xray-v1');
 assert.ok(xray);
 assert.equal(xray.commercial_state,'sell_now');
 assert.equal(xray.entry_paid_offer?.price_usd_normalized,250);
 assert.equal(xray.human_offer_url,'https://fabric.systemiacommandcenters.com/offers/workflow-xray');
 assert.equal(xray.start_url_state,'owned_offer_page_available');
 assert.equal(ownedOfferLink(xray)?.offer_key,'workflow_foundry.xray_250.v1');
 assert.equal(ownedOfferLink({...xray,commercial_state:'hold'}),null);
 assert.equal(ownedOfferLink({...xray,entry_paid_offer:{price_usd_normalized:249}}),null);
 assert.equal(ownedOfferLink(xray)?.payment_verified,false);
});
test('Realistic operator pain routes to paid Workflow X-Ray, not unrelated software rescue',()=>{
 const catalog=loadFabricCatalogFromRepository();
 const examples=[
  'My business loses customer inquiries between quoting, approval and follow-up. We need someone to map our workflow and find what is broken, without committing to an expensive new software platform.',
  'I want a fixed-price one-time operations workflow audit to map bottlenecks, ownership gaps and decide whether to automate a recurring process.'
 ];
 for(const intent of examples){
  const matches=matchFabricCapabilities(intent,catalog,{limit:6});
  assert.equal(matches[0]?.public_id,'workflow-foundry-xray-v1',intent);
 }
});
