// Isolated proof only; not connected to any production worker, HTTP route or scheduler.
import {AtlasPrivateFreightLedger} from './private-freight-ledger.mjs';
import {planIndustrialProof} from './industrial-order-proof.mjs';
const tenant='industrial-proof';

export function resumeIndustrialProof({ledger,sessionToken,input,maxSteps=3}={}){
 if(!(ledger instanceof AtlasPrivateFreightLedger))
  throw Error('atlas_ledger_required');
 if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>3)
  throw Error('invalid_step_limit');
 const p=planIndustrialProof(input),receipts=[];
 function step(type,payload,idempotencyKey){
  const {revision}=ledger.read({sessionToken,tenant});
  // The ledger hashes the complete request, including the plan intent hash.
  // All three keys are stable across retries, even when the plan changes.
  const result=ledger.mutate({sessionToken,tenant,type,
   payload:{...payload,industrial_proof_intent_hash:p.intent_hash},
   idempotencyKey,expectedRevision:revision});
  const receipt=ledger.readMutationReceipt({sessionToken,tenant,
   idempotencyKey,eventHash:result.event_hash});
  if(receipt.type!==type)throw Error('industrial_receipt_type_conflict');
  receipts.push({type,event_hash:receipt.event_hash,revision:receipt.revision,
   state:result.state});
  return receipt.record;
 }
 const finish=()=>({
  schema:'evercraft.industrial.resume-proof.v1',synthetic:true,
  order_ref:p.order_ref,intent_hash:p.intent_hash,receipts,
  complete:receipts.length===3,real_revenue_cents:0,
  purchase_authorized:false,dispatch_authorized:false
 });
 const shipper=step('shipper.created',{name:'Synthetic Sage Supply'},p.keys.shipper);
 if(maxSteps===1)return finish();
 const load=step('load.opened',{shipper_id:shipper.id,
  origin:p.freight.origin,destination:p.freight.destination,
  equipment:p.freight.equipment},p.keys.load);
 if(maxSteps===2)return finish();
 step('load.quoted',{load_id:load.id,
  customer_rate_cents:p.freight.customer_rate_cents,
  carrier_cost_cents:p.freight.carrier_cost_cents},p.keys.quote);
 return finish();
}
