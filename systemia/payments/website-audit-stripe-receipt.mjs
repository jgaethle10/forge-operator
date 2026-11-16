// Read-only candidate verification for the live Website Audit Stripe settlement link.
// This function MUST receive objects read through an authenticated Stripe adapter.
// It does not create an Evercraft order, grant an entitlement, or release fulfillment.
import crypto from 'node:crypto';

export const AUDIT_STRIPE_CHECKOUT=Object.freeze({
  offer_key:'systemia.website_audit_quick_win_49.v1',
  payment_link:'plink_1UcF345rgRECaZMDssa3Q87v',
  price:'price_1UcF2D5rgRECaZMDEz4rR5VW',
  product:'prod_VdW4DsNwvteF4f',
  amount_cents:4900,
  currency:'usd'
});
const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const GOALS=new Set(['quotes','calls','bookings','sales','trust']);
const fail=(reason)=>({ok:false,reason,order_created:false,fulfillment_release:false});

function publicHttpsSite(raw){
  if(typeof raw!=='string'||raw.length>1000)return null;
  try{
    const u=new URL(raw);
    const h=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||u.username||u.password||u.port||
      h.length>253||!h.includes('.')||!/^[a-z0-9.-]+$/.test(h)||
      h==='localhost'||h.endsWith('.local')||h.endsWith('.internal')||
      /^\d+(?:\.\d+){3}$/.test(h))return null;
    u.search='';u.hash='';return u.toString();
  }catch{return null;}
}

export function inspectWebsiteAuditStripeCheckout(session,lineItems,{authenticatedProviderRead=false}={}){
  if(!authenticatedProviderRead)return fail('authenticated_stripe_read_required');
  if(!session||typeof session!=='object'||!lineItems||
    !Array.isArray(lineItems.data))return fail('missing_provider_evidence');
  if(session.livemode!==true||!/^cs_live_[A-Za-z0-9]+$/.test(String(session.id||''))||
     session.mode!=='payment'||session.payment_link!==AUDIT_STRIPE_CHECKOUT.payment_link)
    return fail('wrong_live_checkout');
  if(session.status!=='complete'||session.payment_status!=='paid')return fail('payment_not_verified');
  if(session.currency!==AUDIT_STRIPE_CHECKOUT.currency||
     session.amount_total!==AUDIT_STRIPE_CHECKOUT.amount_cents||
     session.metadata?.offer_key!==AUDIT_STRIPE_CHECKOUT.offer_key||
     session.metadata?.authority!=='Evercraft Payments')
    return fail('exact_offer_mismatch');
  if(session.automatic_tax?.enabled!==true||session.automatic_tax?.status!=='complete')
    return fail('automatic_tax_not_confirmed');
  if(lineItems.has_more===true||lineItems.data.length!==1)return fail('line_item_count_mismatch');
  const line=lineItems.data[0];
  const price=typeof line?.price==='string'?line.price:line?.price?.id;
  const product=typeof line?.price?.product==='string'?line.price.product:line?.price?.product?.id;
  if(price!==AUDIT_STRIPE_CHECKOUT.price||line?.quantity!==1||
     (product&&product!==AUDIT_STRIPE_CHECKOUT.product))
    return fail('price_line_item_mismatch');
  const fields=Array.isArray(session.custom_fields)?session.custom_fields:[];
  if(fields.length!==2||new Set(fields.map(f=>f.key)).size!==2)return fail('missing_checkout_intake');
  const site=publicHttpsSite(fields.find(f=>f.key==='websiteurl')?.text?.value);
  const goal=fields.find(f=>f.key==='auditgoal')?.dropdown?.value;
  const email=String(session.customer_details?.email||session.customer_email||'').toLowerCase().trim();
  if(!site||!GOALS.has(goal)||!EMAIL.test(email)||email.length>200)
    return fail('invalid_checkout_intake');
  const fingerprint=crypto.createHash('sha256').update(String(session.id)).digest('hex').slice(0,24);
  return {
    ok:true,
    state:'provider_paid_candidate',
    order_created:false,
    fulfillment_release:false,
    required_next_step:'reconcile_to_private_evercraft_payments_order_and_quality_review',
    receipt_candidate:{
      schema:'evercraft.website-audit.stripe-paid-candidate.v1',
      order_reference:'EC-WA-'+fingerprint.toUpperCase(),
      provider_session_id:session.id,
      payment_link_id:AUDIT_STRIPE_CHECKOUT.payment_link,
      offer_key:AUDIT_STRIPE_CHECKOUT.offer_key,
      amount_cents:AUDIT_STRIPE_CHECKOUT.amount_cents,
      currency:AUDIT_STRIPE_CHECKOUT.currency,
      customer_email:email,
      website_url:site,
      goal,
      source:'authenticated_stripe_api',
      refund_status_not_verified:true,
      human_review_required:true,
      fulfillment_state:'not_released'
    }
  };
}
