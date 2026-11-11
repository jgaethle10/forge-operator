import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeHeldBankCreditConfig} from '../systemia/payments/bank-credit-bootstrap.mjs';

test('private bootstrap creates 0600 held config with distinct secret keys and no bank details',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'evercraft-bootstrap-'));
 const parent=path.join(base,'evercraft-private');const file=path.join(parent,'bank-credit-private.json');
 try{
  const result=await initializeHeldBankCreditConfig(file,{repoRoot:path.join(base,'different-repo')});
  assert.equal(result.ok,true);
  assert.equal(result.checkout_live,false);
  assert.equal(result.payment_received,false);
  assert.doesNotMatch(JSON.stringify(result),/operator_token|link_signing_key|routing_number/);
  const stat=await fs.stat(file);
  assert.equal(stat.mode&0o777,0o600);
  const parentStat=await fs.stat(parent);
  assert.equal(parentStat.mode&0o777,0o700);
  const cfg=JSON.parse(await fs.readFile(file,'utf8'));
  assert.equal(cfg.current_state,'HELD_BANK_CONFIRMATION_REQUIRED');
  assert.equal(cfg.approved_offers.length,0);
  assert.equal(cfg.bank_payee,null);
  assert.ok(cfg.operator_token.length>=32);
  assert.ok(cfg.link_signing_key.length>=32);
  assert.notEqual(cfg.operator_token,cfg.link_signing_key);
  assert.equal(cfg.bank_payee?.account_number,undefined);
  await assert.rejects(()=>initializeHeldBankCreditConfig(file,{repoRoot:path.join(base,'different-repo')}),{code:'EEXIST'});
 }finally{await fs.rm(base,{recursive:true,force:true})}
});
test('rejects checkout setup secrets inside repo and through symlink',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'evercraft-bootstrap-safety-'));
 const repo=path.join(base,'repo'), privateDir=path.join(base,'private'),
  link=path.join(base,'redirect');
 await fs.mkdir(repo);await fs.mkdir(privateDir,{mode:0o700});await fs.symlink(privateDir,link);
 try{
  await assert.rejects(()=>initializeHeldBankCreditConfig(path.join(repo,'bank-credit-private.json'),{repoRoot:repo}),/inside_repository/);
  await assert.rejects(()=>initializeHeldBankCreditConfig('bank-credit-private.json',{repoRoot:repo}),/absolute_private/);
  await assert.rejects(()=>initializeHeldBankCreditConfig(path.join(link,'bank-credit-private.json'),{repoRoot:repo}),/symlink_directory/);
  await assert.rejects(()=>initializeHeldBankCreditConfig(path.join(privateDir,'incorrect.json'),{repoRoot:repo}),/expected_private_config_filename/);
 }finally{await fs.rm(base,{recursive:true,force:true})}
});
