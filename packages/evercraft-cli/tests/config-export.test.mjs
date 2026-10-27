import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const cli=resolve(dirname(fileURLToPath(import.meta.url)),'../cli.mjs');
const invoke=(env,...args)=>spawnSync(process.execPath,[cli,...args],{env,encoding:'utf8',timeout:5000});
test('export gives compatible portable and VS Code config without running or installing tools',()=>{
 const dir=mkdtempSync(join(tmpdir(),'evercraft-tool-export-'));
 const env={...process.env,XDG_CONFIG_HOME:dir};
 const manifest={id:'builder.math',name:'Partner-owned test MCP',transport:'mcp-stdio',
  command:'/approved/absolute/path/to/node',args:['/some/example/math-server.mjs']};
 try{
   const file=join(dir,'manifest.json');
   writeFileSync(file,JSON.stringify(manifest));
   const registered=invoke(env,'tool','add',file);
   assert.equal(registered.status,0,registered.stderr);
   const storedFile=join(dir,'evercraft','operator-tools.json');
   const old=readFileSync(storedFile,'utf8');
   const oldTime=statSync(storedFile).mtimeMs;
   const portable=invoke(env,'tool','export',manifest.id,'--format','portable');
   assert.equal(portable.status,0,portable.stderr);
   assert.equal(portable.stderr,'');
   assert.deepEqual(JSON.parse(portable.stdout),{mcpServers:{'builder.math':{command:manifest.command,args:manifest.args}}});
   const vscode=invoke(env,'tool','export',manifest.id,'--format','vscode');
   assert.equal(vscode.status,0,vscode.stderr);
   assert.deepEqual(JSON.parse(vscode.stdout),{servers:{'builder.math':{type:'stdio',command:manifest.command,args:manifest.args}}});
   assert.equal(readFileSync(storedFile,'utf8'),old);
   assert.equal(statSync(storedFile).mtimeMs,oldTime);
   const unknown=invoke(env,'tool','export',manifest.id,'--format','bogus');
   assert.equal(unknown.status,1);
   assert.match(unknown.stderr,/portable\|vscode/);
   const extra=invoke(env,'tool','export',manifest.id,'--format','portable','--run');
   assert.equal(extra.status,1);
   assert.match(extra.stderr,/only tool ID/);
   assert.equal(readFileSync(storedFile,'utf8'),old);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
