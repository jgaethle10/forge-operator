#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildUniversalFulfillmentPlan } from './universal-product-fulfillment.mjs';

function safeKey(value) {
  return String(value || 'fulfillment')
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,160) || 'fulfillment';
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive:true });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}

export function routeVerifiedPayment({
  payment,
  publicId,
  stateRoot = 'state/fulfillment',
  now = new Date()
} = {}) {
  const plan = buildUniversalFulfillmentPlan({ payment, publicId, now });
  if (!plan.authorized) {
    return {
      schema:'evercraft.product-fulfillment.route-receipt.v1',
      admitted:false,
      state:'blocked_payment_authority',
      reasons:plan.reasons,
      public_id:plan.public_id,
      generated_at:plan.generated_at
    };
  }

  const file = path.resolve(stateRoot, safeKey(plan.fulfillment_key) + '.json');
  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file,'utf8'));
    return {
      schema:'evercraft.product-fulfillment.route-receipt.v1',
      admitted:true,
      duplicate_suppressed:true,
      fulfillment_key:plan.fulfillment_key,
      public_id:plan.public_id,
      state_file:file,
      state:existing.state,
      generated_at:new Date(now).toISOString()
    };
  }

  const state = {
    schema:'evercraft.product-fulfillment.state.v1',
    fulfillment_key:plan.fulfillment_key,
    mission_key:plan.mission_key,
    public_id:plan.public_id,
    product_name:plan.product_name,
    state:'intake_required',
    revision:1,
    created_at:new Date(now).toISOString(),
    updated_at:new Date(now).toISOString(),
    payment:plan.payment,
    intake_required:plan.intake_required,
    promised_deliverables:plan.promised_deliverables,
    qa_contract:plan.qa_contract,
    team:plan.team,
    authority:plan.authority,
    tasks:plan.tasks,
    evidence_refs:[
      plan.payment.evidence_ref,
      'fulfillment-contract:evercraft.product-fulfillment.v1',
      'registry:systemia/organism/product-fulfillment-registry.json'
    ].filter(Boolean),
    completion_receipt:null
  };
  atomicJson(file, state);

  return {
    schema:'evercraft.product-fulfillment.route-receipt.v1',
    admitted:true,
    duplicate_suppressed:false,
    fulfillment_key:plan.fulfillment_key,
    public_id:plan.public_id,
    product_name:plan.product_name,
    state:'intake_required',
    state_file:file,
    next_work_key:'intake-scope-lock',
    team:plan.team,
    authority:plan.authority,
    generated_at:new Date(now).toISOString()
  };
}

function parseArgs(argv) {
  const out={payment:null,stateRoot:'state/fulfillment'};
  for(let i=0;i<argv.length;i+=1){
    if(argv[i]==='--payment') out.payment=argv[++i];
    else if(argv[i]==='--state-root') out.stateRoot=argv[++i];
  }
  return out;
}

async function main() {
  const args=parseArgs(process.argv.slice(2));
  if(!args.payment) throw new Error('--payment <json file> is required');
  const payment=JSON.parse(fs.readFileSync(path.resolve(args.payment),'utf8'));
  const receipt=routeVerifiedPayment({payment,stateRoot:args.stateRoot,now:new Date()});
  console.log(JSON.stringify(receipt,null,2));
  if(!receipt.admitted) process.exitCode=2;
}

if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  await main();
}
