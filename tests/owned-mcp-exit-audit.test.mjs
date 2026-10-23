import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateActiveInstallDoors,inventoryRegistryDebt,checkPublication,OWNED_UNIVERSAL} from '../scripts/audit-owned-mcp-exit.mjs';

test('existing supported installation manifests and guides now point only to owned universal Fabric MCP',()=>{
 const result=validateActiveInstallDoors();
 assert.equal(result.state,'OWNED_INSTALL_DOORS_PASS',JSON.stringify(result.failures));
 assert.equal(result.checked.length,6);
 assert.equal(result.internal_owned_mcp_only,true);
 assert.equal(result.registry_directory_repoint_proven,false);
});

test('detect original legacy provider URLs in a connector and in public installation guidance',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'evercraft-owned-installs-'));
 try{
  mkdirSync(path.join(root,'test'),{recursive:true});
  writeFileSync(path.join(root,'test/mcp.json'),JSON.stringify({
   mcpServers:{legacy:{url:'https://historical.base44.app/functions/route'}}
  }));
  writeFileSync(path.join(root,'test/guide.md'),
   'Install: '+OWNED_UNIVERSAL+' or https://historical.base44.app/functions/route');
  const result=validateActiveInstallDoors({
   root,manifests:['test/mcp.json'],guides:['test/guide.md']
  });
  assert.equal(result.state,'BLOCKED');
  assert.deepEqual(result.failures.map(x=>x.issue).sort(),[
   'legacy_host_advertised_in_install_guide','not_exact_owned_universal_mcp'
  ]);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('specialist registry debt remains reported, not falsely recorded as migrated',()=>{
 const summary=inventoryRegistryDebt();
 assert.equal(summary.source_missing,false);
 assert.ok(summary.manifest_count>=1);
 assert.ok(summary.legacy_manifest_count>=1);
 assert.ok(summary.legacy.some(x=>x.file==='mcp-registry/findmypart.json'));
 assert.equal(summary.caveat.includes('exact tool parity'),true);
});

test('publishing an old specialist route is denied, even with explicit approval',()=>{
 const actual=checkPublication({manifest:'mcp/evercraft-web/server.json'});
 assert.equal(actual.state,'BLOCKED');
 assert.ok(/legacy/.test(actual.reason));
 const other=checkPublication({manifest:'mcp-registry/findmypart.json'});
 assert.equal(other.state,'BLOCKED');
});

test('owned universal registry manifest may pass source syntax but never imply provider publication',()=>{
 const v=checkPublication({manifest:'mcp-registry/evercraft-machine-commerce.json'});
 assert.equal(v.state,'ROUTE_SOURCE_ONLY_PASS');
 assert.equal(v.verified_tool_contract,false);
 assert.equal(v.registry_repointed,false);
 assert.equal(v.actual_publication_authorized,false);
});

test('path and content tampering fail closed',()=>{
 assert.equal(checkPublication({manifest:'../secrets.json'}).state,'BLOCKED');
 assert.equal(checkPublication({manifest:'mcp-registry/no-such.json'}).state,'BLOCKED');
 const root=mkdtempSync(path.join(tmpdir(),'evercraft-guard-'));
 try{
  mkdirSync(path.join(root,'mcp-registry'),{recursive:true});
  writeFileSync(path.join(root,'mcp-registry/x.json'),
   JSON.stringify({name:'test',remotes:[{url:'http://untrusted.example/mcp'}]}));
  assert.equal(checkPublication({root,manifest:'mcp-registry/x.json'}).reason,'publication_https_required');
 }finally{rmSync(root,{recursive:true,force:true})}
});
