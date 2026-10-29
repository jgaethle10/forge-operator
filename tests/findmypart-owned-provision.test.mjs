import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {normalizeEnv,insertSettings} from '../scripts/provision-findmypart-owned-intake.mjs';

const script=fileURLToPath(new URL('../scripts/provision-findmypart-owned-intake.mjs',import.meta.url));
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'fmp-provision-test-'));

test('installer merges unrelated Fabric environment safely and idempotently',()=>{
 const original='# Evercraft edge\nEVERCRAFT_EDGE_NODE_RECEIPT=/opt/receipt\nEVERCRAFT_PUBLIC_ORIGIN=https://fabric.systemiacommandcenters.com\n';
 const params={EVERCRAFT_FINDMYPART_LEADS_DIR:'/var/lib/evercraft/findmypart-leads',
  EVERCRAFT_FINDMYPART_INTAKE_KEY_B64:Buffer.alloc(32,4).toString('base64')};
 const first=insertSettings(original,params);
 const second=insertSettings(first,params);
 assert.equal(first,second);
 const parsed=normalizeEnv(first);
 assert.equal(parsed.settings.get('EVERCRAFT_EDGE_NODE_RECEIPT'),'/opt/receipt');
 assert.equal(parsed.settings.get('EVERCRAFT_PUBLIC_ORIGIN'),'https://fabric.systemiacommandcenters.com');
 assert.equal(parsed.settings.get('EVERCRAFT_FINDMYPART_LEADS_DIR'),params.EVERCRAFT_FINDMYPART_LEADS_DIR);
 assert.equal(parsed.settings.get('EVERCRAFT_FINDMYPART_INTAKE_KEY_B64'),params.EVERCRAFT_FINDMYPART_INTAKE_KEY_B64);
 assert.equal(first.split('EVERCRAFT_FINDMYPART_INTAKE_KEY_B64=').length,2);
});
test('refuses duplicate/malformed settings and newline injection',()=>{
 assert.throws(()=>normalizeEnv('EVERCRAFT_A=1\nEVERCRAFT_A=2\n'),/duplicate/);
 assert.throws(()=>normalizeEnv('injected line'),/malformed/);
 assert.throws(()=>insertSettings('KEEP=1\n',{SAFE:'hello\nUNSAFE=1'}),/setting_value_invalid/);
 assert.throws(()=>insertSettings('KEEP=1\n',{'../UNSAFE':'x'}),/setting_key_invalid/);
});
test('read-only inspection uses service identity without printing key or modifying disk',()=>{
 const dir=temp();
 try{
  const bin=path.join(dir,'bin');fs.mkdirSync(bin);
  const systemctl=path.join(bin,'systemctl');
  fs.writeFileSync(systemctl,'#!/bin/sh\nif [ "$1" = "show" ]; then printf "evercraft\\n"; exit 0; fi\nexit 99\n',{mode:0o755});
  const envPath=path.join(dir,'fabric.env');
  const key=Buffer.alloc(32,17).toString('base64');
  fs.writeFileSync(envPath,'EXISTING_ENV=keep\nEVERCRAFT_FINDMYPART_INTAKE_KEY_B64='+key+'\n');
  const before=fs.readFileSync(envPath,'utf8');
  const out=execFileSync(process.execPath,[script],{
   env:{...process.env,PATH:bin+':'+process.env.PATH,
    FMP_SETUP_ENV_PATH:envPath,FMP_SETUP_STORE_PATH:path.join(dir,'leads'),
    FMP_SETUP_SERVICE:'evercraft-fabric.service'},
   encoding:'utf8',
  });
  const report=JSON.parse(out);
  assert.equal(report.state,'inspection_only');
  assert.equal(report.key_configured,true);
  assert.equal(report.payment_ready,false);
  assert.equal(report.paid_settlement_verified,false);
  assert.doesNotMatch(out,new RegExp(key));
  assert.doesNotMatch(out,/EXISTING_ENV=keep/);
  assert.equal(fs.readFileSync(envPath,'utf8'),before);
  assert.equal(fs.existsSync(path.join(dir,'leads')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('operator script rejects unsolicited network target or malformed owner',()=>{
 const dir=temp();
 try{
  const bin=path.join(dir,'bin');fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin,'systemctl'),'#!/bin/sh\nprintf "evercraft\\n"\n',{mode:0o755});
  const envPath=path.join(dir,'fabric.env');fs.writeFileSync(envPath,'KEEP=1\n');
  const env={...process.env,PATH:bin+':'+process.env.PATH,FMP_SETUP_ENV_PATH:envPath,
    FMP_SETUP_STORE_PATH:path.join(dir,'leads'),FMP_SETUP_LOCAL_URL:'http://external.example:8787/findmypart/'};
  assert.throws(()=>execFileSync(process.execPath,[script],{env,stdio:'pipe'}));
  const env2={...env,FMP_SETUP_LOCAL_URL:'http://127.0.0.1:8787/findmypart/'};
  assert.throws(()=>execFileSync(process.execPath,[script,'--owner-principal','owner\nINJECT=secret'],{env:env2,stdio:'pipe'}));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
