import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadFabricCatalogFromRepository,matchFabricCapabilities} from '../systemia/mcp/fabric-directory.mjs';

const id='ai-boardroom-decision-review-v1';

test('Boardroom is sourced from public product discovery without machine-commerce authority',()=>{
 const catalog=loadFabricCatalogFromRepository();
 const boardroom=catalog.find(x=>x.public_id===id);
 assert.ok(boardroom,'Boardroom must appear in public discovery');
 assert.equal(catalog.filter(x=>x.public_id===id).length,1);
 assert.equal(boardroom.state,'source_discovery_only');
 assert.equal(boardroom.commercial_state,'scoped_human_review_offers');
 assert.equal(boardroom.entry_paid_offer,null);
 assert.equal(boardroom.human_offer_url,null);
 assert.equal(boardroom.start_url_state,'free_preview_https_verified_no_payment');
 assert.match(boardroom.description,/no verified automatic multi-LLM debate/i);
});
test('Specific multi-AI disagreement intents prefer Boardroom over unrelated products',()=>{
 const catalog=loadFabricCatalogFromRepository();
 for(const intent of [
  'ChatGPT Claude and Gemini disagree about my business strategy; I need AI advisors to compare assumptions',
  'I want a board of AI advisers to pressure test a startup decision with opposing AI model answers'
 ]){
  const matches=matchFabricCapabilities(intent,catalog,{limit:5});
  assert.equal(matches[0]?.public_id,id,'expected Boardroom first for '+intent);
 }
});
test('Free HTTPS website connection is explicit and no payment is present',()=>{
 const b=loadFabricCatalogFromRepository().find(x=>x.public_id===id);
 const free=b.connections.find(x=>x.type==='website'&&/\/compare\/$/.test(x.url));
 assert.ok(free);
 assert.equal(free.url,'https://jgaethle10.github.io/forge-operator/mesh/ai-boardroom/compare/');
 assert.equal(free.state,'public_https_verified_2026_10_29');
 assert.ok(b.connections.some(x=>x.type==='docs'&&x.state==='source_backed'));
 assert.ok(b.connections.every(x=>x.type!=='payment'&&x.url.startsWith('https://')));
});
test('Custom catalog fixtures cannot silently acquire Boardroom',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fabric-boardroom-test-'));
 try{
  const file=path.join(dir,'catalog.json');
  fs.writeFileSync(file,JSON.stringify({universal_mcp:'https://fabric.systemiacommandcenters.com/mcp',capabilities:[]}));
  assert.equal(loadFabricCatalogFromRepository({catalogPath:file}).length,0);
 }finally{
  fs.rmSync(dir,{force:true,recursive:true});
 }
});
