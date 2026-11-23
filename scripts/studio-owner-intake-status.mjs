#!/usr/bin/env node
// First-party operator-only Studio intake status. Read-only and PII-free.
// Never publish the source ledger or print the stored buyer briefing fields.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const DEFAULT_DIR='/var/lib/evercraft/studio-leads';
const REF=/^EC-STUDIO-[A-F0-9]{20}$/;
const ALERT_FILE=/^(EC-STUDIO-[A-F0-9]{20})\.json$/;

function privateObject(filename,kind,uid){
  const stat=fs.lstatSync(filename);
  if(stat.isSymbolicLink()||stat.nlink!==1||
     (stat.mode&0o077)!==0||
     (kind==='directory'?!stat.isDirectory():!stat.isFile())||
     stat.uid!==uid)
    throw Error('STUDIO_PRIVATE_STORAGE_SAFETY_HOLD');
  return stat;
}
function alertRefs(dir,uid){
  privateObject(dir,'directory',uid);
  const ids=new Set();
  for(const file of fs.readdirSync(dir)){
    if(!ALERT_FILE.test(file))throw Error('STUDIO_UNKNOWN_ALERT_FILE_HOLD');
    const ref=file.slice(0,-5);
    privateObject(path.join(dir,file),'file',uid);
    ids.add(ref);
  }
  return ids;
}
export function inspectStudioOwnerIntake({directory=DEFAULT_DIR,uid=process.getuid?.()}={}){
  if(!path.isAbsolute(directory)||!Number.isSafeInteger(uid)||uid<0)
    throw Error('STUDIO_PRIVATE_STATUS_INVALID_ARGUMENTS');
  privateObject(directory,'directory',uid);
  const outbox=alertRefs(path.join(directory,'alert-outbox'),uid);
  const accepted=alertRefs(path.join(directory,'alert-receipts'),uid);
  const ledger=path.join(directory,'inquiries.ndjson');
  const ids=new Set();
  let latest=null;
  if(fs.existsSync(ledger)){
    const stat=privateObject(ledger,'file',uid);
    if(stat.size>16*1024*1024)throw Error('STUDIO_PRIVATE_LEDGER_TOO_LARGE_HOLD');
    const lines=fs.readFileSync(ledger,'utf8').split('\n').filter(Boolean);
    if(lines.length>10000)throw Error('STUDIO_PRIVATE_LEDGER_TOO_MANY_ROWS_HOLD');
    for(const line of lines){
      if(Buffer.byteLength(line)>8192)throw Error('STUDIO_PRIVATE_LEDGER_ROW_TOO_LARGE_HOLD');
      let row;
      try{row=JSON.parse(line)}catch{throw Error('STUDIO_PRIVATE_LEDGER_JSON_HOLD')}
      if(row?.schema!=='evercraft.studio.inquiry.v1'||!REF.test(row.id)||ids.has(row.id)||
         row.state!=='UNREVIEWED_NO_COMMITMENT'||row.consent!==true||
         row.automated_payment!==false||row.agent_execution_authorized!==false||
         !Number.isFinite(Date.parse(row.received_at)))
        throw Error('STUDIO_PRIVATE_LEDGER_CONTRACT_HOLD');
      ids.add(row.id);
      const time=Date.parse(row.received_at);
      if(latest===null||time>latest)latest=time;
    }
  }
  for(const id of [...outbox,...accepted]){
    if(!ids.has(id))throw Error('STUDIO_ORPHAN_ALERT_FILE_HOLD');
  }
  let awaitingDispatch=0,missingOutbox=0;
  for(const id of ids){
    if(accepted.has(id))continue;
    if(outbox.has(id))awaitingDispatch++;
    else missingOutbox++;
  }
  let duplicateFiles=0;
  for(const id of outbox)if(accepted.has(id))duplicateFiles++;
  return {
    schema:'evercraft.studio.owner-private-intake-status.v1',
    inquiries_total:ids.size,
    awaiting_relay_dispatch:awaitingDispatch,
    relay_inbox_accepted:accepted.size,
    alert_recovery_needed:missingOutbox,
    duplicate_pending_and_accepted:duplicateFiles,
    newest_inquiry_at_utc:latest===null?null:new Date(latest).toISOString(),
    all_alerts_relay_accepted:ids.size>0&&accepted.size===ids.size&&duplicateFiles===0,
    customer_content_exposed:false,
    submitted_inquiries_created:0,
    messages_sent:0,
    payment_authorized:false,
    note:'Relay acceptance is not a human read, reply or sale. Absence of alerts is not evidence the Relay dispatcher is configured.'
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==2)throw Error('Usage: node scripts/studio-owner-intake-status.mjs');
  try{console.log(JSON.stringify(inspectStudioOwnerIntake(),null,2))}
  catch(e){
    console.error('STUDIO_PRIVATE_STATUS_HOLD '+String(e?.message||'unknown'));
    process.exitCode=1;
  }
}
