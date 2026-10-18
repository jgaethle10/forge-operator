import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
 approvedHumanBuyerOptions,loadFabricCatalogFromRepository,executeFabricDirectoryRpc,fabricDirectoryTools,
} from '../systemia/mcp/fabric-directory.mjs';

const catalog=loadFabricCatalogFromRepository();
const byId=id=>catalog.find(x=>x.public_id===id);
const run=async(id)=>{
 const r=await executeFabricDirectoryRpc({jsonrpc:'2.0',id:10,method:'tools/call',
  params:{name:'get_evercraft_connection_options',arguments:{public_id:id}}},catalog);
 assert.equal(r?.result?.isError,false);
 return r.result.structuredContent;
};
const selected=[
 ['audit-center-website-audit-machine-v1',['website-audit'],[4900]],
 ['findmypart-paid-hunt-v1',['part-quick','part-deep','part-rescue'],[1900,4900,9900]],
 ['eventwave-paid-promotion-v1',['event-boost'],[4900]],
 ['site-survive-rapid-audit-v1',['site-survive'],[25000]],
 ['workflow-foundry-xray-v1',['workflow-xray'],[25000]],
];

test('existing public MCP tool set remains read-only and exactly 3 tools',()=>{
 const tools=fabricDirectoryTools();
 assert.equal(tools.length,3);
 assert.ok(tools.every(t=>t.annotations.readOnlyHint===true));
});
test('five exact approved capabilities receive 7 explicit hosted buyer handoffs',async()=>{
 let total=0;
 for(const [id,slugs,amounts] of selected){
  const p=await run(id);
  assert.deepEqual(p.human_buyer_options.map(x=>x.offer_slug),slugs);
  assert.deepEqual(p.human_buyer_options.map(x=>x.price_cents),amounts);
  assert.equal(p.transactional,false);
  assert.equal(p.external_action_taken,false);
  assert.ok(p.human_buyer_options.every(x=>
   x.human_form_url==='https://findmypart.base44.app/functions/evercraftBuy?offer='+x.offer_slug&&
   x.hosting==='transitional_provider_hosted'&&x.buyer_confirmation_required&&
   !x.checkout_created&&!x.payment_verified&&!x.fulfillment_verified));
  total+=p.human_buyer_options.length;
 }
 assert.equal(total,7);
});
test('RIVET and AliEV protected state plus mismatched IBM i and legacy product stay held',async()=>{
 for(const id of [
  'rivet-site-underwriting-v1','aliev-site-opportunity-snapshot-v1',
  'ibmi-rescue-v1','legacy-rescue-lab-v1','faie-signal-brief-v1','earthworks-site-autonomy-study-v1']){
  const p=await run(id);
  assert.deepEqual(p.human_buyer_options,[],id);
 }
});
test('price mismatch or missing primary source entry fails closed',()=>{
 const original=byId('audit-center-website-audit-machine-v1');
 assert.equal(approvedHumanBuyerOptions(original.public_id,{
  ...original,entry_paid_offer:{...original.entry_paid_offer,price_usd_normalized:51}}).length,0);
 assert.deepEqual(approvedHumanBuyerOptions('wrong-id',original),[]);
});
test('malformed catalog, changed external URL, altered amount, false paid claim and duplicate crosswalk fail closed',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-buyer-handoff-'));
 try{
  const buyerSource=JSON.parse(fs.readFileSync(new URL('../public/.well-known/evercraft-payments-buyer-doors.json',import.meta.url),'utf8'));
  const crossSource=JSON.parse(fs.readFileSync(new URL('../public/.well-known/evercraft-fabric-human-buyer-handoffs.json',import.meta.url),'utf8'));
  const buyerPath=path.join(tmp,'buyer.json');
  const crosswalkPath=path.join(tmp,'map.json');
  const check=(buyer,map)=>{fs.writeFileSync(buyerPath,JSON.stringify(buyer));fs.writeFileSync(crosswalkPath,JSON.stringify(map));
    return approvedHumanBuyerOptions('audit-center-website-audit-machine-v1',byId('audit-center-website-audit-machine-v1'),{buyerCatalogPath:buyerPath,crosswalkPath});};
  assert.equal(check(buyerSource,crossSource).length,1);
  const altered=structuredClone(buyerSource);altered.offers.find(x=>x.slug==='website-audit').buyer_url='https://evil.example/checkout';
  assert.deepEqual(check(altered,crossSource),[]);
  const falsePaid=structuredClone(buyerSource);falsePaid.offers.find(x=>x.slug==='website-audit').payment_receipt_state='paid_verified';
  assert.deepEqual(check(falsePaid,crossSource),[]);
  const changedPrice=structuredClone(buyerSource);changedPrice.offers.find(x=>x.slug==='website-audit').amount_cents=5100;
  assert.deepEqual(check(changedPrice,crossSource),[]);
  const duplicated=structuredClone(crossSource);duplicated.capabilities.push({...duplicated.capabilities[0]});
  assert.deepEqual(check(buyerSource,duplicated),[]);
  const forgedHome=structuredClone(buyerSource);forgedHome.live_buyer_home='https://evil.example';
  assert.deepEqual(check(forgedHome,crossSource),[]);
  assert.deepEqual(approvedHumanBuyerOptions('audit-center-website-audit-machine-v1',byId('audit-center-website-audit-machine-v1'),{
    buyerCatalogPath:'/nonexistent/evercraft-buyer-handoff.json',crosswalkPath}),[]);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('agent discovery never creates a payment when given a business problem',async()=>{
 const r=await executeFabricDirectoryRpc({jsonrpc:'2.0',id:11,method:'tools/call',params:{
 name:'match_evercraft_capability',arguments:{intent:'My website needs a $49 conversion audit',limit:5}}},catalog);
 assert.equal(r.result.structuredContent.transactional,false);
 assert.equal(r.result.structuredContent.external_action_taken,false);
});
