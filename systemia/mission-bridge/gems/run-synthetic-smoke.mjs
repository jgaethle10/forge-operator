#!/usr/bin/env node
// GitHub Actions synthetic fixture execution only. No competition data.
// This is NOT callable from public chat or from a GEMS mission request.
import fs from 'node:fs';
import path from 'node:path';
import {runSyntheticGemsResearchSmoke} from './synthetic-research-worker.mjs';
if(process.argv.length!==2){
  console.error('synthetic_runner_takes_no_arguments');
  process.exit(2);
}
const receipt=runSyntheticGemsResearchSmoke();
const out=path.resolve('artifacts/systemia-mission-bridge/gems-synthetic-research-smoke.json');
fs.mkdirSync(path.dirname(out),{recursive:true,mode:0o700});
fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
process.stdout.write(JSON.stringify({
  state:receipt.state,receipt_sha256:receipt.receipt_sha256,
  variants:receipt.results.map(x=>({variant:x.variant,
    synthetic_f1:x.heldout.f1})),
  real_gems_dataset_used:false,official_dti_claimed:false,
  receipt_path:'artifacts/systemia-mission-bridge/gems-synthetic-research-smoke.json'
})+'\n');
