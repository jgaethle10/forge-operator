// Read-only inventory reconciliation. No runtime, customer or dispatch access.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
export function reconcile(products,lanes,candidates){
 const keys=new Set(products.map(p=>p.product_key));
 if(keys.size!==products.length||keys.has(undefined))throw Error('invalid_product_inventory');
 const named=new Set(lanes.flatMap(l=>l.products||[]));
 const groupKeys=new Set(), covered=new Set();
 const groups=candidates.groups.map(g=>{
  if(groupKeys.has(g.key)||!g.key||!g.next||!g.gate||!g.existing_missions?.length)throw Error('invalid_candidate_group');
  groupKeys.add(g.key);
  for(const key of g.products){if(!keys.has(key))throw Error('unknown_candidate_product:'+key);covered.add(key);}
  return {key:g.key,priority:g.priority,status:g.status,existing_missions:g.existing_missions,
   named:g.products.filter(k=>named.has(k)),without_named_binding:g.products.filter(k=>!named.has(k)),next:g.next};
 });
 const sorted=x=>[...x].sort();
 return {schema:'evercraft.ecosystem-convergence.review.v1',scope:'source_registry_only_not_runtime_liveness',
  registered:keys.size,named:products.filter(p=>named.has(p.product_key)).length,
  without_named_binding:sorted([...keys].filter(k=>!named.has(k))),
  unclassified:sorted([...keys].filter(k=>!covered.has(k))),groups,
  execution_authorized:false,publication_authorized:false,new_scheduler:false};
}
function selfTest(){
 const p=['a','b','c'].map(product_key=>({product_key})),l=[{products:['a']}];
 const g={key:'test',priority:'P0',status:'candidate',products:['a','b'],next:'verify',gate:'hold',existing_missions:[1]};
 const r=reconcile(p,l,{groups:[g]});
 assert.deepEqual(r.without_named_binding,['b','c']);assert.deepEqual(r.unclassified,['c']);
 assert.deepEqual(r.groups[0].named,['a']);assert.equal(r.execution_authorized,false);
 assert.throws(()=>reconcile(p,l,{groups:[{...g,products:['missing']}]}));
 assert.throws(()=>reconcile(p,l,{groups:[g,g]}));
 console.log('CONVERGENCE_FIXTURES=PASS');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]==='--self-test')selfTest();
 else{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
  console.log(JSON.stringify(reconcile(read('registry/public-products.json').products,
   read('registry/kaidance-company-lanes.v1.json').lanes,
   read('research/ecosystem-convergence/candidates.v1.json')),null,2));
 }
}
