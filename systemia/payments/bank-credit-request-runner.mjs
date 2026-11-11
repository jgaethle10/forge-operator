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
process.stdout.write(JSON.stringify({ok:true,url:instance.url,bank_credit_configured:instance.health().bank_credit_configured,approved_offer_count:instance.health().approved_offer_count})+'\n');
const stop=async()=>{await instance.close();process.exit(0)};
process.on('SIGTERM',stop);
process.on('SIGINT',stop);
