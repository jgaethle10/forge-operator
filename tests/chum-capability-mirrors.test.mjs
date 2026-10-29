import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {withOwnedNativeWorkflowXray} from '../systemia/chum/owned-native-offer-overlay.mjs';

const machine=JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const authorizedOffers=withOwnedNativeWorkflowXray(machine.offers||[]);
const capabilities=JSON.parse(fs.readFileSync('public/chum/capabilities.json','utf8'));
const sellNow=JSON.parse(fs.readFileSync('public/chum/sell-now.json','utf8'));
// Boardroom's free explanatory index is intentionally discoverable, not a native
// machine-commerce offer. Permit only this explicitly known supplemental mirror.
const discoveryOnlySupplementIds=new Set(['ai-boardroom-decision-review-v1']);
const validateDiscoveryOnlySupplement=(row)=>{
  assert.ok(discoveryOnlySupplementIds.has(row.public_id),row.public_id);
  assert.equal(row.commercial_state,'discovery_only',row.public_id);
  assert.equal(row.machine_state,'source_discovery_only',row.public_id);
  assert.equal(row.entry_paid_offer,null,row.public_id);
  assert.equal(row.start_url,null,row.public_id);
};

test('every canonical or explicitly authorized native offer has one capability mirror',()=>{
  const expected=authorizedOffers.filter(x=>x?.public_id);
  const expectedIds=new Set(expected.map(x=>x.public_id));
  const supplements=capabilities.capabilities.filter(x=>!expectedIds.has(x.public_id));
  assert.deepEqual(supplements.map(x=>x.public_id).sort(),[...discoveryOnlySupplementIds].sort());
  for(const row of supplements) validateDiscoveryOnlySupplement(row);
  assert.equal(capabilities.count,expected.length+supplements.length);
  assert.equal(capabilities.capabilities.length,expected.length+supplements.length);
  const got=new Set(capabilities.capabilities.map(x=>x.public_id));
  assert.equal(got.size,capabilities.capabilities.length,'duplicate capability mirror');
  for(const offer of expected) assert.equal(got.has(offer.public_id),true,offer.public_id);
});

test('every capability mirror has HTML, llms, JSON and JSON-LD',()=>{
  for(const capability of capabilities.capabilities){
    const base='public/chum/capabilities/'+capability.public_id;
    for(const file of ['index.html','llms.txt','capability.json','schema.jsonld']){
      assert.equal(fs.existsSync(base+'/'+file),true,base+'/'+file);
    }
  }
});

test('ROASTED preserves payment-ready 99c state',()=>{
  const row=capabilities.capabilities.find(x=>x.public_id==='roasted-text-pressure-test-machine-v1');
  assert.ok(row);
  assert.equal(row.commercial_state,'sell_now');
  assert.equal(row.machine_state,'payment_ready');
  assert.match(String(row.pricing||''),/0\.99/);

  const record=JSON.parse(fs.readFileSync('public/chum/capabilities/roasted-text-pressure-test-machine-v1/capability.json','utf8'));
  assert.equal(record.commercial_state,'sell_now');
  assert.equal(record.machine_state,'payment_ready');
  assert.match(String(record.pricing||''),/0\.99/);
});

test('mirror generation never upgrades commercial or machine state',()=>{
  const live=new Map(authorizedOffers.map(x=>[x.public_id,x]));
  for(const row of capabilities.capabilities){
    const source=live.get(row.public_id);
    if(!source){validateDiscoveryOnlySupplement(row);continue;}
    assert.equal(row.commercial_state,source.commercial_state,row.public_id);
    assert.equal(row.machine_state,source.machine_state,row.public_id);
  }
});

test('SELL NOW directory count equals canonical plus guarded native offer contracts',()=>{
  const expected=authorizedOffers.filter(x=>x.commercial_state==='sell_now');
  assert.equal(sellNow.count,expected.length);
  assert.equal(sellNow.offers.length,expected.length);
  assert.equal(fs.existsSync('public/chum/sell-now.html'),true);
});


test('SELL NOW mirrors expose a verified Start corridor or an explicit hold',()=>{
  for(const row of sellNow.offers){
    const held=row.start_url_state==='held_no_owned_public_origin';
    if(held){
      assert.equal(row.start_url,null,row.public_id);
      assert.equal(row.machine_review_url,null,row.public_id);
    }else{
      assert.match(String(row.start_url||''),/^https:\/\//,row.public_id);
      assert.match(String(row.machine_review_url||row.start_url||''),/^https:\/\//,row.public_id);
      if(row.start_url_state==='machine_commerce_review_fallback'){
        assert.equal(row.start_url,row.machine_review_url,row.public_id);
      }
    }
    assert.equal(String(row.start_url||'').startsWith('/api/chum/go/'),false,row.public_id);
    const source=authorizedOffers.find(x=>x.public_id===row.public_id);
    assert.ok(source,row.public_id);
    const hasPaid=(source.offers||[]).some((tier)=>{
      const numeric=Number(tier?.price_usd);
      if(Number.isFinite(numeric)&&numeric>0) return true;
      const match=String(tier?.price||'').match(/^\$([0-9][0-9,]*(?:\.[0-9]+)?)/);
      return Boolean(match&&Number(match[1].replace(/,/g,''))>0);
    });
    if(hasPaid) assert.ok(row.entry_paid_offer,'entry offer '+row.public_id);

    const record=JSON.parse(fs.readFileSync('public/chum/capabilities/'+row.public_id+'/capability.json','utf8'));
    assert.equal(record.start_url,row.start_url,row.public_id);
    assert.equal(record.start_url_state,row.start_url_state,row.public_id);
    assert.equal(record.machine_review_url,row.machine_review_url,row.public_id);
    const page=fs.readFileSync('public/chum/capabilities/'+row.public_id+'/index.html','utf8');
    if(held) assert.match(page,/Start held:/,row.public_id);
    else assert.match(page,/Start here/,row.public_id);
  }
});

test('conformance state survives capability generation without inventing live proof',()=>{
  const conformance=JSON.parse(fs.readFileSync('conformance/products.json','utf8'));
  const rows=(conformance.products||[]).filter((row)=>row?.machine_commerce_public_id);
  for(const proof of rows){
    const file='public/chum/capabilities/'+proof.machine_commerce_public_id+'/capability.json';
    if(!fs.existsSync(file)) continue;
    const record=JSON.parse(fs.readFileSync(file,'utf8'));
    const evidence=typeof proof.live_canary_evidence==='string'&&proof.live_canary_evidence.startsWith('https://')
      ? proof.live_canary_evidence
      : null;
    if(proof.conformance_state==='live_read_only_mcp_verified'&&evidence){
      assert.match(String(record.invocation_status||''),/^LIVE READ-ONLY MCP VERIFIED:/,proof.machine_commerce_public_id);
      assert.equal(record.live_canary_evidence,proof.live_canary_evidence,proof.machine_commerce_public_id);
      assert.equal(record.live_proof?.conformance_state,proof.conformance_state,proof.machine_commerce_public_id);
      assert.equal(record.live_proof?.machine_commerce_handoff_state,proof.machine_commerce_handoff_state,proof.machine_commerce_public_id);
      assert.equal(record.live_proof?.mcp,proof.mcp,proof.machine_commerce_public_id);
    }
    if(proof.conformance_state==='owned_runtime_reverification_pending'){
      assert.doesNotMatch(String(record.invocation_status||''),/^LIVE READ-ONLY MCP VERIFIED:/,proof.machine_commerce_public_id);
    }
  }
});
