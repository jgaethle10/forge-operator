import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mcpStdio,validateManifest} from '../cli.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const fixture=path.join(here,'fixtures/math-server.mjs');
const cli=path.resolve(here,'../cli.mjs');
const manifest={id:'sample.math',name:'Synthetic Math MCP',transport:'mcp-stdio',command:process.execPath,args:[fixture]};
function invoke(env,args){return spawnSync(process.execPath,[cli,...args],{env,encoding:'utf8',timeout:8000});}

test('manifest is structured and cannot request remote or shell transports',()=>{
  assert.equal(validateManifest(manifest).id,manifest.id);
  assert.throws(()=>validateManifest({...manifest,transport:'remote-http'}),/mcp-stdio/);
  assert.throws(()=>validateManifest({...manifest,id:'../etc/passwd'}),/Invalid id/);
  assert.throws(()=>validateManifest({...manifest,command:'node\nrm'}),/Invalid program/);
  assert.throws(()=>validateManifest({...manifest,args:['okay',null]}),/Invalid args/);
});
test('probe performs a genuine MCP stdio handshake and enumerates tools',async()=>{
  const result=await mcpStdio(manifest,'probe');
  assert.equal(result.status,'local_probe_succeeded');
  assert.equal(result.tools[0].name,'sum');
  assert.equal(result.serverInfo.name,'Local math fixture');
});
test('explicit invocation returns a real result',async()=>{
  const result=await mcpStdio(manifest,'call','sum',{a:2,b:5});
  assert.equal(result.status,'tool_returned');
  assert.equal(result.result.content[0].text,'7');
});
test('calling an unadvertised tool is rejected',async()=>{
  await assert.rejects(()=>mcpStdio(manifest,'call','not-advertised',{}),/not advertised/);
});
test('registration, inspection, and removal are explicit and confined to isolated XDG config',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-cli-'));
  const env={...process.env,XDG_CONFIG_HOME:temp};
  try{
    const file=path.join(temp,'tool.json');fs.writeFileSync(file,JSON.stringify(manifest));
    const added=invoke(env,['tool','add',file]);
    assert.equal(added.status,0,added.stderr);
    assert.equal(JSON.parse(added.stdout).executed,false);
    const stored=path.join(temp,'evercraft','operator-tools.json');
    assert.equal(fs.existsSync(stored),true);
    if(process.platform!=='win32')assert.equal(fs.statSync(stored).mode & 0o077,0);
    const dupe=invoke(env,['tool','add',file]);
    assert.equal(dupe.status,1);assert.match(dupe.stderr,/Duplicate/);
    assert.equal(JSON.parse(invoke(env,['tool','list']).stdout)[0].id,manifest.id);
    assert.equal(JSON.parse(invoke(env,['tool','inspect',manifest.id]).stdout).transport,'mcp-stdio');
    const withoutRun=invoke(env,['tool','probe',manifest.id]);
    assert.equal(withoutRun.status,1);assert.match(withoutRun.stderr,/requires --run/);
    const withoutApproval=invoke(env,['tool','call',manifest.id,'sum','--input','{"a":2,"b":5}']);
    assert.equal(withoutApproval.status,1);assert.match(withoutApproval.stderr,/requires --approve/);
    assert.equal(JSON.parse(invoke(env,['tool','remove',manifest.id]).stdout).executableDeleted,false);
    assert.deepEqual(JSON.parse(invoke(env,['tool','list']).stdout),[]);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
