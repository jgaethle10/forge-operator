import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFindMyPartIntake, verifyFindMyPartPreflight, verifyFindMyPartCheckoutBinding } from '../systemia/mcp/findmypart-intake.mjs';
import { renderOfferPage } from '../systemia/mcp/fabric-public-site.mjs';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const part={
  part_description:'Discontinued electronic controller on an old tractor; the labeled switch no longer operates the lift.',
  equipment_context:'Ford tractor model 3600',
  part_number:'83982714',
  sources_tried:'Local dealer and official parts catalog both reported obsolete.',
  scope_confirmed:'true',
  user_confirmed:'true',
  customer_ref:'buyer@example.com',
};
const catalog=[{
  public_id:'findmypart-paid-hunt-v1',
  name:'FindMyPart Paid Part Hunt',
  description:'Human-confirmed sourcing research for one hard-to-find or discontinued equipment part.',
  commercial_state:'sell_now',state:'payment_ready',
  pricing:'Quick $19 one-time',
  entry_paid_offer:{name:'Quick Hunt',price:'$19',price_usd_normalized:19,billing:'one_time'},
  connections:[],
}];
const options={
  host:'127.0.0.1',port:0,catalog,faieSurfaceEnabled:false,
  purchaseIntentUrl:'https://fabric.systemiacommandcenters.com/api/payments/intent',
  paymentOpsUrl:'https://fabric.systemiacommandcenters.com/api/payments/ops',
};

test('part intake rejects short and unconfirmed requests, without inventory claims',()=>{
  const short=buildFindMyPartIntake({...part,part_description:'bad'},{slug:'findmypart',customerEmail:part.customer_ref});
  assert.equal(short.ok,false);
  assert.equal(short.error,'part_description_required');
  const missing=buildFindMyPartIntake({...part,scope_confirmed:false},{slug:'findmypart',customerEmail:part.customer_ref});
  assert.equal(missing.error,'part_scope_confirmation_required');
  const good=buildFindMyPartIntake(part,{slug:'findmypart',customerEmail:part.customer_ref});
  assert.equal(good.ok,true);
  assert.equal(good.intake.customer_scope_confirmed,true);
  assert.equal(good.intake.fitment_verified,false);
  assert.equal(good.intake.live_inventory_verified,false);
  assert.match(good.intake_digest,/^[a-f0-9]{64}$/);
  assert.equal(buildFindMyPartIntake(part,{slug:'findmypart',customerEmail:part.customer_ref}).intake_digest,good.intake_digest);
  assert.notEqual(buildFindMyPartIntake({...part,part_number:'83982715'},{slug:'findmypart',customerEmail:part.customer_ref}).intake_digest,good.intake_digest);
  assert.equal(verifyFindMyPartPreflight({ok:true,intake_persisted:false},good.intake_digest),false);
  assert.equal(verifyFindMyPartCheckoutBinding({context_persisted:false},good.intake_digest,'intake-verified-001'),false);
});
test('owned buyer page collects real part details and asks for explicit permission',()=>{
  const html=renderOfferPage(catalog[0],{checkoutConfigured:true});
  for(const field of ['part_description','equipment_context','part_number','sources_tried','scope_confirmed','user_confirmed'])assert.match(html,new RegExp('name="'+field+'"'));
  assert.match(html,/Research/gi);
  assert.match(html,/scope/gi);
  assert.match(html,/part-deep/);
  assert.match(html,/part-rescue/);
  const held=renderOfferPage(catalog[0],{checkoutConfigured:false});
  assert.match(held,/Request assisted invoicing/);
  assert.match(held,/Part%20markings|Part%20or%20casting/);
});
const post=(base,slug,body)=>fetch(base+'/api/offers/'+slug+'/checkout',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),
  redirect:'manual',
});
test('missing part description or consent never calls payment infrastructure',async()=>{
  const seen=[];
  const runtime=await startFabricLocalRuntime({...options,purchaseIntentFetch:async(...args)=>{seen.push(args);throw Error('should not call');}});
  try{
    let r=await post(runtime.url,'findmypart',{user_confirmed:true,customer_ref:part.customer_ref});
    assert.equal(r.status,422);
    assert.equal((await r.json()).error,'part_description_required');
    r=await post(runtime.url,'findmypart',{...part,scope_confirmed:false});
    assert.equal(r.status,422);
    assert.equal((await r.json()).error,'part_scope_confirmation_required');
    assert.equal(seen.length,0);
  }finally{await runtime.close()}
});
test('unacknowledged scope blocks payment before provider checkout',async()=>{
  const calls=[];
  const runtime=await startFabricLocalRuntime({...options,purchaseIntentFetch:async(url,opts)=>{
    const body=JSON.parse(opts.body);calls.push(body);
    return Response.json({ok:true,schema:'raven.findmypart-context-preflight.v1',checkout_created:false,intake_persisted:false,intake_digest:body.intake_digest});
  }});
  try{
    const r=await post(runtime.url,'findmypart',part);
    assert.equal(r.status,503);
    assert.equal((await r.json()).error,'findmypart_intake_not_persisted');
    assert.equal(calls.length,1);
    assert.equal(calls[0].action,'findmypart_prepayment_preflight');
    assert.equal(calls[0].intake.customer_email,part.customer_ref);
    assert.equal(calls[0].checkout_created,false);
  }finally{await runtime.close()}
});
test('acknowledged scope is bound to exact $19 purchase and only then returns unpaid checkout',async()=>{
  const calls=[];
  let saved={};
  const runtime=await startFabricLocalRuntime({...options,purchaseIntentFetch:async(url,opts)=>{
    const body=JSON.parse(opts.body);calls.push(body);
    if(body.action==='findmypart_prepayment_preflight'){
      saved={intake_ref:'intake-verified-001',intake_digest:body.intake_digest};
      return Response.json({ok:true,schema:'raven.findmypart-context-preflight.v1',checkout_created:false,intake_persisted:true,...saved});
    }
    return Response.json({ok:true,checkout_ready:true,checkout_url:'https://settlement.example.test/checkout/unpaid',
      amount_cents:1900,currency:'usd',payment_state:'unpaid',context_persisted:true,fulfillment_release:false,
      order_key:body.idempotency_key, ...saved});
  }});
  try{
    const response=await post(runtime.url,'findmypart',part);
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.checkout_ready,true);
    assert.equal(result.payment_state,'unpaid');
    assert.equal(result.fulfillment_release,false);
    assert.equal(calls.length,2);
    assert.equal(calls[0].intake.equipment_context,'Ford tractor model 3600');
    assert.equal(calls[1].intake_digest,calls[0].intake_digest);
    assert.equal(calls[1].intake_ref,'intake-verified-001');
  }finally{await runtime.close()}
});
test('mismatched order-bound context and wrong price both fail closed',async()=>{
  for(const defect of ['digest','amount']){
    let calls=0;
    const runtime=await startFabricLocalRuntime({...options,purchaseIntentFetch:async(url,opts)=>{
      const body=JSON.parse(opts.body);calls++;
      if(body.action==='findmypart_prepayment_preflight')return Response.json({ok:true,schema:'raven.findmypart-context-preflight.v1',checkout_created:false,intake_persisted:true,intake_ref:'intake-verified-001',intake_digest:body.intake_digest});
      return Response.json({ok:true,checkout_ready:true,checkout_url:'https://settlement.example.test/checkout/unpaid',
        amount_cents:defect==='amount'?4900:1900,currency:'usd',context_persisted:true,fulfillment_release:false,
        intake_ref:'intake-verified-001',intake_digest:defect==='digest'?'0'.repeat(64):body.intake_digest});
    }});
    try{
      const res=await post(runtime.url,'findmypart',part);
      assert.equal(res.status,503);
      assert.equal((await res.json()).error,'evercraft_payments_checkout_not_ready');
      assert.equal(calls,2);
    }finally{await runtime.close()}
  }
});

test('Deep and Rescue tiers preserve exact amount and offer key through owned preflight',async()=>{
  for(const [slug,amount,offerKey] of [
    ['part-deep',4900,'findmypart.deep_hunt_49.v1'],
    ['part-rescue',9900,'findmypart.rescue_hunt_99.v1'],
  ]){
    const calls=[];
    let saved=null;
    const runtime=await startFabricLocalRuntime({...options,purchaseIntentFetch:async(url,opts)=>{
      const body=JSON.parse(opts.body);calls.push(body);
      if(body.action==='findmypart_prepayment_preflight'){
        saved={intake_ref:'intake-'+slug+'-verified',intake_digest:body.intake_digest};
        return Response.json({ok:true,schema:'raven.findmypart-context-preflight.v1',checkout_created:false,intake_persisted:true,...saved});
      }
      return Response.json({ok:true,checkout_ready:true,checkout_url:'https://settlement.example.test/checkout/unpaid',
        order_key:body.order_key,amount_cents:amount,currency:'usd',payment_state:'unpaid',
        context_persisted:true,fulfillment_release:false,...saved});
    }});
    try{
      const result=await post(runtime.url,slug,part);
      assert.equal(result.status,200,slug);
      const payload=await result.json();
      assert.equal(payload.checkout_ready,true);
      assert.equal(payload.payment_state,'unpaid');
      assert.equal(calls.length,2);
      assert.equal(calls[0].offer_key,offerKey);
      assert.equal(calls[1].offer_key,offerKey);
      assert.equal(calls[0].intake.offer_slug,slug);
      assert.equal(calls[1].intake_ref,saved.intake_ref);
    }finally{await runtime.close()}
  }
});
