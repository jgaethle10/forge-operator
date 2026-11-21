#!/usr/bin/env node
/**
 * Evercraft Payments | initialize a HELD private bank-credit config.
 * Generates independent cryptographic keys locally. Never prints or exposes
 * them, never asks for bank data, never opens a payment link or issues an order.
 * Operator adds independently bank-confirmed recipient details out of band.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const makeKey=()=>crypto.randomBytes(48).toString('base64url');

export async function initializeHeldBankCreditConfig(filePath,{repoRoot=process.cwd()}={}){
 if(typeof filePath!=='string'||!path.isAbsolute(filePath))
  throw Error('absolute_private_config_path_required');
 const filename=path.resolve(filePath);
 const root=path.resolve(repoRoot);
 if(filename===root||filename.startsWith(root+path.sep))
  throw Error('private_config_inside_repository_forbidden');
 if(path.basename(filename)!=='bank-credit-private.json')
  throw Error('expected_private_config_filename');
 const parent=path.dirname(filename);
 if(parent===path.parse(parent).root)
  throw Error('private_config_root_directory_forbidden');
 await fs.mkdir(parent,{recursive:true,mode:0o700});
 const parentStat=await fs.lstat(parent);
 if(!parentStat.isDirectory()||parentStat.isSymbolicLink()||
   await fs.realpath(parent)!==parent)
  throw Error('private_config_symlink_directory_forbidden');
 if((parentStat.mode&0o077)!==0)throw Error('private_config_directory_not_private');
 const config={
  schema:'evercraft.payments.bank-credit-private-config.v1',
  current_state:'HELD_BANK_CONFIRMATION_REQUIRED',
  operator_token:makeKey(),
  link_signing_key:makeKey(),
  approved_offers:[],
  bank_payee:null,
 };
 // Exclusive create only: never overwrite a configured merchant account.
 await fs.writeFile(filename,JSON.stringify(config,null,2)+'\n',{
  encoding:'utf8',mode:0o600,flag:'wx',
 });
 return {ok:true,status:'HELD_BANK_CONFIRMATION_REQUIRED',
  private_file:filename,file_created:true,keys_generated:true,
  bank_configured:false,checkout_live:false,payment_received:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)throw Error('usage: node bank-credit-bootstrap.mjs /absolute/private/bank-credit-private.json');
  const receipt=await initializeHeldBankCreditConfig(process.argv[2]);
  process.stdout.write(JSON.stringify(receipt)+'\n');
 }catch(e){
  process.stderr.write('BANK_CREDIT_BOOTSTRAP_HELD '+String(e?.message||'setup_failed')+'\n');
  process.exitCode=1;
 }
}
