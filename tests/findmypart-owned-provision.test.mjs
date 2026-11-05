import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {normalizeEnv,insertSettings,waitForFindMyPartService,ensurePrivateIntakeDirectory} from '../scripts/provision-findmypart-owned-intake.mjs';
import {createServer} from 'node:http';

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

test('setup tolerates startup delay but never calls a payment or creates a lead',async(t)=>{
 let pageCalls=0,readinessCalls=0;
 const server=createServer((req,res)=>{
  if(req.url==='/findmypart/'){
   pageCalls++;
   if(pageCalls<3){res.writeHead(503);res.end('starting');return}
   res.writeHead(200,{'content-type':'text/html'});
   res.end('<title>FindMyPart</title><form id="part-request-form"></form><script src="/findmypart/app.mjs"></script>');
   return;
  }
  if(req.url==='/api/findmypart/readiness'){
   readinessCalls++;
   res.writeHead(200,{'content-type':'application/json'});
   res.end(JSON.stringify({schema:'evercraft.findmypart.intake-readiness.v1',
    intake_available:true,payment_ready:false,payment_verified:false}));
   return;
  }
  res.writeHead(500);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port+'/findmypart/';
 const result=await waitForFindMyPartService(url,{attempts:8,delayMs:5});
 assert.deepEqual(result,{ok:true,proof:'local_buyer_page_and_private_intake'});
 assert.equal(pageCalls,3);
 assert.equal(readinessCalls,1);
});

test('private intake with no writable/ready notification route fails closed',async(t)=>{
 const server=createServer((req,res)=>{
  if(req.url==='/findmypart/'){
   res.writeHead(200,{'content-type':'text/html'});
   res.end('<title>FindMyPart</title><form id="part-request-form"></form><script src="/findmypart/app.mjs"></script>');
  }else{
   res.writeHead(200,{'content-type':'application/json'});
   res.end(JSON.stringify({schema:'evercraft.findmypart.intake-readiness.v1',
    intake_available:false,payment_ready:false,payment_verified:false}));
  }
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port+'/findmypart/';
 const result=await waitForFindMyPartService(url,{attempts:2,delayMs:5});
 assert.deepEqual(result,{ok:false,reason:'private_intake_not_ready'});
 assert.deepEqual(await waitForFindMyPartService(url,{attempts:1,requireIntake:false}),
  {ok:true,proof:'local_buyer_page'});
});
test('private child folder does not alter unsafe existing directories or symbolic links',()=>{
 const root=temp();const uid=process.getuid(),gid=process.getgid();
 try{
  fs.mkdirSync(path.join(root,'alert-outbox'),{mode:0o700});
  ensurePrivateIntakeDirectory(root,'alert-outbox',uid,gid);
  assert.equal(fs.statSync(path.join(root,'alert-outbox')).mode&0o077,0);
  fs.mkdirSync(path.join(root,'alert-receipts'),{mode:0o755});
  assert.throws(()=>ensurePrivateIntakeDirectory(root,'alert-receipts',uid,gid),
   /private_child_directory_unsafe/);
  assert.throws(()=>ensurePrivateIntakeDirectory(root,'../../bad',uid,gid),
   /invalid_private_child/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
