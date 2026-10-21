#!/usr/bin/env node
/**
 * Saban local HTTP gauntlet for Evercraft-owned invoices.
 * One localhost-only synthetic HTTP server, independent buyer/client processes,
 * real HTTP requests; no real payment rails, credentials or customer orders.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {evaluateSwarmQuality} from './quality-gate.mjs';

const SERVER=new URL('../payments/synthetic-invoice-http.mjs',import.meta.url);
const CLIENT=new URL('./payments-http-client.mjs',import.meta.url);
const RAILS=['cash','check','bank_transfer','zelle_business','paypal_business','venmo_business','cash_app_business'];

function launch(program,args,{cwd,env,timeoutMs=7500}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[program.pathname,...args],{
      cwd,env,stdio:['ignore','pipe','pipe'],shell:false
    });
    let out='',err='',finished=false;
    const timeout=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
    for(const [stream,label] of [[child.stdout,'out'],[child.stderr,'err']]){
      stream.on('data',chunk=>{
        if(label==='out')out+=String(chunk);
        else err+=String(chunk);
        if(out.length+err.length>12000)child.kill('SIGKILL');
      });
    }
    child.on('error',e=>{
      if(finished)return;
      finished=true;clearTimeout(timeout);reject(e);
    });
    child.on('close',code=>{
      if(finished)return;
      finished=true;clearTimeout(timeout);
      let data;
      try{data=JSON.parse((code===0?out:err).trim())}
      catch{return reject(Error('http_worker_output_unreadable'))}
      if(data.schema!=='evercraft.saban.synthetic-http-client.v1'||
         data.synthetic!==true||data.provider_calls!==0||
         data.money_moved!==false){
        return reject(Error('http_worker_receipt_invalid'));
      }
      resolve({code,data});
    });
  });
}
function startServer({dir,token,timeoutMs=7000}){
  return new Promise((resolve,reject)=>{
    const env={PATH:process.env.PATH||'/usr/bin:/bin',
      HOME:dir,TMPDIR:os.tmpdir(),NODE_ENV:'test',
      EVERCRAFT_PAYMENTS_TEST_ONLY:'1',
      EVERCRAFT_SYNTHETIC_HTTP_TOKEN:token,
      EVERCRAFT_SYNTHETIC_LEDGER_DIR:dir};
    const child=spawn(process.execPath,[SERVER.pathname],{
      cwd:dir,env,stdio:['ignore','pipe','pipe'],shell:false
    });
    let out='',err='',settled=false;
    const timeout=setTimeout(()=>{
      if(settled)return;
      settled=true;child.kill('SIGKILL');reject(Error('synthetic_http_server_ready_timeout'));
    },timeoutMs);
    child.stdout.on('data',buffer=>{
      if(settled)return;
      out+=String(buffer);
      if(out.length>5000){
        settled=true;clearTimeout(timeout);child.kill('SIGKILL');
        return reject(Error('synthetic_http_server_output_too_large'));
      }
      const i=out.indexOf('\n');
      if(i<0)return;
      let x;
      try{x=JSON.parse(out.slice(0,i))}catch{
        settled=true;clearTimeout(timeout);child.kill('SIGKILL');
        return reject(Error('synthetic_http_server_ready_invalid'));
      }
      if(x.schema!=='evercraft.payments.synthetic-loopback-server.v1'||
         x.host!=='127.0.0.1'||x.money_enabled!==false||x.public!==false||
         !Number.isInteger(x.port)){
        settled=true;clearTimeout(timeout);child.kill('SIGKILL');
        return reject(Error('synthetic_http_server_identity_invalid'));
      }
      settled=true;clearTimeout(timeout);
      resolve({child,port:x.port});
    });
    child.stderr.on('data',c=>{err+=String(c);if(err.length>2000)child.kill('SIGKILL')});
    child.on('error',e=>{if(!settled){settled=true;clearTimeout(timeout);reject(e)}});
    child.on('exit',()=>{
      if(!settled){settled=true;clearTimeout(timeout);reject(Error('synthetic_http_server_exited_early'))}
    });
  });
}
const closeServer=async server=>{
  if(!server)return;
  if(server.child.exitCode!==null)return;
  await new Promise(resolve=>{
    const killTimeout=setTimeout(()=>{server.child.kill('SIGKILL');resolve()},1300);
    server.child.once('exit',()=>{clearTimeout(killTimeout);resolve()});
    server.child.kill('SIGTERM');
  });
};
async function pool(list,max,fn){
  const result=new Array(list.length);
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(list.length,max)},async()=>{
    while(cursor<list.length){
      const i=cursor++;result[i]=await fn(list[i]);
    }
  }));
  return result;
}
export async function runSabanSyntheticHttpGauntlet({concurrency=4}={}){
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>8){
    throw Error('bounded_http_concurrency_required');
  }
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-saban-http-'));
  fs.chmodSync(dir,0o700);
  const token=randomBytes(32).toString('hex');
  let server=null;
  let workers=0,restarts=0;
  const resultRows=[];
  const call=async(role,{key,orderId,rail}={})=>{
    workers++;
    const env={
      PATH:process.env.PATH||'/usr/bin:/bin',HOME:dir,
      NODE_ENV:'test',EVERCRAFT_SYNTHETIC_HTTP_TOKEN:token
    };
    const receipt=await launch(CLIENT,[role,String(server.port),
      String(key||'-'),String(orderId||'-'),String(rail||'-')],
    {cwd:dir,env});
    if(receipt.code!==0||receipt.data.status!=='completed'){
      throw Error('saban_http_'+role+'_failed:'+String(receipt.data.reason||'unknown'));
    }
    resultRows.push({role,status:'completed'});
    return receipt.data.result;
  };
  try{
    server=await startServer({dir,token});
    const key='sample-intent-'+randomUUID();
    const first=await call('create',{key});
    const invoice=await call('invoice',{orderId:first.order_id});
    if(invoice.amount_cents!==1900||invoice.payment_destination!==null){
      throw Error('invoice_funds_or_amount_violation');
    }
    const chosen=await call('select',{orderId:first.order_id,rail:'bank_transfer'});
    if(!chosen.selected)throw Error('buyer_method_not_selected');
    await call('claim',{orderId:first.order_id});
    await call('attack',{orderId:first.order_id});
    await call('unauthorized',{orderId:first.order_id});
    const replay=await call('replay',{key,orderId:first.order_id});
    if(replay.duplicate_orders_created!==false)throw Error('idempotency_disproved');
    const audit=await call('audit',{orderId:first.order_id});
    if(audit.version!==3||audit.payment_state!=='unpaid')throw Error('audit_lineage_incorrect');

    const railCases=await pool(RAILS,concurrency,async rail=>{
      const k='synthetic-rail-'+rail+'-'+randomUUID();
      const created=await call('create',{key:k});
      await call('invoice',{orderId:created.order_id});
      const selected=await call('select',{orderId:created.order_id,rail});
      if(!selected.selected||selected.rail!==rail)throw Error('rail_method_mismatch');
      const after=await call('audit',{orderId:created.order_id});
      if(after.version!==2||after.rail!==rail)throw Error('rail_reconciliation_failed');
      return {rail,synthetic_http_passed:true,actual_settlement_verified:false};
    });

    const race=await call('create',{key:'synthetic-race-'+randomUUID()});
    const rawEnv={
      PATH:process.env.PATH||'/usr/bin:/bin',HOME:dir,
      NODE_ENV:'test',EVERCRAFT_SYNTHETIC_HTTP_TOKEN:token
    };
    const contest=await Promise.all(['bank_transfer','paypal_business'].map(rail=>
      launch(CLIENT,['select',String(server.port),'-',race.order_id,rail],
      {cwd:dir,env:rawEnv})
    ));
    workers+=2;
    const winners=contest.filter(x=>x.code===0&&x.data.result?.selected===true);
    const rejected=contest.filter(x=>x.code===0&&x.data.result?.rejected_conflict===true);
    if(winners.length!==1||rejected.length!==1)throw Error('http_concurrent_rail_cas_failed');
    resultRows.push({role:'concurrent_cas',status:'completed'});
    const raceAudit=await call('audit',{orderId:race.order_id});
    if(raceAudit.version!==2)throw Error('http_order_concurrent_version_wrong');

    // Restart the HTTP process, not the ledger. A fresh process must recover
    // identical order and invoice state, including deterministic idempotency.
    await closeServer(server);server=await startServer({dir,token});restarts++;
    const reopened=await call('audit',{orderId:first.order_id});
    if(reopened.version!==3||reopened.payment_state!=='unpaid'){
      throw Error('restart_order_not_durable');
    }
    await call('replay',{key,orderId:first.order_id});

    const roles=['create','invoice','select','claim','attack','unauthorized','replay','audit','concurrent_cas'];
    const quality=evaluateSwarmQuality({
      contract:{quality:{minimum_completion_ratio:1,
        dead_letter_allowed:false,require_all_roles:true,enforcement:'fail_closed'}},
      plan:{roles,logical_agents:resultRows.length},
      results:resultRows,
      schedulerSummary:{total:resultRows.length,counts:{
        completed:resultRows.length,dead_letter:0
      }}
    });
    if(quality.status!=='pass')throw Error('http_saban_quality_gate_failed');
    return {
      schema:'evercraft.saban.payments-synthetic-http-gauntlet.v1',
      status:'pass',
      transport:'real_http_loopback_only',
      host:'127.0.0.1',
      physical_nodes_proven:1,
      independent_http_client_processes_launched:workers,
      http_server_process_restarts:restarts,
      simulated_invoice_price_cents:1900,
      rails:railCases,
      concurrency:{contenders:2,committed:1,conflicted:1,final_version:2},
      replay_idempotence_verified:true,
      customer_claim_never_paid:true,
      unauthenticated_access_rejected:true,
      unauthorized_money_operations_rejected:true,
      merchant_payment_destinations_shared:false,
      real_payment_provider_requests:0,
      actual_money_processed:false,
      external_settlement_verified:false,
      public_checkout_verified:false,
      fulfillment_released:false,
      quality:{status:quality.status,completion_ratio:quality.completion_ratio,
        missing_roles:quality.missing_roles,dead_letter:quality.dead_letter},
      next_gate:'authenticated_real_invoice_service_and_verified_business_rail_configuration'
    };
  }finally{
    await closeServer(server);
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const args=process.argv.slice(2);
    if(args.length>2||args.some(a=>!['--json','--concurrency=2','--concurrency=4','--concurrency=8'].includes(a))){
      throw Error('usage: payments-synthetic-http-gauntlet.mjs --json --concurrency=4');
    }
    const option=args.find(a=>a.startsWith('--concurrency='));
    console.log(JSON.stringify(await runSabanSyntheticHttpGauntlet({
      concurrency:option?Number(option.split('=')[1]):4
    }),null,2));
  }catch(e){
    console.error(JSON.stringify({status:'fail',
      reason:String(e?.message||'gauntlet_error').slice(0,130),
      real_payment_requests:0}));
    process.exitCode=1;
  }
}
