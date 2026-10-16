import test from 'node:test';
import assert from 'node:assert/strict';
import {ownedOfferLink} from '../systemia/mcp/owned-offer-links.mjs';
import {loadFabricCatalogFromRepository} from '../systemia/mcp/fabric-directory.mjs';
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
test('Saban cold-client profiles traverse a real local MCP handshake, match and owned offer links; crawler surfaces are served',async()=>{
 const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,faieSurfaceEnabled:false});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'saban-discovery-'));
 try{
  const result=await promisify(execFile)(process.execPath,['systemia/saban/discovery-path-probe.mjs'],{env:{...process.env,EVERCRAFT_PROBE_ORIGIN:runtime.url,EVERCRAFT_PROBE_OUT:dir}});
  const receipt=JSON.parse(result.stdout);assert.equal(receipt.ok,true);assert.equal(receipt.profiles.length,2);assert.equal(receipt.checkout_created,false);assert.equal(receipt.provider_recommendation_observed,false);
  const catalog=await fetch(runtime.url+'/offers.json').then(r=>r.json());assert.equal(catalog.offers.length,15);assert.equal(new Set(catalog.offers.map(o=>o.url)).size,15);
 }finally{await runtime.close();fs.rmSync(dir,{recursive:true,force:true});}
});
