#!/usr/bin/env node
/**
 * Saban pre-money gauntlet: isolated child *processes* on an authorized host.
 * Deliberately no remote NodeSeed, shell interpolation, internet, provider
 * credentials, bank mutation or payment functionality. Not a live checkout.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {evaluateSwarmQuality} from './quality-gate.mjs';

const WORKER=new URL('./payments-pre-money-worker.mjs',import.meta.url);
const RAILS=['cash','check','bank_transfer','zelle_business',
  'paypal_business','venmo_business','cash_app_business'];

function syntheticId(){return 'buyer-'+randomUUID();}
function runWorker({role,dir,orderId,rail=null,timeoutMs=10000}){
  return new Promise((resolve,reject)=>{
    const args=[WORKER.pathname,role,dir,orderId,...(rail?[rail]:[])];
    const child=spawn(process.execPath,args,{
      cwd:dir,stdio:['ignore','pipe','pipe'],shell:false,
      env:{
        PATH:process.env.PATH||'/usr/bin:/bin',
        HOME:dir,TMPDIR:os.tmpdir(),NODE_ENV:'test',
        EVERCRAFT_PAYMENTS_TEST_ONLY:'1'
      },
    });
    let stdout='',stderr='',closed=false;
    const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
    const receive=(which,chunk)=>{
      const text=String(chunk);
      if(which==='stdout')stdout+=text;
      else stderr+=text;
      if(stdout.length+stderr.length>24000)child.kill('SIGKILL');
    };
    child.stdout.on('data',x=>receive('stdout',x));
    child.stderr.on('data',x=>receive('stderr',x));
    child.on('error',error=>{if(!closed){closed=true;clearTimeout(timer);reject(error)}});
    child.on('close',code=>{
      if(closed)return;
      closed=true;clearTimeout(timer);
      let value;
      try{value=JSON.parse(String((code===0?stdout:stderr).trim()))}
      catch{return reject(Error('worker_output_unreadable'))}
      if(value.schema!=='evercraft.saban.payments-pre-money-worker.v1'||
         value.external_payment_attempted!==false||value.synthetic!==true){
        return reject(Error('worker_evidence_untrusted'));
      }
      resolve({exit:code===0?0:code,role,value});
    });
  });
}
async function mustPass(opts){
  const r=await runWorker(opts);
  if(r.exit!==0||r.value.status!=='completed')throw Error('saban_premoney_'+opts.role+'_failed:'+String(r.value?.reason||'worker'));
  return r.value.result;
}
function assertUnpaid(row){
  if(row.payment_state!=='unpaid'||row.fulfillment_released!==false||
     row.entitlement_released!==false||row.receipt_verified!==false){
    throw Error('saban_unverified_funds_misreported');
  }
}
async function pool(items,maxConcurrent,task){
  const results=new Array(items.length);
  let pos=0;
  await Promise.all(Array.from({length:Math.min(maxConcurrent,items.length)},async()=>{
    while(pos<items.length){
      const i=pos++;
      results[i]=await task(items[i],i);
    }
  }));
  return results;
}
export async function runSabanPreMoneyGauntlet({
  maxConcurrent=4,keepEvidence=false,
}={}){
  if(!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>8){
    throw Error('max_concurrent_worker_cap_invalid');
  }
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-saban-premoney-'));
  fs.chmodSync(dir,0o700);
  const workerResults=[];
  let workerAttempts=0;
  const testWorker=async({role,orderId,rail})=>{
    workerAttempts++;
    const x=await mustPass({role,orderId,rail,dir});
    workerResults.push({role,status:'completed'});
    return x;
  };
  try{
    const id=syntheticId();
    await testWorker({role:'create',orderId:id});
    const open=await testWorker({role:'inspect',orderId:id});
    assertUnpaid(open);
    const selected=await testWorker({role:'select',orderId:id,rail:'bank_transfer'});
    if(selected.version!==2||selected.rail!=='bank_transfer')throw Error('rail_selection_missing');
    const claimed=await testWorker({role:'claim',orderId:id});
    if(claimed.collection_state!=='customer_claim_unverified')throw Error('claim_not_unverified');
    await testWorker({role:'attack',orderId:id});
    await testWorker({role:'replay',orderId:id});
    const verified=await testWorker({role:'auditor',orderId:id});
    assertUnpaid(verified);
    if(verified.version!==3||verified.amount_cents!==1900)throw Error('order_lineage_incorrect');

    // Exercise every supported manual/business external method with its own
    // independent synthetic order and distinct child processes.
    const railCases=await pool(RAILS,maxConcurrent,async rail=>{
      const orderId=syntheticId();
      await testWorker({role:'create',orderId});
      const choice=await testWorker({role:'select',orderId,rail});
      const audit=await testWorker({role:'auditor',orderId});
      assertUnpaid(audit);
      if(choice.rail!==rail||audit.rail!==rail||audit.version!==2){
        throw Error('rail_proof_inconsistent');
      }
      return {rail,passed:true,provider_settlement_tested:false};
    });
    // Two simultaneous OS workers compete to choose the rail for ONE order.
    const raceId=syntheticId();
    await testWorker({role:'create',orderId:raceId});
    workerAttempts+=2;
    const race=await Promise.all([
      runWorker({role:'select',dir,orderId:raceId,rail:'bank_transfer'}),
      runWorker({role:'select',dir,orderId:raceId,rail:'paypal_business'}),
    ]);
    const winners=race.filter(x=>x.exit===0&&x.value.status==='completed');
    const losers=race.filter(x=>x.exit!==0&&x.value.status==='blocked'&&
      ['EEXIST','order_version_conflict','order_payment_rail_already_selected'].includes(x.value.reason));
    if(winners.length!==1||losers.length!==1)throw Error('concurrent_select_cas_failed');
    workerResults.push({role:'concurrent_cas',status:'completed'});
    const raceAudit=await testWorker({role:'auditor',orderId:raceId});
    assertUnpaid(raceAudit);
    if(raceAudit.version!==2)throw Error('concurrency_created_extra_transition');

    const roles=['create','inspect','select','claim','attack','replay','auditor','concurrent_cas'];
    const proof=evaluateSwarmQuality({
      contract:{quality:{
        minimum_completion_ratio:1,dead_letter_allowed:false,
        require_all_roles:true,enforcement:'fail_closed'
      }},
      plan:{roles,logical_agents:workerResults.length},
      results:workerResults,
      schedulerSummary:{
        total:workerResults.length,
        counts:{completed:workerResults.length,dead_letter:0}
      }
    });
    if(proof.status!=='pass')throw Error('saban_quality_gate_failed');

    return {
      schema:'evercraft.saban.payments-pre-money-gauntlet.v1',
      status:'pass',execution_fabric:'isolated_local_os_processes',
      physical_nodes_proven:1,
      independent_worker_processes_launched:workerAttempts,
      bounded_concurrency:maxConcurrent,
      rail_cases:railCases,
      same_order_concurrent_writers:{
        attempted:2,committed:1,rejected:1,final_order_version:2
      },
      buyer_claim_tested:true,unverified_claim_never_paid:true,
      duplicate_replay_blocked:true,
      unauthorized_paid_and_delivery_attempts_blocked:true,
      restart_readback_verified:true,
      no_provider_credentials:true,
      external_money_movement_attempted:false,
      real_bank_or_provider_settlement_verified:false,
      customer_funds_processed:false,
      canonical_order_reconciliation:'synthetic_only',
      public_buyer_checkout_verified:false,
      quality:{status:proof.status,missing_roles:proof.missing_roles,
        completion_ratio:proof.completion_ratio,dead_letter:proof.dead_letter},
      next_gate:'authenticated_merchant_rail_configuration_and_authoritative_settlement_evidence'
    };
  }finally{
    if(!keepEvidence)fs.rmSync(dir,{recursive:true,force:true});
  }
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{
    const args=process.argv.slice(2);
    if(args.length>2||args.some(x=>!['--json','--concurrency=2','--concurrency=4','--concurrency=8'].includes(x))){
      throw Error('usage: payments-pre-money-gauntlet.mjs --json [--concurrency=2|4|8]');
    }
    const choice=args.find(x=>x.startsWith('--concurrency='));
    const result=await runSabanPreMoneyGauntlet({
      maxConcurrent:choice?Number(choice.split('=')[1]):4
    });
    console.log(JSON.stringify(result,null,2));
  }catch(e){
    console.error(JSON.stringify({status:'fail',reason:String(e?.message||'gauntlet_error').slice(0,140),
      payment_attempted:false}));
    process.exitCode=1;
  }
}
