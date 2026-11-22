// First-party, read-only Stripe adapter, only for owner-provisioned private keys.
// No secret, account details or raw provider response is written to GitHub.
import fs from 'node:fs';
import path from 'node:path';
const API='https://api.stripe.com';
function privateKeyFile(filename,repoRoot=''){
 if(typeof filename!=='string'||!path.isAbsolute(filename)||!fs.existsSync(filename))throw Error('stripe_key_file_missing');
 const resolved=path.resolve(filename);
 if(repoRoot&&(resolved===repoRoot||resolved.startsWith(repoRoot+path.sep)))throw Error('stripe_key_must_not_reside_in_source_tree');
 const stat=fs.lstatSync(resolved);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('stripe_key_file_not_private');
 const value=fs.readFileSync(resolved,'utf8').trim();
 if(!/^sk_(?:live|test)_[A-Za-z0-9]+$/.test(value)||!value.startsWith('sk_live_'))throw Error('stripe_live_key_required');
 return value;
}
async function stripeGet(endpoint,key,fetchFn){
 const response=await fetchFn(API+endpoint,{
  method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(9000),
  headers:{Authorization:'Bearer '+key,Accept:'application/json'}
 });
 if(!response.ok)throw Error('stripe_read_failed_'+response.status);
 return response.json();
}
export async function readOfferStripeLinks({bindings,credentialPaths={},repoRoot='',fetchFn=fetch,now=new Date()}={}){
 const accounts=[];
 for(const [merchant,pin] of Object.entries(bindings.merchant_accounts||{})){
  const filename=credentialPaths[merchant];
  if(!filename)continue;
  let key;
  try{key=privateKeyFile(filename,repoRoot)}catch{continue}
  try{
   const account=await stripeGet('/v1/account',key,fetchFn);
   if(account?.id!==pin.stripe_account_id||pin.livemode!==true)continue;
   const offers=bindings.offers.filter(x=>x.merchant===merchant);
   const rows=[];
   for(const offer of offers){
    let link;
    try{
     link=await stripeGet('/v1/payment_links/'+encodeURIComponent(offer.payment_link_id),key,fetchFn);
     const items=await stripeGet('/v1/payment_links/'+encodeURIComponent(offer.payment_link_id)+'/line_items?limit=100',key,fetchFn);
     if(link.id!==offer.payment_link_id||items.has_more!==false||!Array.isArray(items.data))continue;
     rows.push({id:link.id,active:link.active===true,url:link.url,
      after_completion:link.after_completion||null,
      line_items_complete:true,line_items:items.data.map(item=>({
       price_id:typeof item.price==='object'?item.price.id:null,
       product_id:typeof item.price?.product==='string'?item.price.product:item.price?.product?.id||null,
       unit_amount:item.price?.unit_amount,quantity:item.quantity,
       currency:item.price?.currency,type:item.price?.type
      }))});
    }catch{continue}
   }
   accounts.push({merchant,account_id:account.id,livemode:true,
    observed_at:new Date(now).toISOString(),
    source:'stripe_api_authenticated_read',complete:rows.length===offers.length,links:rows});
  }finally{key=null}
 }
 return {schema:'evercraft.payments.stripe-link-readback.v1',accounts};
}
