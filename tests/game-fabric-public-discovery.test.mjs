import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const sources=[
  ['registry/catalog.json','catalog'],
  ['registry/public-products.json','public graph'],
  ['public/.well-known/evercraft-products.json','discovery directory'],
  ['conformance/products.json','conformance']
];
const records=sources.map(([name,label])=>{
  const items=read(name).products;
  const result=items.filter(x=>x.product_key==='game-fabric');
  assert.equal(result.length,1,'exactly one Game Fabric record in '+label);
  return result[0];
});
for(const item of records){
  assert.equal(item.name,'Game Fabric');
  assert.match(item.canonical_url,/^https:\/\/github\.com\/jgaethle10\/forge-operator\/tree\/main\/registry\/game-fabric$/);
}
const [catalog,graph,directory,conformance]=records;
assert.equal(catalog.mode,'discovery_only');
assert.equal(graph.invocation.mode,'discovery_only');
assert.equal(graph.invocation.url,null);
assert.equal(directory.human_confirmation_required,false);
assert.equal(conformance.provider_behavior_state,'not_run');
assert.match(conformance.conformance_state,/not_provider_verified/);
assert.ok(directory.intents.some(x=>/football play call/.test(x)));
assert.ok(directory.intents.some(x=>/soccer/.test(x)));
assert.ok(directory.boundaries.some(x=>/nonfootball sport-specific classrooms are research-stage/.test(x)));
assert.ok(directory.boundaries.some(x=>/no private team film/.test(x)));
assert.ok(directory.boundaries.some(x=>/no paid pilot/.test(x)));
const guide=fs.readFileSync(path.join(root,'registry/game-fabric/README.md'),'utf8');
const llms=fs.readFileSync(path.join(root,'registry/game-fabric/llms.txt'),'utf8');
for(const phrase of ['not calibrated','synthetic','not verified']){
 assert.match((guide+'\n'+llms).toLowerCase(),new RegExp(phrase));
}
assert.match(guide,/Playbook Classroom/);
assert.match(guide,/Multisport pilot research/);
assert.doesNotMatch(llms,/verified live MCP endpoint/i);
console.log('GAME_FABRIC_DISCOVERY_CONTRACT_PASS',sources.length,'registries');
