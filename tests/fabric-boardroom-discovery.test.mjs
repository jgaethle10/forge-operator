import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFabricCatalogFromRepository,matchFabricCapabilities} from '../systemia/mcp/fabric-directory.mjs';

test('Boardroom source-directory overlay is discoverable without inheriting checkout or execution authority',()=>{
  const catalog=loadFabricCatalogFromRepository();
  const boardroom=catalog.find((entry)=>entry.public_id==='ai-boardroom-decision-review-v1');
  assert.ok(boardroom,'Boardroom must be sourced from the public product directory');
  assert.equal(boardroom.state,'source_discovery_only');
  assert.equal(boardroom.commercial_state,'scoped_human_review_offers');
  assert.equal(boardroom.entry_paid_offer,null);
  assert.equal(boardroom.human_offer_url,null);
  assert.equal(boardroom.start_url_state,'free_preview_https_verified_no_payment');
  assert.ok(boardroom.connections.some((x)=>x.type==='website'&&x.url==='https://jgaethle10.github.io/forge-operator/mesh/ai-boardroom/compare/'&&x.state==='public_https_verified_2026_10_29'));
  assert.ok(boardroom.pricing.includes('Free private comparison $0'));
  assert.ok(boardroom.connections.some((x)=>x.type==='docs'&&x.state==='source_backed'));
  assert.ok(boardroom.connections.some((x)=>x.type==='mcp'&&x.state==='read_only_discovery_only'));
  const matches=matchFabricCapabilities(
    'ChatGPT Claude and Gemini disagree about my business strategy; I need a board of AI advisors to compare the assumptions and evidence',
    catalog,{limit:5}
  );
  assert.equal(matches[0]?.public_id,'ai-boardroom-decision-review-v1');
});

test('Boardroom does not masquerade as a paid automated council',()=>{
  const boardroom=loadFabricCatalogFromRepository().find(x=>x.public_id==='ai-boardroom-decision-review-v1');
  assert.ok(boardroom);
  assert.equal(boardroom.human_offer_url,null);
  assert.equal(boardroom.entry_paid_offer,null);
  assert.ok(boardroom.description.includes('No verified live multi-model council'));
  assert.ok(boardroom.connections.every(x=>x.url.startsWith('https://')));
});
