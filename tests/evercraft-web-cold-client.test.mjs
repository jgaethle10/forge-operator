import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const script=new URL('../scripts/evercraft-web-cold-client-canary.mjs',import.meta.url).pathname;
function check(url,secret){
  const directory=mkdtempSync(join(tmpdir(),'evercraft-web-cold-canary-'));
  const file=join(directory,'report.json');
  try{
    const run=spawnSync(process.execPath,[script],{timeout:7000,encoding:'utf8',
      env:{...process.env,EVERCRAFT_WEB_PUBLIC_MCP_URL:url,
        EVERCRAFT_WEB_TEST_TOKEN:secret,EVERCRAFT_WEB_CANARY_OUTPUT:file}});
    const report=JSON.parse(readFileSync(file,'utf8'));
    return {run,report};
  }finally{rmSync(directory,{recursive:true,force:true});}
}
test('cold client fails closed when not configured',()=>{
  const {run,report}=check('','test-private-secret');
  assert.equal(run.status,1);
  assert.equal(report.production_fetch_accepted,false);
});
test('legacy Base44 endpoint is never considered an owned production endpoint',()=>{
  const secret='must-not-appear-in-log-or-report';
  const {run,report}=check('https://base44.app/mcp',secret);
  assert.equal(run.status,1);
  assert.equal(report.production_fetch_accepted,false);
  assert.equal(report.checks[0].passed,false);
  assert.ok(!(run.stdout+JSON.stringify(report)).includes(secret));
});
test('URL credentials rejected before network egress',()=>{
  const {run,report}=check('https://owned.example/mcp?token=leak','private-secret');
  assert.equal(run.status,1);
  assert.equal(report.production_fetch_accepted,false);
  assert.ok(report.checks.some(x=>x.name==='no_credentials_in_url'&&x.passed===false));
});
