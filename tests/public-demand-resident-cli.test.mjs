import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../systemia/revenue-desk/public-demand-document-cycle.mjs',import.meta.url));
const flags={qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
const sha=x=>createHash('sha256').update(x).digest('hex');
test('actual resident CLI idle browser-enabled replay terminates without a browser or network',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'demand-cli-idle-'));
 try{
  const inbox=path.join(root,'document-inbox.json'),receipts=path.join(root,'source-refresh-receipts');
  fs.mkdirSync(receipts,{mode:0o700});
  fs.writeFileSync(inbox,JSON.stringify({schema:'evercraft.public-demand.document-inbox.v1',captures:[]}),{mode:0o600});
  const slot=Math.floor(Date.now()/21600000);
  // Seed both sides of a slot boundary; no actual browser exists.
  for(const n of [slot,slot+1]){
   const source_key=['yvl','susta'][n%2];
   const attempt=JSON.stringify({schema:'evercraft.public-demand.source-refresh-attempt.v1',slot:n,source_key,...flags});
   fs.writeFileSync(path.join(receipts,'slot-'+n+'.attempt.json'),attempt,{mode:0o600});
   fs.writeFileSync(path.join(receipts,'slot-'+n+'.json'),JSON.stringify({schema:'evercraft.public-demand.source-refresh-receipt.v1',slot:n,source_key,attempt_sha256:sha(attempt),state:'no_new_solicitation_pointers',added:0,...flags}),{mode:0o600});
  }
  const before=fs.readdirSync(receipts).sort();
  const run=spawnSync(process.execPath,[cli,'--root',root,'--inbox',inbox,'--browser-source',path.join(root,'absent-browser'),'--browser-cache',path.join(root,'absent-cache')],{encoding:'utf8',timeout:15000});
  assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr);
  const r=JSON.parse(run.stdout);
  assert.equal(r.state,'idle');assert.equal(r.source_refresh.state,'not_due');assert.equal(r.source_refresh.send_performed,false);
  assert.deepEqual(fs.readdirSync(receipts).sort(),before);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
