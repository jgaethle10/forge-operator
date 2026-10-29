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
  assert.equal(boardroom.start_url_state,'held_unverified_public_checkout');
  assert.ok(boardroom.connections.some((x)=>x.type==='docs'&&x.state==='source_only_no_live_http_receipt'));
  assert.ok(boardroom.connections.some((x)=>x.type==='mcp'&&x.state==='read_only_discovery_only'));
  const matches=matchFabricCapabilities(
    'ChatGPT Claude and Gemini disagree about my business strategy; I need a board of AI advisors to compare the assumptions and evidence',
    catalog,{limit:5}
  );
  assert.equal(matches[0]?.public_id,'ai-boardroom-decision-review-v1');
});
