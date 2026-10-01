#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const matrix=JSON.parse(fs.readFileSync(
  path.join(root,'systemia/migrations/base44-exit/wave-1-replacement-matrix.json'),'utf8'
));
const estate=JSON.parse(fs.readFileSync(
  path.join(root,'systemia/migrations/base44-exit/estate-snapshot.json'),'utf8'
));

assert.equal(matrix.schema,'evercraft.base44.wave-replacement-matrix.v1');
assert.equal(matrix.wave,1);

const queue=estate.queue.filter((row)=>Number(row.wave)===1).map((row)=>row.product).sort();
const products=matrix.products.map((row)=>row.product).sort();
assert.deepEqual(products,queue);
assert.equal(matrix.products.length,5);
assert.equal(matrix.products.some((row)=>row.cutover_ready===true),false);

let implementationCount=0;
for(const product of matrix.products){
  assert.ok(product.components.length>0);
  assert.ok(product.components.some((row)=>row.key==='destination_data'));
  assert.ok(product.components.some((row)=>row.key==='public_cutover'));

  for(const component of product.components){
    if(component.state==='implementation_present_ci_pending'){
      implementationCount+=1;
      assert.ok(Array.isArray(component.refs)&&component.refs.length>0);
      for(const ref of component.refs){
        assert.equal(fs.existsSync(path.join(root,ref)),true,product.product+' missing '+ref);
      }
    }
  }
}
assert.equal(matrix.summary.implementations_present_ci_pending,implementationCount);
assert.equal(matrix.summary.products_cutover_ready,0);
assert.equal(matrix.summary.destination_data_migrated_products,0);
assert.equal(matrix.summary.public_cutovers_authorized,0);

for(const key of ['source_mutation','provider_reauthorization','payment_creation','traffic_cutover','source_decommission']){
  assert.equal(matrix.authority[key],false);
}

console.log(JSON.stringify({
  schema:'evercraft.base44.wave-replacement-matrix-proof.v1',
  status:'pass',
  wave:1,
  products:matrix.products.length,
  implementations_present_ci_pending:implementationCount,
  source_refs_exist:true,
  destination_data_migrated_products:0,
  cutover_ready_products:0,
  traffic_cutover_authority:false,
  source_decommission_authority:false
}));
