import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRegistry } from './inspect-official-mcp-registry.mjs';
const meta={'io.modelcontextprotocol.registry/official':{status:'active',isLatest:true}};
function entry(name,version,remotes=[]){return {server:{name,version,remotes},_meta:meta};}
test('records matching Evercraft namespace entries and ignores unrelated namespaces',()=>{
  const result=summarizeRegistry([{servers:[
    entry('io.github.jgaethle10/evercraft-machine-commerce','1.5.1',[{type:'streamable-http',url:'https://fabric.systemiacommandcenters.com/mcp'}]),
    entry('io.github.another/vendor','1.0.0')
  ]}]);
  assert.equal(result.servers.length,1);
  assert.equal(result.servers[0].version,'1.5.1');
  assert.equal(result.servers[0].publisher_claim_verified,false);
  assert.deepEqual(result.findings,[]);
});
test('flags historical Base44 remote without rewriting claimed transport',()=>{
  const result=summarizeRegistry([{servers:[entry('io.github.jgaethle10/forensiscope','1.1.5',
    [{type:'streamable-http',url:'https://evercraft-ai-suite-08c4d2b8.base44.app/mcp'}])]}]);
  assert.deepEqual(result.findings,[{name:'io.github.jgaethle10/forensiscope',issue:'LEGACY_BASE44_REMOTE'}]);
});
test('rejects unavailable, empty or malformed registry payloads',()=>{
  assert.throws(()=>summarizeRegistry([]),/no_registry_pages/);
  assert.throws(()=>summarizeRegistry([{servers:[]}]),/no_evercraft_registry_entries_observed/);
  assert.throws(()=>summarizeRegistry([{bad:true}]),/invalid_registry_response/);
});
test('rejects conflicting latest versions to avoid false green',()=>{
  assert.throws(()=>summarizeRegistry([{servers:[
    entry('io.github.jgaethle10/evercraft-clip','0.2.0'),
    entry('io.github.jgaethle10/evercraft-clip','0.2.1')
  ]}]),/duplicate_latest_version_conflict/);
});
