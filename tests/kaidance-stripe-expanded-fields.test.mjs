import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readOfferStripeLinks} from '../systemia/payments/kaidance-stripe-readonly.mjs';
const offer={merchant:'test-merchant',payment_link_id:'plink_Test',price_id:'price_Test',product_id:'prod_Test',amount_cents:4900};
const bindings={merchant_accounts:{'test-merchant':{stripe_account_id:'acct_Test',livemode:true}},offers:[offer]};
const baseLink={id:offer.payment_link_id,active:true,url:'https://buy.stripe.com/test',automatic_tax:{enabled:false},managed_payments:{enabled:false},allow_promotion_codes:false,shipping_options:[],after_completion:{type:'hosted_confirmation'}};
const baseItem={quantity:1,adjustable_quantity:null,price:{id:offer.price_id,product:offer.product_id,unit_amount:4900,currency:'usd',type:'one_time',custom_unit_amount:null}};
async function run({editLink=()=>{},editItem=()=>{},more=false,fail=false,account='acct_Test'}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ec-checkout-test-'));
 try{
 const file=path.join(dir,'key');fs.writeFileSync(file,'rk_live_SYNTHETIC123',{mode:0o600});
 const calls=[];
 const fetchFn=async(url,opts)=>{
  const u=new URL(url);calls.push(u.pathname);assert.equal(u.origin,'https://api.stripe.com');assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');
  if(u.pathname==='/v1/account')return Response.json({id:account});
  if(u.pathname.endsWith('/line_items')){const item=structuredClone(baseItem);editItem(item);return Response.json({data:[item],has_more:more});}
  assert.equal(u.pathname,'/v1/payment_links/plink_Test');
  assert.deepEqual(u.searchParams.getAll('expand[]'),['optional_items']);
  if(fail)return new Response('',{status:400});
  const link={...structuredClone(baseLink),optional_items:null};editLink(link);return Response.json(link);
 };
 const result=await readOfferStripeLinks({bindings,credentialPaths:{'test-merchant':file},fetchFn});
 assert(!JSON.stringify(result).includes('rk_live_'));
 return {result,account:result.accounts[0],row:result.accounts[0]?.links[0],calls};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
for(const [name,edit,expected] of [
 ['explicit null',()=>{},0],['empty array',l=>l.optional_items=[],0],['missing',l=>delete l.optional_items,null],['malformed',l=>l.optional_items={},null],['nonempty',l=>l.optional_items=[{}],1]
])test('optional items: '+name,async()=>{const r=await run({editLink:edit});assert.equal(r.row.optional_items_count,expected);assert.equal(r.row.line_items[0].fixed_quantity_verified,true);assert.equal(r.calls.length,3);});
for(const [name,edit,expected] of [
 ['explicit nonadjustable',i=>i.adjustable_quantity={enabled:false},true],['adjustable',i=>i.adjustable_quantity={enabled:true},false],['missing adjustable',i=>delete i.adjustable_quantity,false],['malformed adjustable',i=>i.adjustable_quantity={},false],['multiple quantity',i=>i.quantity=2,false],['custom amount',i=>i.price.custom_unit_amount={minimum:1},false],['unknown custom amount',i=>delete i.price.custom_unit_amount,false]
])test('fixed quantity: '+name,async()=>{const r=await run({editItem:edit});assert.equal(r.row.line_items[0].fixed_quantity_verified,expected);});
test('expansion failure holds',async()=>{const r=await run({fail:true});assert.equal(r.account.complete,false);assert.equal(r.row,undefined);});
test('partial pagination holds',async()=>{const r=await run({more:true});assert.equal(r.account.complete,false);assert.equal(r.row,undefined);});
test('wrong merchant fails closed',async()=>{const r=await run({account:'acct_wrong'});assert.equal(r.result.accounts.length,0);assert.equal(r.calls.length,1);});
test('managed payment and tax flags preserved',async()=>{const r=await run({editLink:l=>{l.managed_payments.enabled=true;l.automatic_tax.enabled=true;}});assert.equal(r.row.managed_payments_enabled,true);assert.equal(r.row.automatic_tax_enabled,true);});
