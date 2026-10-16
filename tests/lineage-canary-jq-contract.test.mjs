import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const jqAvailable=spawnSync('jq',['--version'],{encoding:'utf8'}).status===0;
const cap=JSON.parse(fs.readFileSync(new URL('../public/chum/capabilities/lineage-founding-pilot-v1/capability.json',import.meta.url),'utf8'));
const workflow=fs.readFileSync(new URL('../.github/workflows/lineage-public-fabric-canary.yml',import.meta.url),'utf8');
const filter=fileURLToPath(new URL('../scripts/lineage-public-contract.jq',import.meta.url));
const run=x=>spawnSync('jq',['-e','--arg','url','https://fabric.systemiacommandcenters.com/capabilities/lineage-founding-pilot-v1','-f',filter],{input:JSON.stringify(x),encoding:'utf8'});
test('lineage public JSON passes its real jq workflow predicate',{skip:!jqAvailable},()=>{
 const r=run(cap);
 assert.equal(r.error,undefined,String(r.error));
 assert.equal(r.status,0,r.stderr||r.stdout);
 assert.equal(r.stdout.trim(),'true');
 assert.ok(workflow.includes('jq -e --arg url "$page_url" -f scripts/lineage-public-contract.jq'));
});
test('hold public commercial status and restricted paid authority are not misreported',{skip:!jqAvailable},()=>{
 const mutations=[
  {entry_paid_offer:{...cap.entry_paid_offer,price_usd:1500}},
  {public_url:'https://fake.example/checkout'},
  {commercial_state:'sell_now'},
  {machine_state:'paid_verified'},
  {authority_rule:'Open discovery grants automatic payment.'},
  {authority_rule:null},
  {public_id:'not-lineage'}
 ];
 for(const m of mutations){
  const r=run({...cap,...m});
  assert.equal(r.status,1,JSON.stringify(m));
  assert.equal(r.stdout.trim(),'false');
 }
});
test('jq checks reject partial/missing payload, never infer checkout from page existence',{skip:!jqAvailable},()=>{
 const r=run({public_id:cap.public_id});
 assert.equal(r.status,1);
 assert.equal(r.stdout.trim(),'false');
});

test('workflow uses parenthesized dedicated jq predicate even without local jq',()=>{
 const filterText=fs.readFileSync(filter,'utf8');
 assert.match(filterText,/\(\(\.authority_rule \/\/ ""\) \| contains\("Checkout creation is not proof of payment"\)\)/);
 assert.match(workflow,/jq -e --arg url "\$page_url" -f scripts\/lineage-public-contract\.jq/);
});
