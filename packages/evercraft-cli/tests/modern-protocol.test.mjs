import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {mcpStdio} from '../cli.mjs';
import {modernParams,checkModernDiscover,MODERN_VERSION} from '../modern-protocol.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const fixture=resolve(here,'fixtures/modern-math-server.mjs');
const cli=resolve(here,'../cli.mjs');
const tool={id:'modern.math',name:'Strict 2026 MCP fixture',transport:'mcp-stdio',command:process.execPath,args:[fixture]};

test('metadata adds the 2026 protocol without mutating caller input',()=>{
 const input={name:'sum',arguments:{a:2,b:5}};
 const result=modernParams(input);
 assert.equal(result._meta['io.modelcontextprotocol/protocolVersion'],MODERN_VERSION);
 assert.deepEqual(result.arguments,{a:2,b:5});
 assert.equal(Object.hasOwn(input,'_meta'),false);
 assert.throws(()=>modernParams({_meta:{evil:true}}),/Reserved/);
});
test('discovery requires exactly advertised modern protocol and tools support',()=>{
 const good={supportedVersions:[MODERN_VERSION],capabilities:{tools:{}},_meta:{'io.modelcontextprotocol/serverInfo':{name:'fixture',version:'1'}}};
 assert.equal(checkModernDiscover(good).serverInfo.name,'fixture');
 assert.throws(()=>checkModernDiscover({...good,supportedVersions:['2025-11-25']}),/did not advertise/);
 assert.throws(()=>checkModernDiscover({...good,capabilities:{resources:{}}}),/tool capability/);
});
test('MCP 2026-only server responds to explicit modern probe',async()=>{
 const response=await mcpStdio(tool,'probe',undefined,{}, {protocol:'modern'});
 assert.equal(response.protocolEra,'modern');
 assert.equal(response.protocolVersion,MODERN_VERSION);
 assert.equal(response.serverInfo.name,'Modern math fixture');
 assert.equal(response.tools[0].name,'sum');
});
test('modern tool/call carries metadata on every request',async()=>{
 const result=await mcpStdio(tool,'call','sum',{a:2,b:5},{protocol:'modern'});
 assert.equal(result.result.content[0].text,'7');
});
test('legacy default fails closed on modern-only fixture',async()=>{
 await assert.rejects(()=>mcpStdio(tool,'probe'),/MCP error|exited|limit/);
});
test('command line --protocol modern is opt in and still demands --run',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'evercraft-modern-'));
 const env={...process.env,XDG_CONFIG_HOME:dir};
 const run=(...args)=>spawnSync(process.execPath,[cli,...args],{env,encoding:'utf8',timeout:8000});
 try{
   const filename=resolve(dir,'server.json');
   writeFileSync(filename,JSON.stringify(tool));
   assert.equal(run('tool','add',filename).status,0);
   const blocked=run('tool','probe','modern.math','--protocol','modern');
   assert.equal(blocked.status,1);
   assert.match(blocked.stderr,/requires --run/);
   const probe=run('tool','probe','modern.math','--protocol','modern','--run');
   assert.equal(probe.status,0,probe.stderr);
   assert.equal(JSON.parse(probe.stdout).protocolEra,'modern');
   const blockedCall=run('tool','call','modern.math','sum','--input','{"a":2,"b":5}','--protocol','modern');
   assert.equal(blockedCall.status,1);
   assert.match(blockedCall.stderr,/requires --approve/);
   const approved=run('tool','call','modern.math','sum','--input','{"a":2,"b":5}','--protocol','modern','--approve');
   assert.equal(approved.status,0,approved.stderr);
   assert.equal(JSON.parse(approved.stdout).result.content[0].text,'7');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
