// INDUSTRIAL-001: isolated synthetic order planning. No writes, networking,
// credentials, supplier verification, payment, dispatch or live authorization.
import {createHash} from 'node:crypto';
import {summarizeRecovery} from '../findmypart/recovery-engine.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const moneyKeys = ['sale_cents','merchandise_cents','freight_cents','fees_cents','reserve_cents'];
const MAX = 100_000_000;

export function planIndustrialProof({orderId,recovery,quote,shipment}={}) {
 if(typeof orderId!=='string'||!/^SIM-[A-Z0-9-]{1,40}$/.test(orderId))
  throw Error('synthetic_order_id_required');
 if(quote?.synthetic!==true||shipment?.synthetic!==true)
  throw Error('synthetic_only');
 if(recovery?.schema!=='evercraft.findmypart.recovery-case.v1' ||
    recovery.fulfillment!=='not_authorized' ||
    recovery.safety?.review_required!==false)
  throw Error('recovery_review_hold');
 const summary=summarizeRecovery(recovery);
 const leads=recovery.tracks.flatMap(t=>t.candidates);
 // Never admit actual supplier evidence or interpret a fixture as confirmed fit.
 if(!leads.length||summary.source_count!==leads.length||
    leads.some(l=>{
      try {const u=new URL(l.url);return u.protocol!=='https:'||
        !u.hostname.endsWith('.invalid')||!!u.username||!!u.password||
        l.identity!=='unverified'||l.fitment!=='unverified'||
        l.availability!=='unverified'||l.safety_review_required!==false;}
      catch{return true;}
    }))
  throw Error('synthetic_evidence_required');
 const amounts={};
 for(const k of moneyKeys){
  if(!Number.isSafeInteger(quote[k])||quote[k]<0||quote[k]>MAX)
   throw Error('invalid_cost_input');
  amounts[k]=quote[k];
 }
 if(amounts.sale_cents===0||amounts.freight_cents===0)
  throw Error('positive_sale_and_freight_required');
 const total=amounts.merchandise_cents+amounts.freight_cents+
  amounts.fees_cents+amounts.reserve_cents;
 const contribution=amounts.sale_cents-total;
 // Exact integer comparison; 20% is this proof's fixture rule, not pricing policy.
 if(contribution*10000<amounts.sale_cents*2000)
  throw Error('insufficient_margin');
 const route={};
 for(const k of ['origin','destination','equipment']){
  const v=shipment[k];
  if(typeof v!=='string'||!v.trim()||v.trim().length>(k==='equipment'?60:120))
   throw Error('invalid_shipment_input');
  route[k]=v.trim();
 }
 if(route.origin.toLowerCase()===route.destination.toLowerCase())
  throw Error('same_origin_destination');
 // Stable logical order ID is independent of costs and evidence revisions.
 const order_ref=digest(['industrial-proof-v1',orderId]);
 const intent_hash=digest([order_ref,recovery,amounts,route]);
 return {
  schema:'evercraft.industrial.order-proof.v1',synthetic:true,order_ref,intent_hash,
  costs:{...amounts,total_cost_cents:total,contribution_cents:contribution,
    contribution_bps:Math.floor(contribution*10000/amounts.sale_cents)},
  // Freight is cost allocation only; no separate freight profit or revenue.
  freight:{...route,customer_rate_cents:amounts.freight_cents,
    carrier_cost_cents:amounts.freight_cents},
  keys:{shipper:order_ref+':shipper',load:order_ref+':load',quote:order_ref+':quote'},
  purchase_authorized:false,dispatch_authorized:false,real_revenue_cents:0
 };
}
// Compare to a trusted previously recorded plan. This does NOT persist it.
export function assertSameIndustrialIntent(previous,next){
 if(previous?.schema!=='evercraft.industrial.order-proof.v1'||
    next?.schema!==previous.schema||previous.synthetic!==true||next.synthetic!==true||
    previous.order_ref!==next.order_ref||previous.intent_hash!==next.intent_hash)
  throw Error('industrial_intent_conflict');
 return true;
}
