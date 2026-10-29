#!/usr/bin/env node
// Evercraft-owned local operator utility. Never serve this through public Fabric.
// By default emits references/status only; buyer PII requires explicit --reveal.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {readFindMyPartPrivateInquiry,reconcileFindMyPartInquiryOutbox} from '../systemia/mcp/findmypart-public-inquiry.mjs';
import {prepareFindMyPartQuote} from '../systemia/mcp/findmypart-private-quote.mjs';

const directory=process.env.EVERCRAFT_FINDMYPART_LEADS_DIR||
 path.join(os.homedir(),'.local','state','evercraft','findmypart-leads');
const key=process.env.EVERCRAFT_FINDMYPART_INTAKE_KEY_B64||'';
const refPattern=/^FMP-[A-F0-9]{24}$/;
function checkPrivateDir(){
 const st=fs.lstatSync(directory);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)
   throw Error('unsafe_private_inbox');
}
function print(value){process.stdout.write(JSON.stringify(value,null,2)+'\n')}
function list(){
 checkPrivateDir();
 const ids=fs.readdirSync(directory).filter(x=>/^FMP-[A-F0-9]{24}\.enc$/.test(x)).sort();
 return ids.map(filename=>{
  const reference=filename.slice(0,-4);
  const target=path.join(directory,filename),stat=fs.lstatSync(target);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)return {reference,state:'unsafe_file'};
  const sent=fs.existsSync(path.join(directory,'alert-receipts',reference+'.json'));
  const pending=fs.existsSync(path.join(directory,'alert-outbox',reference+'.json'));
  return {reference,recorded_at_utc:stat.birthtime.toISOString(),notification:sent?'owner_inbox_ack':pending?'queued':'recovery_needed'};
 });
}
async function main(){
 const [command,reference,arg3,arg4]=process.argv.slice(2);
 if(command==='list'){
  const entries=list();
  print({schema:'evercraft.findmypart.private-inbox-list.v1',count:entries.length,contains_buyer_pii:false,entries});
  return;
 }
 if(command==='reconcile'){
  const result=reconcileFindMyPartInquiryOutbox({storeDir:directory,key});
  print({schema:'evercraft.findmypart.private-outbox-recovery.v1',...result});
  return;
 }
 if(command==='show'){
  if(!refPattern.test(String(reference||'')))throw Error('valid_reference_required');
  if(arg3!=='--reveal')throw Error('explicit_reveal_flag_required');
  checkPrivateDir();
  const record=readFindMyPartPrivateInquiry({storeDir:directory,key,reference});
  print({schema:'evercraft.findmypart.private-review.v1',
    warning:'PRIVATE BUYER DETAILS. For authorized operator use only; do not paste into public CI, issues or analytics.',
    reference:record.reference,received_at:record.received_at,
    part_description:record.part_description,equipment_context:record.equipment_context,
    reply_email:record.email,state:record.state,
    payment_created:record.payment_created,agent_execution_authorized:record.agent_execution_authorized,
  });
  return;
 }
 if(command==='quote'){
  if(!refPattern.test(String(reference||'')))throw Error('valid_reference_required');
  if(arg4!=='--reveal')throw Error('explicit_reveal_flag_required');
  checkPrivateDir();
  const record=readFindMyPartPrivateInquiry({storeDir:directory,key,reference});
  print(prepareFindMyPartQuote(record,arg3));
  return;
 }
 throw Error('usage: node scripts/findmypart-owner-inbox.mjs list|reconcile|show FMP-<id> --reveal|quote FMP-<id> quick|deep|rescue --reveal');
}
main().catch(error=>{
 process.stderr.write('FindMyPart owner inbox: '+String(error?.message||'operation_failed')+'\n');
 process.exitCode=1;
});
