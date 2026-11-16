import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {checkBankCreditStagingConfig,runBankCreditPreflight} from '../systemia/payments/bank-credit-preflight.mjs';

const valid={
 schema:'evercraft.payments.bank-credit-private-config.v1',
 current_state:'BANK_ACCOUNT_AND_TERMS_APPROVED',
 operator_token:'operator-synthetic-secret-1234567890987654321',
 link_signing_key:'hmac-synthetic-secret-xyz9876543210987654321',
 approved_offers:[{offer_key:'asset-diagnosis-149',product_key:'asset-diagnosis',
   name:'Asset Diagnosis',amount_cents:14900,currency:'usd',owner_approved:true}],
 bank_payee:{
   receiving_account_confirmed:true,legal_name:'Evercraft Synthetic Only',
   bank_name:'Example Fixture Bank',routing_number:'021000021',
   account_number:'000012345678',account_type:'business_checking',
   bank_confirmation_ref:'synthetic-test-reference-1',
 },
};
test('redacted config inspection never equates approved staging with live bank processing',()=>{
 const r=checkBankCreditStagingConfig(valid);
 assert.equal(r.local_staging_config_ready,true);
 assert.equal(r.state,'LOCAL_STAGING_ONLY');
 assert.equal(r.commercial_release_allowed,false);
 assert.equal(r.bank_record_independently_authenticated,false);
 assert.equal(r.actual_ach_credit_verified,false);
 assert.equal(r.public_https_path_verified,false);
 assert.equal(r.operator_api_exposure_tested,false);
 assert.equal(r.holds.length,0);
 const output=JSON.stringify(r);
 for(const sensitive of [valid.operator_token,valid.link_signing_key,
   valid.bank_payee.account_number,valid.bank_payee.routing_number,
   valid.bank_payee.legal_name]){
  assert.equal(output.includes(sensitive),false);
 }
});
test('held, duplicate, unapproved, malformed and missing account config block staging',()=>{
 const held={...valid,current_state:'HELD_BANK_CONFIRMATION_REQUIRED',
  approved_offers:[],bank_payee:null};
 let r=checkBankCreditStagingConfig(held);
 assert.equal(r.local_staging_config_ready,false);
 assert.ok(r.holds.includes('BANK_AND_TERMS_NOT_APPROVED'));
 assert.ok(r.holds.includes('RECEIVING_BANK_CONFIGURATION_NOT_CONFIRMED'));
 assert.ok(r.holds.includes('APPROVED_EXACT_PRICE_OFFERS_MISSING_OR_INVALID'));
 const dup={...valid,approved_offers:[valid.approved_offers[0],valid.approved_offers[0]]};
 assert.equal(checkBankCreditStagingConfig(dup).local_staging_config_ready,false);
 const reused={...valid,link_signing_key:valid.operator_token};
 assert.equal(checkBankCreditStagingConfig(reused).local_staging_config_ready,false);
 const wrong={...valid,approved_offers:[{...valid.approved_offers[0],amount_cents:1}]};
 assert.equal(checkBankCreditStagingConfig(wrong).local_staging_config_ready,false);
 assert.equal(checkBankCreditStagingConfig(null).local_staging_config_ready,false);
});
test('preflight audits permissions and path boundaries without writing or revealing private data',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'evercraft-credit-preflight-'));
 const repo=path.join(base,'repo'),state=path.join(base,'state'),
  privateDir=path.join(base,'private'),
  file=path.join(privateDir,'bank-credit-private.json');
 await fs.mkdir(repo,{mode:0o700});
 await fs.mkdir(state,{mode:0o700});
 await fs.mkdir(privateDir,{mode:0o700});
 await fs.writeFile(file,JSON.stringify(valid),{mode:0o600});
 try{
  const before=await fs.readFile(file,'utf8');
  const result=await runBankCreditPreflight({configPath:file,stateDir:state,repoRoot:repo});
  assert.equal(result.state,'LOCAL_STAGING_ONLY');
  assert.equal(result.local_staging_config_ready,true);
  assert.equal(result.commercial_release_allowed,false);
  assert.deepEqual(result.holds,[]);
  assert.equal(await fs.readFile(file,'utf8'),before);
  const redacted=JSON.stringify(result);
  assert.equal(redacted.includes(valid.bank_payee.account_number),false);
  assert.equal(redacted.includes(valid.operator_token),false);
  assert.equal(redacted.includes(file),false);
  await fs.chmod(file,0o644);
  const unsafe=await runBankCreditPreflight({configPath:file,stateDir:state,repoRoot:repo});
  assert.equal(unsafe.local_staging_config_ready,false);
  assert.ok(unsafe.holds.includes('PRIVATE_CONFIG_FILE_MISSING_OR_INSECURE'));
  await fs.chmod(file,0o600);
  await fs.chmod(state,0o755);
  const exposedStore=await runBankCreditPreflight({configPath:file,stateDir:state,repoRoot:repo});
  assert.ok(exposedStore.holds.includes('PRIVATE_ORDER_STORE_MISSING_OR_INSECURE'));
  await fs.chmod(state,0o700);
  const link=path.join(base,'linked-private.json');
  await fs.symlink(file,link);
  const symlink=await runBankCreditPreflight({configPath:link,stateDir:state,repoRoot:repo});
  assert.ok(symlink.holds.includes('PRIVATE_CONFIG_FILE_MISSING_OR_INSECURE'));
  const inside=path.join(repo,'bank-credit-private.json');
  await fs.writeFile(inside,JSON.stringify(valid),{mode:0o600});
  const inRepo=await runBankCreditPreflight({configPath:inside,stateDir:state,repoRoot:repo});
  assert.ok(inRepo.holds.includes('PRIVATE_CONFIG_FILE_MISSING_OR_INSECURE'));
 }finally{await fs.rm(base,{recursive:true,force:true})}
});
