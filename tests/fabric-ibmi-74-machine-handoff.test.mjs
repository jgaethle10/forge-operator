import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ibmi74OfferForIntent,
  matchFabricCapabilities,
  executeFabricDirectoryRpc,
} from '../systemia/mcp/fabric-directory.mjs';
import { DEADLINE_KEY, DEADLINE_AMOUNT_CENTS } from '../systemia/chum/ibmi-74-offer-contract.mjs';

const catalog=[
  {
    public_id:'ibmi-rescue-v1',
    name:'Evercraft IBM i Rescue',
    description:'IBM i AS/400 estate dependencies, RPG jobs, upgrade support and compatibility risks',
    keywords:['IBM i 7.4 standard support','roll back before upgrading','vendor integration'],
    commercial_state:'sell_now',
    state:'direct_checkout_ready',
    pricing:'IBM i Estate X-Ray $250 and IBM i 7.4 Deadline X-Ray $250',
    entry_paid_offer:{name:'IBM i Estate X-Ray',price:'$250',price_usd_normalized:250,billing:'one_time'},
    connections:[{type:'website',label:'details',url:'https://fabric.systemiacommandcenters.com/capabilities/ibmi-rescue-v1'}]
  },
  {
    public_id:'findmypart-paid-hunt-v1',
    name:'FindMyPart',
    description:'Find a discontinued physical valve part.',
    keywords:['discontinued','hydraulic valve'],
    commercial_state:'sell_now',
    state:'payment_ready',
    entry_paid_offer:{name:'Quick Hunt',price:'$19',price_usd_normalized:19,billing:'one_time'},
    connections:[]
  }
];

test('7.4 buyer language returns the exact distinct SKU without a purchase continuation',()=>{
  const intent='Our IBM i 7.4 RPG jobs depend on vendor integrations. Standard support changed. We need upgrade compatibility and rollback risks.';
  const matches=matchFabricCapabilities(intent,catalog,{limit:5});
  assert.equal(matches[0].public_id,'ibmi-rescue-v1');
  assert.equal(matches[0].entry_paid_offer.name,'IBM i 7.4 Deadline X-Ray');
  assert.equal(matches[0].entry_paid_offer.price_usd_normalized,250);
  const offer=matches[0].suggested_bounded_offer;
  assert.equal(offer.offer_key,DEADLINE_KEY);
  assert.equal(offer.amount_cents,DEADLINE_AMOUNT_CENTS);
  assert.equal(offer.currency,'USD');
  assert.equal(offer.route_state,'held_paid_corridor_not_independently_verified');
  assert.equal(offer.checkout_url,null);
  assert.equal(offer.public_page_live_verified,false);
  assert.equal(offer.order_created,false);
  assert.equal(offer.settlement_verified,false);
});

test('generic IBM i estate and unrelated part queries cannot acquire 7.4 offer identity',()=>{
  const generic=matchFabricCapabilities('We need an IBM i legacy estate dependency assessment',catalog);
  const ibmi=generic.find(x=>x.public_id==='ibmi-rescue-v1');
  assert.ok(ibmi);
  assert.equal(ibmi.suggested_bounded_offer,undefined);
  assert.equal(ibmi.entry_paid_offer.name,'IBM i Estate X-Ray');
  assert.equal(ibmi74OfferForIntent('My tractor 7.4 needs a hydraulic part','findmypart-paid-hunt-v1'),null);
  assert.equal(ibmi74OfferForIntent('IBM i 7.4 module installed','ibmi-rescue-v1'),null);
});

test('MCP response carries exact 7.4 selection while remaining read-only',async()=>{
  const result=await executeFabricDirectoryRpc({
    jsonrpc:'2.0',id:42,method:'tools/call',
    params:{name:'match_evercraft_capability',arguments:{
      intent:'IBM i 7.4 standard support transition: compare upgrade compatibility and rollback planning',
      limit:5
    }}
  },catalog);
  assert.equal(result.error,undefined);
  const packet=result.result.structuredContent;
  assert.equal(packet.transactional,false);
  assert.equal(packet.external_action_taken,false);
  const match=packet.matches.find(x=>x.public_id==='ibmi-rescue-v1');
  assert.ok(match);
  assert.equal(match.suggested_bounded_offer.offer_key,DEADLINE_KEY);
  assert.equal(match.suggested_bounded_offer.checkout_url,null);
  assert.equal(match.entry_paid_offer.name,'IBM i 7.4 Deadline X-Ray');
});
