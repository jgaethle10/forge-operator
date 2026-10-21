import test from 'node:test';
import assert from 'node:assert/strict';
import {ownedOfferLink} from '../systemia/mcp/owned-offer-links.mjs';
import {loadFabricCatalogFromRepository, matchFabricCapabilities} from '../systemia/mcp/fabric-directory.mjs';
test('owned native offer links replace obsolete holds only for exact approved price and sale state',()=>{
 const catalog=loadFabricCatalogFromRepository();
 const audit=catalog.find(x=>x.public_id==='audit-center-website-audit-machine-v1');
 assert.equal(audit.human_offer_url,null);
 assert.equal(audit.buyer_checkout_available,false);
 assert.equal(audit.human_buyer_options_state,'held_provider_http_402_requires_new_payment_receipt');
 assert.equal(audit.advertised_offer_page_url,'https://fabric.systemiacommandcenters.com/offers/website-audit');
 assert.equal(audit.advertised_offer_page_state,'catalog_route_only_not_live_checkout_proof');
 assert.equal(audit.start_url_state,'checkout_held_provider_http_402');
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
test('Saban cold-client profiles traverse a real local MCP handshake, match and owned offer links; crawler surfaces are served',async()=>{
 const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,faieSurfaceEnabled:false});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'saban-discovery-'));
 try{
  const result=await promisify(execFile)(process.execPath,['systemia/saban/discovery-path-probe.mjs'],{env:{...process.env,EVERCRAFT_PROBE_ORIGIN:runtime.url,EVERCRAFT_PROBE_OUT:dir}});
  const receipt=JSON.parse(result.stdout);assert.equal(receipt.ok,true);assert.equal(receipt.profiles.length,2);assert.equal(receipt.checkout_created,false);assert.equal(receipt.provider_recommendation_observed,false);
  const catalog=await fetch(runtime.url+'/offers.json').then(r=>r.json());assert.equal(catalog.offers.length,15);assert.equal(new Set(catalog.offers.map(o=>o.url)).size,15);
 }finally{await runtime.close();fs.rmSync(dir,{recursive:true,force:true});}
});


test('Workflow X-Ray is a distinct, fixed-price, consent-gated owned diagnosis door',()=>{
 const catalog=loadFabricCatalogFromRepository();
 const xray=catalog.find(x=>x.public_id==='workflow-foundry-xray-v1');
 assert.ok(xray);
 assert.equal(xray.commercial_state,'sell_now');
 assert.equal(xray.entry_paid_offer?.price_usd_normalized,250);
 assert.equal(xray.human_offer_url,null);
 assert.equal(xray.advertised_offer_page_url,'https://fabric.systemiacommandcenters.com/offers/workflow-xray');
 assert.equal(xray.start_url_state,'checkout_held_provider_http_402');
 assert.equal(xray.buyer_checkout_available,false);
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
