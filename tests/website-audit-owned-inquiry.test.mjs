import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  validateWebsiteAuditInquiry,
  websiteAuditInquiryReadiness,
  createWebsiteAuditAlertDispatcher,
} from '../systemia/mcp/website-audit-inquiry.mjs';
import {renderOfferPage} from '../systemia/mcp/fabric-public-site.mjs';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

const ORIGIN='https://fabric.systemiacommandcenters.com';
const offer={
  public_id:'audit-center-website-audit-machine-v1',
  name:'Systemia Website Audit',
  description:'Public website audit, priority fix recommendations',
  keywords:['website','audit'],
  commercial_state:'sell_now',
  state:'payment_ready',
  pricing:'Quick Win Audit $49 one time',
  entry_paid_offer:{name:'Quick Win Audit',price:'$49',price_usd_normalized:49,billing:'one_time'},
  connections:[],
};
const payload={email:'buyer@example.com',website_url:'https://example.com/?utm_source=demo#fragment',
  goal:'More qualified calls and clearer customer journeys',consent:'yes'};
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-website-audit-intake-'));

test('audit request validates consent, strips URL tracking, and rejects internal endpoints',()=>{
  const valid=validateWebsiteAuditInquiry(payload);
  assert.equal(valid.value.email,'buyer@example.com');
  assert.equal(valid.value.website_url,'https://example.com/');
  assert.equal(valid.value.goal,payload.goal);
  assert.equal(valid.value.consent,true);
  assert.equal(validateWebsiteAuditInquiry({...payload,consent:'no'}).error,'consent_required');
  assert.equal(validateWebsiteAuditInquiry({...payload,website_url:'http://example.com'}).error,'public_https_site_required');
  assert.equal(validateWebsiteAuditInquiry({...payload,website_url:'https://localhost/'}).error,'public_https_site_required');
  assert.equal(validateWebsiteAuditInquiry({...payload,website_url:'https://192.168.1.20/private'}).error,'public_https_site_required');
  assert.equal(validateWebsiteAuditInquiry({...payload,website_url:'https://user:pass@example.com'}).error,'public_https_site_required');
  assert.equal(validateWebsiteAuditInquiry({...payload,company_website_honey:'bot'}).honeypot,true);
});
test('unavailable private storage is not advertised as a working intake',()=>{
  const folder=temp();
  try{
    fs.chmodSync(folder,0o755);
    assert.equal(websiteAuditInquiryReadiness({storeDir:folder}).intake_available,false);
    fs.chmodSync(folder,0o700);
    assert.equal(websiteAuditInquiryReadiness({storeDir:folder}).intake_available,true);
    assert.equal(fs.statSync(path.join(folder,'alert-outbox')).mode&0o077,0);
  }finally{fs.chmodSync(folder,0o700);fs.rmSync(folder,{recursive:true,force:true})}
});
test('held page presents consented audit request, never promises working native checkout',()=>{
  const page=renderOfferPage(offer,{checkoutConfigured:false,auditInquiryAvailable:true});
  assert.match(page,/Request your Quick Win Audit/);
  assert.match(page,/method="post" action="\/api\/website-audit\/inquiry"/);
  assert.match(page,/name="website_url"/);
  assert.match(page,/name="consent" value="yes" required/);
  assert.match(page,/No charge, payment order, or automatic audit starts here/);
  assert.doesNotMatch(page,/Continue to checkout/);
  assert.doesNotMatch(page,/Request assisted invoicing/);
  assert.ok(page.indexOf('class="audit-intake-form"')<page.indexOf('class="audit-preview"'));
  const notReady=renderOfferPage(offer,{checkoutConfigured:false,auditInquiryAvailable:false});
  assert.match(notReady,/Email Evercraft for invoicing/);
  assert.doesNotMatch(notReady,/tel:\\+/);
  assert.doesNotMatch(notReady,/class="audit-intake-form"/);
  const configured=renderOfferPage(offer,{checkoutConfigured:true,auditInquiryAvailable:true});
  assert.match(configured,/Continue to checkout/);
  assert.doesNotMatch(configured,/class="audit-intake-form"/);
});
test('public buyer can request an audit without a charge; private receipt and PII-free alert are durable',async()=>{
  const folder=temp();
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog:[offer],faieSurfaceEnabled:false,
    websiteAuditLeadsDir:folder,purchaseIntentUrl:'',paymentOpsUrl:'',
  });
  try{
    const health=await fetch(runtime.url+'/health').then(r=>r.json());
    assert.equal(health.website_audit_inquiry_available,true);
    assert.equal(health.human_offer_checkout_enabled,false);
    const readiness=await fetch(runtime.url+'/api/website-audit/readiness').then(r=>r.json());
    assert.equal(readiness.intake_available,true);
    assert.equal(readiness.payment_ready,false);
    const page=await fetch(runtime.url+'/offers/website-audit').then(r=>r.text());
    assert.match(page,/class="audit-intake-form"/);
    assert.doesNotMatch(page,/Continue to checkout/);

    const submit=(value,origin=ORIGIN,contentType='application/x-www-form-urlencoded')=>
      fetch(runtime.url+'/api/website-audit/inquiry',{method:'POST',
        headers:{origin,'content-type':contentType},
        body:new URLSearchParams(value)});
    const blocked=await submit(payload,'https://untrusted.example');
    assert.equal(blocked.status,403);
    const incomplete=await submit({...payload,consent:'no'});
    assert.equal(incomplete.status,422);
    const badSite=await submit({...payload,website_url:'https://localhost/'});
    assert.equal(badSite.status,422);
    const bot=await submit({...payload,company_website_honey:'hidden'});
    assert.equal(bot.status,202);
    assert.equal(fs.readdirSync(folder).filter(x=>x.endsWith('.json')).length,0);
    const accepted=await submit(payload);
    assert.equal(accepted.status,201);
    const text=await accepted.text();
    assert.match(text,/Your request is recorded/);
    assert.match(text,/No payment, order, or automated audit/);
    assert.doesNotMatch(text,/buyer@example\.com/);
    const saved=fs.readdirSync(folder).filter(x=>/^EC-AUDIT-[A-F0-9]{20}\.json$/.test(x));
    assert.equal(saved.length,1);
    const file=path.join(folder,saved[0]);
    const record=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(record.website_url,'https://example.com/');
    assert.equal(record.email,'buyer@example.com');
    assert.equal(record.requested_amount_cents,4900);
    assert.equal(record.payment_created,false);
    assert.equal(record.order_created,false);
    assert.equal(record.agent_execution_authorized,false);
    assert.equal(fs.statSync(file).mode&0o077,0);
    const alert=JSON.parse(fs.readFileSync(path.join(folder,'alert-outbox',saved[0]),'utf8'));
    assert.equal(alert.reference,record.reference);
    assert.equal(alert.has_customer_pii,false);
    assert.ok(!JSON.stringify(alert).includes(record.email));
    const sent=[];
    const dispatcher=createWebsiteAuditAlertDispatcher({storeDir:folder,recipient:'founder-test',
      notify:async intent=>{sent.push(intent);return {inboxed:1}}});
    assert.equal(dispatcher.enabled,true);
    const relay=await dispatcher.dispatch();
    assert.equal(relay.accepted,1);
    assert.equal(sent.length,1);
    assert.ok(!JSON.stringify(sent[0]).includes(record.email));
    assert.equal(fs.readdirSync(path.join(folder,'alert-outbox')).length,0);
    assert.equal(fs.readdirSync(path.join(folder,'alert-receipts')).length,1);
    dispatcher.stop();
    for(let i=0;i<2;i++)assert.equal((await submit(payload)).status,201);
    assert.equal((await submit(payload)).status,429);
  }finally{
    await runtime.close();
    fs.rmSync(folder,{recursive:true,force:true});
  }
});


test('website audit buyer sees honest, low-friction $49 journey and can choose a specific conversion goal',()=>{
  const held=renderOfferPage(offer,{checkoutConfigured:false,auditInquiryAvailable:true});
  assert.match(held,/No jargon\. No giant contract/);
  assert.match(held,/YOUR QUICK WIN MAP/);
  assert.match(held,/Illustrative sample/);
  assert.match(held,/No meeting or website credentials are needed/);
  assert.match(held,/Does \$49 include changing my website/);
  assert.match(held,/id="audit-order"/);
  assert.match(held,/href="#audit-order"/);
  assert.match(held,/select id="audit-inquiry-goal" name="goal" required/);
  assert.match(held,/Get more quote requests/);
  assert.doesNotMatch(held,/We audited your website|Guaranteed more sales|62%/i);
  assert.ok(held.indexOf('class="audit-journey"')<held.indexOf('id="audit-order"'));
  const configured=renderOfferPage(offer,{checkoutConfigured:true,auditInquiryAvailable:true});
  assert.match(configured,/id="audit-order" class="checkout-form"/);
  assert.match(configured,/Continue to checkout/);
  assert.doesNotMatch(configured,/class="audit-intake-form"/);
});
