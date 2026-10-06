#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Resolver, resolveNs } from 'node:dns/promises';
import { evaluateDomainControl, makeChallenge } from '../infra/evercraft-edge/dns/domain-control.mjs';

function arg(name,fallback=''){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?String(process.argv[i+1]):fallback;
}
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const domain=arg('--domain','systemiacommandcenters.com').toLowerCase().replace(/\.$/,'');
const out=arg('--out',`artifacts/domain-control/${domain}-latest.json`);
const nonce=arg('--nonce',randomBytes(18).toString('hex'));
const challengeRecord=makeChallenge(domain,nonce);
const apiKey=String(process.env.IONOS_API_KEY||'').trim();

function writeReceipt(body){
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(body,null,2)+'\n');
  process.stdout.write(JSON.stringify(body,null,2)+'\n');
}
if(!apiKey){
  writeReceipt({
    schema:'evercraft.ionos-domain-control-challenge.v1',
    domain,
    state:'blocked_missing_ionos_api_key',
    verified:false,
    edge_eligible:false,
    challenge_name:challengeRecord.name,
    secret_material_exposed:false,
    observed_at:new Date().toISOString(),
  });
  process.exit(2);
}

const upsert=spawnSync(process.execPath,[
  new URL('./ionos-dns-upsert.mjs',import.meta.url).pathname,
  '--zone',domain,
  '--name',challengeRecord.name,
  '--type','TXT',
  '--content',challengeRecord.value,
  '--ttl','60',
],{encoding:'utf8',env:process.env});
if(upsert.status!==0){
  writeReceipt({
    schema:'evercraft.ionos-domain-control-challenge.v1',
    domain,
    state:'ionos_mutation_failed',
    verified:false,
    edge_eligible:false,
    challenge_name:challengeRecord.name,
    error:String(upsert.stderr||upsert.stdout||'ionos_upsert_failed').slice(0,2000),
    secret_material_exposed:false,
    observed_at:new Date().toISOString(),
  });
  process.exit(3);
}
let mutationReceipt=null;
try{ mutationReceipt=JSON.parse(upsert.stdout||'{}'); }catch{}

async function txtFrom(server){
  const resolver=new Resolver();
  resolver.setServers([server]);
  const rows=await resolver.resolveTxt(challengeRecord.name);
  return rows.map(parts=>parts.join(''));
}
async function waitForTxt(server){
  let lastError='';
  for(let attempt=1;attempt<=15;attempt++){
    try{
      const values=await txtFrom(server);
      if(values.includes(challengeRecord.value)) return {server,values,attempt};
      lastError='expected_value_not_visible';
    }catch(error){
      lastError=String(error?.code||error?.message||error);
    }
    await sleep(4000);
  }
  return {server,values:[],attempt:15,error:lastError};
}

const parentNs=(await resolveNs(domain)).map(x=>String(x).toLowerCase().replace(/\.$/,'')).sort();
const verifierServers=['1.1.1.1','8.8.8.8'];
const observations=await Promise.all(verifierServers.map(waitForTxt));
const exactSeen=observations.every(row=>row.values.includes(challengeRecord.value));
const controlValues=observations.flatMap(row=>row.values.filter(v=>v.startsWith('evercraft-domain-control=')));
const uniqueValues=[...new Set(controlValues)];
const tokenUnique=exactSeen&&uniqueValues.length===1&&uniqueValues[0]===challengeRecord.value;
const control=evaluateDomainControl({
  domain,
  registrarEvidence:{state:'verified_api'},
  dnsObservation:{
    parent_ns:parentNs,
    authoritative_reachable:exactSeen&&parentNs.length>=2,
  },
  challenge:{verified:exactSeen,token_unique:tokenUnique},
});
const receipt={
  schema:'evercraft.ionos-domain-control-challenge.v1',
  domain,
  state:control.state,
  verified:control.state==='verified',
  edge_eligible:control.edge_eligible===true,
  challenge_name:challengeRecord.name,
  challenge_value:challengeRecord.value,
  parent_ns:parentNs,
  registrar_provider:'IONOS',
  mutation_action:mutationReceipt?.action||null,
  mutation_record_id:mutationReceipt?.record_id||null,
  external_verifiers:observations,
  token_unique:tokenUnique,
  domain_control_receipt:control,
  secret_material_exposed:false,
  observed_at:new Date().toISOString(),
};
writeReceipt(receipt);
if(!receipt.verified) process.exitCode=4;
