#!/usr/bin/env node
// Owner-only Signal buyer inbox. Does not send email, charge, quote a due date or publish customer PII.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readSignalPrivateInquiry } from '../systemia/mcp/signal-public-inquiry.mjs';

const dir=process.env.EVERCRAFT_SIGNAL_LEADS_DIR||
  path.join(os.homedir(),'.local','state','evercraft','signal-leads');
const key=process.env.EVERCRAFT_SIGNAL_INTAKE_KEY_B64||'';
const [command,reference,...flags]=process.argv.slice(2);
const reveal=flags.includes('--reveal');

function privateFolderExists(){
  try{
    const stat=fs.lstatSync(dir);
    return stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0;
  }catch{return false}
}
function listRefs(){
  if(!privateFolderExists())return null;
  return fs.readdirSync(dir).filter(n=>/^ECS-[A-F0-9]{24}\.enc$/.test(n))
    .map(n=>({reference:n.slice(0,-4),mtime:fs.statSync(path.join(dir,n)).mtimeMs}))
    .sort((a,b)=>b.mtime-a.mtime);
}
function outboxCount(type){
  const folder=path.join(dir,type);
  try{
    const stat=fs.lstatSync(folder);
    if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)return null;
    return fs.readdirSync(folder).filter(n=>/^ECS-[A-F0-9]{24}\.json$/.test(n)).length;
  }catch{return null}
}
const rows=listRefs();
if(!['status','list','show','draft'].includes(command)){
  process.stderr.write('Usage: signal-owner-inbox.mjs status | list | show <ECS-reference> --reveal | draft <ECS-reference> --reveal\n');
  process.exitCode=2;
}else if(rows===null){
  process.stdout.write(JSON.stringify({schema:'evercraft.signal.owner-inbox-status.v1',state:'UNAVAILABLE_NOT_ZERO',payment_verified:false})+'\n');
  process.exitCode=2;
}else if(command==='status'){
  process.stdout.write(JSON.stringify({schema:'evercraft.signal.owner-inbox-status.v1',
    state:'PRIVATE_STORE_AVAILABLE',records:rows.length,
    notifications:{queued:outboxCount('alert-outbox'),inboxed:outboxCount('alert-receipts')},
    contains_buyer_pii:false,payment_verified:false},null,2)+'\n');
}else if(command==='list'){
  process.stdout.write(JSON.stringify({schema:'evercraft.signal.owner-inbox-index.v1',
    records:rows.slice(0,100).map(row=>({reference:row.reference})),
    contains_buyer_pii:false},null,2)+'\n');
}else if(!reveal){
  process.stderr.write('Buyer details are private. Add --reveal from the authorized owner shell with the dedicated encryption key.\n');
  process.exitCode=2;
}else{
  if(!/^ECS-[A-F0-9]{24}$/.test(reference||'')){
    process.stderr.write('Invalid Signal inquiry reference.\n');
    process.exitCode=2;
  }else{
    try{
      const row=readSignalPrivateInquiry({storeDir:dir,key,reference});
      if(command==='show'){
        process.stdout.write(JSON.stringify({schema:'evercraft.signal.owner-inquiry.v1',...row},null,2)+'\n');
      }else{
        process.stdout.write(JSON.stringify({
          schema:'evercraft.signal.scope-reply-draft.v1',
          to:row.email,
          subject:'Evercraft Signal | Incident Evidence Brief | '+reference,
          body:[
            'Thanks for asking Evercraft Signal to investigate '+row.incident+'.',
            '',
            'Your question: '+row.question,
            '',
            'The proposed founding pilot is a $250 USD one-time written evidence brief for one documented incident, with a dated timeline, source ledger, confirmed versus reported claims, and missing evidence.',
            '',
            'Before an order can be accepted, Evercraft will confirm the exact bounded scope, delivery capacity, delivery date and the matching Evercraft Payments checkout. This message does not create a payment obligation.',
            '',
            'Please reply with any decision deadline or specific sources you want prioritized. Do not send passwords, card details or sensitive records.'
          ].join('\n'),
          draft_only:true,sent:false,order_created:false,payment_verified:false
        },null,2)+'\n');
      }
    }catch(error){
      process.stderr.write('The requested Signal record could not be safely opened: '+String(error?.message||error)+'\n');
      process.exitCode=2;
    }
  }
}
