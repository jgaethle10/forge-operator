#!/usr/bin/env node
/**
 * Local OS-process Saban pre-money worker. It is intentionally NOT registered
 * for remote execution and cannot receive money, credentials or live orders.
 * Each invocation runs a new Node process against a temporary synthetic ledger.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  createSovereignOrder,persistSovereignOrder,readSovereignOrder,
  transitionSovereignOrder,
} from '../payments/sovereign-order-ledger.mjs';

function assertTestOnly(dir){
  if(process.env.EVERCRAFT_PAYMENTS_TEST_ONLY!=='1')throw Error('test_worker_not_authorized');
  const root=fs.realpathSync(os.tmpdir());
  if(typeof dir!=='string'||!dir.startsWith(root+path.sep+'evercraft-saban-premoney-')||
     !path.isAbsolute(dir)||path.resolve(dir)!==dir){
    throw Error('synthetic_ledger_path_required');
  }
  const info=fs.lstatSync(dir);
  if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0){
    throw Error('synthetic_ledger_unsafe');
  }
}
export function executePreMoneyRole({role,dir,orderId,rail}={}){
  assertTestOnly(dir);
  let result;
  if(role==='create'){
    const order=createSovereignOrder({
      orderId,productKey:'findmypart',
      offerKey:'findmypart.quick_hunt_19.v1',
      amountCents:1900,customerRef:'synthetic-buyer-ref'
    });
    persistSovereignOrder(order,{dir});
    result={created:true,version:1,rail:null};
  }else if(role==='inspect'||role==='auditor'){
    const order=readSovereignOrder(orderId,{dir});
    result={version:order.version,rail:order.rail,
      payment_state:order.payment_state,
      collection_state:order.collection_state,
      paid:false,receipt_verified:false,
      entitlement_released:order.entitlement_state!=='held',
      fulfillment_released:order.fulfillment_state!=='held',
      amount_cents:order.amount_cents,
    };
    if(order.payment_state!=='unpaid'||order.settlement_receipt_ref!==null||
       order.entitlement_state!=='held'||order.fulfillment_state!=='held'){
      throw Error('auditor_detected_unverified_paid_or_delivery');
    }
  }else if(role==='select'){
    const order=readSovereignOrder(orderId,{dir});
    result=transitionSovereignOrder(orderId,{
      expectedVersion:order.version,action:'select_external_rail',
      rail,merchantRailConfigured:true,buyerConfirmed:true
    },{dir});
  }else if(role==='claim'){
    const order=readSovereignOrder(orderId,{dir});
    result=transitionSovereignOrder(orderId,{
      expectedVersion:order.version,action:'note_unverified_claim',
      claimRef:'synthetic-claim-123'
    },{dir});
  }else if(role==='attack'){
    const order=readSovereignOrder(orderId,{dir});
    let denied=0;
    for(const action of ['mark_paid','release_entitlement','process_webhook_without_proof']){
      try{
        transitionSovereignOrder(orderId,{
          expectedVersion:order.version,action
        },{dir});
      }catch(e){
        if(String(e.message)==='unsupported_or_money_mutating_action')denied++;
      }
    }
    if(denied!==3)throw Error('unauthorized_money_transition_not_blocked');
    result={attacks_attempted:3,blocked:3,paid:false};
  }else if(role==='replay'){
    const order=readSovereignOrder(orderId,{dir});
    try{
      transitionSovereignOrder(orderId,{
        expectedVersion:1,action:'select_external_rail',
        rail:rail||'bank_transfer',merchantRailConfigured:true,buyerConfirmed:true
      },{dir});
      throw Error('unexpected_duplicate_rail_accepted');
    }catch(e){
      if(!['order_version_conflict','order_payment_rail_already_selected'].includes(e.message))throw e;
      result={blocked:true,reason:'duplicate_or_stale_order_version'};
    }
    if(order.payment_state!=='unpaid')throw Error('replay_changed_payment_state');
  }else{
    throw Error('unknown_premoney_role');
  }
  return {
    schema:'evercraft.saban.payments-pre-money-worker.v1',
    role,status:'completed',synthetic:true,
    external_payment_attempted:false,provider_credentials_loaded:false,
    result,
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const [role,dir,orderId,rail]=process.argv.slice(2);
    console.log(JSON.stringify(executePreMoneyRole({role,dir,orderId,rail})));
  }catch(e){
    console.error(JSON.stringify({
      schema:'evercraft.saban.payments-pre-money-worker.v1',
      status:'blocked',reason:String(e?.message||'worker_error').slice(0,95),
      synthetic:true,external_payment_attempted:false
    }));
    process.exitCode=1;
  }
}
