#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {reconcileGmailOutreach} from './gmail-reconciliation.mjs';

function option(flag){
 const i=process.argv.indexOf(flag);
 return i>=0?process.argv[i+1]:null;
}
function inputFile(file){
 if(!file||!path.isAbsolute(file))throw Error('private_absolute_input_required');
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)
   throw Error('private_file_permissions_invalid');
 return fs.readFileSync(file);
}
function readJson(file){
 return JSON.parse(inputFile(file).toString('utf8'));
}
function outputPath(file){
 if(!file||!path.isAbsolute(file))throw Error('private_absolute_output_required');
 const parent=path.dirname(file);
 const dir=fs.lstatSync(parent);
 if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0)
   throw Error('private_output_directory_required');
 return file;
}
export function savePrivateReport({outFile,report}){
 const target=outputPath(outFile);
 const fd=fs.openSync(target,'wx',0o600);
 try{
  fs.writeFileSync(fd,JSON.stringify(report,null,2)+'\n','utf8');
  fs.fsyncSync(fd);
 }finally{fs.closeSync(fd);}
 return {saved:true,report_ref:'private:'+path.basename(target),entries:report.prospects.length};
}
async function main(){
 const mail=readJson(option('--mail-file'));
 const prospects=readJson(option('--prospects-file'));
 const key=inputFile(option('--hmac-key-file')).toString('utf8').trim();
 const cap=Number(option('--provider-cap'));
 // FULL COVERAGE must be manually established with connector pagination and
 // missing-message checks. A CLI flag cannot prove Gmail completeness.
 const historyComplete=option('--history-complete')==='1';
 if(!Number.isSafeInteger(cap)||cap<1)throw Error('documented_provider_cap_required');
 const report=reconcileGmailOutreach({
  messages:mail.messages,
  prospects:prospects.prospects,
  now:new Date().toISOString(),
  hmacKey:key,
  historyComplete,
  providerDailyCap:cap
 });
 const result=savePrivateReport({outFile:option('--out-file'),report});
 // Emit only aggregate counters, never contact identities or message bodies.
 console.log(JSON.stringify({schema:'evercraft.systemia.gmail-reconciliation.summary.v1',
  state:'shadow_only',saved:result.saved,contact_rows:result.entries,
  quota_verified:report.quota.quota_verified,
  rolling_24h_units:report.quota.rolling_24h_units,
  invalid_receipts:report.record_coverage.invalid,
  cold_budget_remaining:report.quota.cold_budget_remaining,
  send_performed:false}));
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)
  main().catch(e=>{console.error('RECONCILIATION_HELD '+String(e?.message||e).slice(0,180));process.exitCode=1;});
