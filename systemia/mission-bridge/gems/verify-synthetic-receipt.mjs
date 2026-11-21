#!/usr/bin/env node
// Independent consumer of a *synthetic only* GitHub Actions research receipt.
// Verifies the serialized artifact, rather than trusting producer console output.
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const file='artifacts/systemia-mission-bridge/gems-synthetic-research-smoke.json';
const digest=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
function verify(receipt){
 if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))throw Error('receipt_invalid');
 const {receipt_sha256,...body}=receipt;
 if(receipt_sha256!==digest(body))throw Error('receipt_digest_mismatch');
 if(body.schema!=='evercraft.gems.synthetic-compute-receipt.v1'||
    body.state!=='computed_synthetic_fixture_only')throw Error('receipt_wrong_schema_or_state');
 for(const [key,required] of Object.entries({
  real_gems_dataset_used:false,drivendata_submission_made:false,
  production_runtime_touched:false,external_network_called:false,
  official_dti_claimed:false,paid_compute_charged:false
 })){
  if(body[key]!==required)throw Error('receipt_safety_flag_mismatch:'+key);
 }
 if(body.inputs?.fixture!=='synthetic-fixed-v1'||body.inputs?.width!==48||
  body.inputs?.height!==48||body.results?.length!==2)
   throw Error('receipt_fixture_invalid');
 const names=body.results.map(v=>v.variant);
 if(JSON.stringify(names)!==JSON.stringify(['unlabeled-as-negative','exclude-near-unlabeled']))
  throw Error('receipt_variant_set_invalid');
 for(const row of body.results){
  if(!Number.isFinite(row.heldout?.f1)||row.heldout.f1<0||row.heldout.f1>1||
     !Number.isFinite(row.heldout?.precision)||!Number.isFinite(row.heldout?.recall)||
     row.train_positive_count<=0||row.train_negative_count<=0)
     throw Error('receipt_metric_invalid');
 }
 return {schema:'evercraft.gems.synthetic-receipt-verification.v1',
  verified:true,receipt_sha256,official_dti_claimed:false,
  fixture:'synthetic-fixed-v1',variants:names};
}
export {verify};
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const receipt=JSON.parse(fs.readFileSync(file,'utf8'));
 process.stdout.write(JSON.stringify(verify(receipt))+'\n');
}
