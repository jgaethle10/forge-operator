#!/usr/bin/env node
/**
 * Run Evercraft's owned ACH-credit invoice endpoint on loopback behind the
 * separately approved first-party public edge.
 *
 * Private configuration MUST remain outside Git and public build directories.
 * It contains a merchant operator token, HMAC key and the actual recipient
 * bank instructions. This runner never logs any of those values.
 */
import fs from 'node:fs';
import path from 'node:path';
import {startBankCreditRequestRuntime} from './bank-credit-request-runtime.mjs';
import {startBankCreditPublicGateway} from './bank-credit-public-gateway.mjs';

const privateConfig=String(process.env.EVERCRAFT_BANK_CREDIT_PRIVATE_CONFIG||'').trim();
if(!privateConfig)throw Error('private_bank_credit_config_path_required');
const file=path.resolve(privateConfig);
const stat=fs.lstatSync(file);
if(!stat.isFile()||(stat.mode&0o077)!==0)throw Error('private_bank_credit_config_permissions_invalid');
if(fs.realpathSync(file)!==file)throw Error('private_bank_credit_config_symlink_forbidden');
const cfg=JSON.parse(fs.readFileSync(file,'utf8'));
if(cfg.schema!=='evercraft.payments.bank-credit-private-config.v1'||
  cfg.current_state!=='BANK_ACCOUNT_AND_TERMS_APPROVED')
 throw Error('private_bank_credit_config_not_approved');
const instance=await startBankCreditRequestRuntime({
 host:'127.0.0.1',
 port:Number(process.env.EVERCRAFT_BANK_CREDIT_LOOPBACK_PORT||8795),
 storeDir:String(process.env.EVERCRAFT_BANK_CREDIT_PRIVATE_STATE||'').trim(),
 publicOrigin:String(process.env.EVERCRAFT_BANK_CREDIT_PUBLIC_ORIGIN||'https://fabric.systemiacommandcenters.com'),
 operatorToken:cfg.operator_token,linkSigningKey:cfg.link_signing_key,
 approvedOffers:cfg.approved_offers||[],bankPayee:cfg.bank_payee||null,
});
// Never start the public gateway with a fake or unapproved receiving account.
if(!instance.health().bank_credit_configured||instance.health().approved_offer_count<1){
 await instance.close();
 throw Error('bank_credit_launch_conditions_missing');
}
let publicGateway;
try{
 publicGateway=await startBankCreditPublicGateway({
  host:'127.0.0.1',
  port:Number(process.env.EVERCRAFT_BANK_CREDIT_PUBLIC_LOOPBACK_PORT||8796),
  privateRuntimeUrl:instance.url,
 });
}catch(error){
 await instance.close();
 throw error;
}
process.stdout.write(JSON.stringify({
 ok:true,
 state:'STARTED_LOCAL_ONLY_NOT_PUBLICLY_VERIFIED',
 operator_loopback:instance.url,
 public_buyer_loopback:publicGateway.url,
 bank_credit_configured:instance.health().bank_credit_configured,
 approved_offer_count:instance.health().approved_offer_count,
 actual_bank_deposit_verified:false,
})+'\n');
let stopping=false;
const stop=async()=>{
 if(stopping)return;
 stopping=true;
 await publicGateway.close();
 await instance.close();
};
process.on('SIGTERM',()=>{void stop().catch(()=>{process.exitCode=1})});
process.on('SIGINT',()=>{void stop().catch(()=>{process.exitCode=1})});
