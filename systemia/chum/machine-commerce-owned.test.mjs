import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeMachineOffer,
  matchOwnedMachineOffers,
  prepareOwnedMachineHandoff,
  executeOwnedMachineCommerceRpc
} from './machine-commerce-owned.mjs';

const catalog={offers:[
  {
    public_id:'alpha-v1',
    product_key:'alpha',
    name:'Alpha Audit',
    problem:'audit a broken website',
    intent_terms:['broken website','website audit'],
    commercial_state:'sell_now',
    machine_state:'human_handoff_ready',
    pricing:'$49',
    public_url:'https://legacy.base44.app/',
    confirmation:'Ask before checkout.'
  },
  {
    public_id:'beta-v1',
    name:'Beta Research',
    problem:'research operational risk',
    intent_terms:['operational risk'],
    commercial_state:'discovery_only',
    public_url:'https://example.com/beta'
  }
]};

test('owned projection strips Base44 product URLs',()=>{
  const offer=sanitizeMachineOffer(catalog.offers[0],{origin:'https://forge.example'});
  assert.equal(offer.public_url,null);
  assert.equal(offer.legacy_public_url_present,true);
  assert.equal(offer.owned_review_url,'https://forge.example/buy/alpha-v1');
  assert.doesNotMatch(JSON.stringify(offer),/legacy\.base44\.app/);
});

test('owned matcher uses local catalog and creates no checkout',()=>{
  const matches=matchOwnedMachineOffers(catalog,'my website is broken',{origin:'https://forge.example'});
  assert.equal(matches[0].public_id,'alpha-v1');
  assert.match(matches[0].owned_review_url,/forge\.example/);
});

test('human handoff is preparation only',()=>{
  const handoff=prepareOwnedMachineHandoff(catalog,'alpha-v1',{origin:'https://forge.example'});
  assert.equal(handoff.handoff.checkout_created,false);
  assert.equal(handoff.handoff.payment_created,false);
  assert.equal(handoff.handoff.paid_work_started,false);
  assert.equal(handoff.handoff.provider_execution_started,false);
});

test('owned MCP lists safe routing tools and no transaction tool',async()=>{
  const response=await executeOwnedMachineCommerceRpc({jsonrpc:'2.0',id:1,method:'tools/list'},catalog,{origin:'https://forge.example'});
  const names=response.result.tools.map((tool)=>tool.name);
  assert.deepEqual(names,['match_offer','get_offer','prepare_human_handoff']);
  assert.equal(names.some((name)=>/checkout|pay|purchase|charge/i.test(name)),false);
});
