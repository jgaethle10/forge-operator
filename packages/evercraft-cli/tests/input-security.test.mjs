import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const cli=path.resolve(here,'../cli.mjs');
const math=path.join(here,'fixtures/math-server.mjs');
const synthetic='SYNTHETIC_TEST_SECRET_20261014_DO_NOT_LOG';

function workspace(callback){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-safe-input-'));
  const env={...process.env,XDG_CONFIG_HOME:temp};
  const invoke=(argv,stdin)=>spawnSync(process.execPath,[cli,...argv],{
    env,cwd:temp,encoding:'utf8',timeout:9000,
    ...(stdin===undefined?{}:{input:stdin})
  });
  try{return callback({temp,invoke});}
  finally{fs.rmSync(temp,{recursive:true,force:true});}
}
function register(temp,invoke,server){
  const file=path.join(temp,'manifest.json');
  fs.writeFileSync(file,JSON.stringify({
    id:'sample.safe',name:'Local synthetic MCP',transport:'mcp-stdio',
    command:process.execPath,args:[server]
  }));
  const response=invoke(['tool','add',file]);
  assert.equal(response.status,0,response.stderr);
}

test('piped JSON call succeeds with explicit approval and does not echo raw input',()=>{
  workspace(({temp,invoke})=>{
    register(temp,invoke,math);
    const denied=invoke(['tool','call','sample.safe','sum','--input-stdin'],'{"a":2,"b":5}');
    assert.equal(denied.status,1);
    assert.match(denied.stderr,/requires --approve/);
    const passed=invoke(['tool','call','sample.safe','sum','--input-stdin','--approve'],'{"a":2,"b":5}');
    assert.equal(passed.status,0,passed.stderr);
    assert.equal(JSON.parse(passed.stdout).result.content[0].text,'7');
    assert.match(passed.stderr,/input omitted from logs/);
    assert.doesNotMatch(passed.stderr,/"a":2/);
    const both=invoke(['tool','call','sample.safe','sum','--input-stdin','--input','{}','--approve'],'{}');
    assert.equal(both.status,1);
    assert.match(both.stderr,/exactly one|Usage/);
    const huge=invoke(['tool','call','sample.safe','sum','--input-stdin','--approve'],JSON.stringify({payload:'x'.repeat(65536)}));
    assert.equal(huge.status,1);
    assert.match(huge.stderr,/64 KiB/);
    const invalid=invoke(['tool','call','sample.safe','sum','--input-stdin','--approve'],'[]');
    assert.equal(invalid.status,1);
    assert.match(invalid.stderr,/JSON object/);
  });
});

test('untrusted MCP error and stderr cannot echo synthetic sensitive tool input',()=>{
  workspace(({temp,invoke})=>{
    const server=path.join(temp,'untrusted-server.mjs');
    const fixture=[
      "import readline from 'node:readline';",
      "const lines=readline.createInterface({input:process.stdin});",
      "for await(const line of lines){",
      " const msg=JSON.parse(line);",
      " if(msg.method==='notifications/initialized')continue;",
      " let result;",
      " if(msg.method==='initialize')result={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'Synthetic untrusted server'}};",
      " else if(msg.method==='tools/list')result={tools:[{name:'unsafe',description:'Synthetic test only',inputSchema:{type:'object'}}]};",
      " else if(msg.method==='tools/call'){",
      "  process.stderr.write(JSON.stringify(msg.params.arguments)+'\\n');",
      "  if(msg.params.arguments.failType==='exit')process.exit(7);",
      "  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,error:{code:-32000,message:JSON.stringify(msg.params.arguments)}})+'\\n');",
      "  continue;",
      " }else result={};",
      " process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,result})+'\\n');",
      "}"
    ].join('\n');
    fs.writeFileSync(server,fixture);
    register(temp,invoke,server);
    for(const failType of ['rpc','exit']){
      const input=JSON.stringify({secret:synthetic,failType});
      const result=invoke(['tool','call','sample.safe','unsafe','--input-stdin','--approve'],input);
      assert.equal(result.status,1,result.stderr);
      assert.doesNotMatch(result.stderr, /SYNTHETIC_TEST_SECRET_20261014_DO_NOT_LOG/);
      assert.doesNotMatch(result.stdout, /SYNTHETIC_TEST_SECRET_20261014_DO_NOT_LOG/);
      assert.match(result.stderr,/suppressed/);
    }
  });
});
