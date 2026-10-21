#!/usr/bin/env node
/**
 * TEST ONLY. Used by the Saban merchant-rail CAS regression to demonstrate
 * simultaneous independent OS-process writes are serialized.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readMerchantRailCandidates,nominateMerchantRail,saveMerchantRailCandidates} from './merchant-rail-readiness.mjs';

export async function runMerchantRailRaceWorker({file,rail,barrier}={}){
  if(process.env.EVERCRAFT_PAYMENTS_TEST_ONLY!=='1')throw Error('test_worker_not_authorized');
  const root=fs.realpathSync(os.tmpdir());
  const dir=path.dirname(String(file||''));
  if(!path.isAbsolute(file)||!dir.startsWith(root+path.sep+'evercraft-rail-readiness-')||
     path.basename(file)!=='merchant.json'||!fs.lstatSync(dir).isDirectory()||
     (fs.lstatSync(dir).mode&0o077)!==0||barrier!==path.join(dir,'go')){
    throw Error('test_only_private_registry_required');
  }
  if(!['bank_transfer','paypal_business'].includes(rail))throw Error('unknown_race_rail');
  const old=readMerchantRailCandidates({file});
  const updated=nominateMerchantRail(old,{rail,ownerConfirmed:true});
  fs.writeFileSync(path.join(dir,'ready-'+rail),'ready',{flag:'wx',mode:0o600});
  // Both candidate revisions were calculated from exactly the same snapshot.
  const limit=Date.now()+5000;
  while(!fs.existsSync(barrier)){
    if(Date.now()>limit)throw Error('race_barrier_timeout');
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  try{
    const result=saveMerchantRailCandidates(updated,{file});
    return {role:'candidate_writer',rail,result:'committed',version:result.version};
  }catch(e){
    if(['merchant_rail_registry_write_locked','merchant_rail_revision_or_overwrite_rejected'].includes(e?.message)){
      return {role:'candidate_writer',rail,result:'conflicted',reason:e.message};
    }
    throw e;
  }
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{
    const [file,rail,barrier]=process.argv.slice(2);
    console.log(JSON.stringify(await runMerchantRailRaceWorker({file,rail,barrier})));
  }catch(e){
    console.error(JSON.stringify({result:'blocked',reason:String(e?.message||'worker_failed').slice(0,95)}));
    process.exitCode=1;
  }
}
