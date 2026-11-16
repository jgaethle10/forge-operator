#!/usr/bin/env node
/**
 * Evercraft Payments | PRIVATE local bank-credit staging preflight.
 *
 * This is a read-only diagnostic. Never prints bank numbers, shared secrets,
 * operator credentials, link signatures, customer details, or the private file.
 * Passing this check is NOT authorization to publish a payment service or
 * confirmation that the merchant bank account exists.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validBankCreditPayee} from './bank-credit-request-runtime.mjs';

const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
const offerKey=/^[a-z0-9][a-z0-9._:-]{2,119}$/i;
const inside=(dir,base)=>dir===base||dir.startsWith(base+path.sep);
const privatePermissions=(stat)=>((stat.mode&0o077)===0);

export function checkBankCreditStagingConfig(config){
 const holds=[];
 if(config?.schema!=='evercraft.payments.bank-credit-private-config.v1')
  holds.push('PRIVATE_CONFIG_SCHEMA_INVALID');
 if(config?.current_state!=='BANK_ACCOUNT_AND_TERMS_APPROVED')
  holds.push('BANK_AND_TERMS_NOT_APPROVED');
 if(typeof config?.operator_token!=='string'||Buffer.byteLength(config.operator_token)<32||
    typeof config?.link_signing_key!=='string'||Buffer.byteLength(config.link_signing_key)<32||
    config?.operator_token===config?.link_signing_key)
  holds.push('PRIVATE_KEYS_MISSING_OR_REUSED');
 if(!validBankCreditPayee(config?.bank_payee))
  holds.push('RECEIVING_BANK_CONFIGURATION_NOT_CONFIRMED');
 const offers=config?.approved_offers;
 if(!Array.isArray(offers)||offers.length===0||offers.length>100||
   offers.some(x=>!x||!offerKey.test(x.offer_key||'')||
    !offerKey.test(x.product_key||'')||
    typeof x.name!=='string'||x.name.length<4||x.name.length>160||
    !Number.isSafeInteger(x.amount_cents)||x.amount_cents<100||
    x.amount_cents>10_000_000||x.currency!=='usd'||
    x.owner_approved!==true)||
   (Array.isArray(offers)&&new Set(offers.map(x=>x?.offer_key)).size!==offers.length))
  holds.push('APPROVED_EXACT_PRICE_OFFERS_MISSING_OR_INVALID');
 return {
  schema:'evercraft.payments.bank-credit-staging-preflight.v1',
  state:holds.length?'HELD':'LOCAL_STAGING_ONLY',
  local_staging_config_ready:holds.length===0,
  bank_record_independently_authenticated:false,
  public_https_path_verified:false,
  operator_api_exposure_tested:false,
  actual_ach_credit_verified:false,
  commercial_release_allowed:false,
  private_data_logged:false,
  holds,
 };
}

async function localPrivatePath(p,{type,root}){
 if(typeof p!=='string'||!path.isAbsolute(p))return false;
 const abs=path.resolve(p);
 if(abs===path.parse(abs).root||inside(abs,root))return false;
 try{
  const stat=await fs.lstat(abs);
  if(stat.isSymbolicLink()||!privatePermissions(stat)||
      (type==='file'?!stat.isFile():!stat.isDirectory()))return false;
  return await fs.realpath(abs)===abs;
 }catch{return false}
}

export async function runBankCreditPreflight({configPath,stateDir,repoRoot=sourceRoot}={}){
 const root=path.resolve(repoRoot);
 const privateConfigFile=await localPrivatePath(configPath,{type:'file',root});
 const privateStore=await localPrivatePath(stateDir,{type:'directory',root});
 const hold=[];
 if(!privateConfigFile)hold.push('PRIVATE_CONFIG_FILE_MISSING_OR_INSECURE');
 if(!privateStore)hold.push('PRIVATE_ORDER_STORE_MISSING_OR_INSECURE');
 let configuration;
 if(privateConfigFile){
  try{
   configuration=JSON.parse(await fs.readFile(configPath,'utf8'));
  }catch{hold.push('PRIVATE_CONFIG_UNREADABLE_OR_INVALID_JSON')}
 }
 const report=checkBankCreditStagingConfig(configuration);
 const allHolds=[...new Set([...hold,...report.holds])];
 return {...report,
  state:allHolds.length?'HELD':'LOCAL_STAGING_ONLY',
  local_staging_config_ready:allHolds.length===0,
  holds:allHolds,
  recommendation:allHolds.length
   ?'Keep the public gateway closed. Fix private local prerequisites; do not share banking details in chat or source control.'
   :'Local configuration is eligible for further manual review only. Verify operator-only routing, merchant-bank ownership and an independently authenticated incoming deposit before customer launch.',
 };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const report=await runBankCreditPreflight({
   configPath:process.env.EVERCRAFT_BANK_CREDIT_PRIVATE_CONFIG,
   stateDir:process.env.EVERCRAFT_BANK_CREDIT_PRIVATE_STATE,
  });
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.local_staging_config_ready)process.exitCode=1;
 }catch{
  process.stderr.write('BANK_CREDIT_PREFLIGHT_HELD\n');
  process.exitCode=1;
 }
}
