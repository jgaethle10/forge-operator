import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runCommercialSourceProof} from '../systemia/organism/kaidance-commercial-source-proof.mjs';
const at=new Date('2026-11-26T20:40:00Z');
test('one allowlisted commercial proof per tick, rotates failures, holds repeats and excludes secrets',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-commercial-proof-'));
 try{
  const root=path.join(dir,'repo'),outDir=path.join(dir,'state');
  fs.mkdirSync(path.join(root,'tests'),{recursive:true});
  for(const f of ['eps-email-quote-route','legacy-rescue-lab-discovery','ibmi-rescue-discovery','website-audit-mobile-buyer-first','faie-intelligence-studio'])
   fs.writeFileSync(path.join(root,'tests',f+'.test.mjs'),'// fixture');
  const calls=[];
  const spawn=(bin,args,opts)=>{calls.push(args);assert.deepEqual(Object.keys(opts.env).sort(),['LANG','PATH']);assert.equal(opts.timeout,30000);return {status:calls.length===2?1:0}};
  const run=(n,enabled=true)=>runCommercialSourceProof({root,outDir,now:new Date(+at+n*300000),enabled,spawn});
  assert.equal(run(0,false).status,'not_enabled');
  const a=run(0);assert.equal(a.family,'eps');assert.equal(a.status,'passed');assert.equal(a.payment_verified,false);
  assert.equal(run(0).status,'duplicate_or_interrupted');assert.equal(calls.length,1);
  assert.equal(run(1).status,'failed');assert.equal(run(2).family,'website-audit');assert.equal(run(3).family,'faie');
  assert.equal(run(4).status,'cooldown');assert.equal(calls.length,4);
  assert.throws(()=>run(-1),/rollback/);
  assert.equal(fs.statSync(path.join(outDir,'latest.json')).mode&0o777,0o600);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('missing source and symlink fail closed without executing or changing authority',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-commercial-missing-'));
 try{
  const outDir=path.join(dir,'state'),root=path.join(dir,'repo');fs.mkdirSync(root);
  const spawn=()=>{throw Error('unexpected')};
  const r=runCommercialSourceProof({root,outDir,now:at,enabled:true,spawn});
  assert.equal(r.status,'missing_source');assert.equal(r.executed,false);assert.equal(r.outreach_authorized,false);
  const link=path.join(dir,'link');fs.symlinkSync(outDir,link);
  assert.throws(()=>runCommercialSourceProof({root,outDir:link,now:at,enabled:true,spawn}),/private_path/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
