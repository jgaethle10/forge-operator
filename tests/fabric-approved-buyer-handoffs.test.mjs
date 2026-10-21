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
];

test('existing public MCP tool set remains read-only and exactly 3 tools',()=>{
 const tools=fabricDirectoryTools();
 assert.equal(tools.length,3);
 assert.ok(tools.every(t=>t.annotations.readOnlyHint===true));
});
test('four historically approved offers remain catalog-correct but public MCP checkout is held after HTTP 402',async()=>{
 let total=0;
 for(const [id,slugs,amounts] of selected){
  const p=await run(id);
  assert.deepEqual(p.human_buyer_options,[]);
  assert.deepEqual(p.owned_human_buyer_options,[]);
  assert.equal(p.human_offer_url,null);
  assert.equal(p.buyer_checkout_available,false);
  assert.equal(p.human_buyer_options_state,'held_provider_http_402_requires_new_payment_receipt');
  assert.equal(p.transactional,false);
  assert.equal(p.external_action_taken,false);
  const archived=approvedHumanBuyerOptions(id,byId(id));
  assert.deepEqual(archived.map(x=>x.offer_slug),slugs);
  assert.deepEqual(archived.map(x=>x.price_cents),amounts);
  total+=archived.length;
 }
 assert.equal(total,6);
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


test('MCP list and match never leak a held checkout URL, but reviewed products offer human inquiry',async()=>{
 const list=await executeFabricDirectoryRpc({jsonrpc:'2.0',id:40,method:'tools/call',
  params:{name:'list_evercraft_capabilities',arguments:{limit:100}}},catalog);
 const entries=list.result.structuredContent.capabilities;
 assert.ok(entries.length>=6);
 const reviewed=[
  'audit-center-website-audit-machine-v1',
  'findmypart-paid-hunt-v1',
  'ibmi-rescue-v1',
  'legacy-rescue-lab-v1',
  'site-survive-rapid-audit-v1',
  'workflow-foundry-xray-v1',
 ];
 for(const id of reviewed){
  const entry=entries.find(x=>x.public_id===id);
  assert.ok(entry,id);
  assert.equal(entry.human_offer_url,null,id);
  assert.equal(entry.buyer_checkout_available,false,id);
  assert.equal(entry.start_url_state,'held_provider_http_402_requires_new_payment_receipt',id);
  assert.equal(entry.checkout_suppression_reason,'evercraft_public_commercial_mcp_http402_20261017',id);
  assert.equal(entry.human_sales_inquiry?.email,'jessegaethle10@gmail.com',id);
  assert.equal(entry.human_sales_inquiry?.order_created,false,id);
  assert.equal(entry.human_sales_inquiry?.payment_verified,false,id);
 }
 const rivet=entries.find(x=>x.public_id==='rivet-site-underwriting-v1');
 assert.equal(rivet.human_sales_inquiry,null);
 assert.ok(entries.every(x=>x.human_offer_url===null));
 const match=await executeFabricDirectoryRpc({jsonrpc:'2.0',id:41,method:'tools/call',
  params:{name:'match_evercraft_capability',arguments:{intent:'Website audit for leads and SEO',limit:5}}},catalog);
 const matched=match.result.structuredContent.matches;
 assert.ok(matched.some(x=>x.public_id==='audit-center-website-audit-machine-v1'));
 assert.ok(matched.every(x=>x.human_offer_url===null&&x.buyer_checkout_available===false));
 const direct=await run('audit-center-website-audit-machine-v1');
 assert.equal(direct.buyer_checkout_available,false);
 assert.equal(direct.human_offer_url,null);
 assert.equal(direct.human_sales_inquiry.email,'jessegaethle10@gmail.com');
 assert.equal(direct.human_sales_inquiry.fulfillment_authorized,false);
});
