#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {persistPrivateRelationshipEvidence} from './relationship-ingest.mjs';

const REQUIRED='evercraft.crm.source-evidence-envelope.v1';
function arg(flag){const i=process.argv.indexOf(flag);return i>=0?process.argv[i+1]||'':'';}
function privateInput(file){
 const abs=path.resolve(file);
 const dir=fs.lstatSync(path.dirname(abs));
 if(!dir.isDirectory()||dir.isSymbolicLink()||
   (process.platform!=='win32'&&(dir.mode&0o077)!==0))throw Error('unsafe_dir');
 const fd=fs.openSync(abs,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
  const st=fs.fstatSync(fd);
  if(!st.isFile()||(process.platform!=='win32'&&(st.mode&0o077)!==0)||st.size>1024*1024)
   throw Error('unsafe_file');
  return JSON.parse(fs.readFileSync(fd,'utf8'));
 }finally{fs.closeSync(fd);}
}
export function ingestEnvelope({evidenceFile='',relationshipLedgerFile='',now=new Date()}={}){
 if(!evidenceFile||!relationshipLedgerFile)throw Error('paths_required');
 const envelope=privateInput(evidenceFile);
 if(envelope?.schema!==REQUIRED||
   !envelope.initial||!envelope.event)throw Error('evidence_envelope_invalid');
 const receipt=persistPrivateRelationshipEvidence({
  file:relationshipLedgerFile,
  initial:envelope.initial,event:envelope.event,now
 });
 return {schema:'evercraft.crm.source-evidence-intake.v1',
   state:receipt.state,receipt_hash:receipt.revision_hash||receipt.event_ref_hash,
   contact_authority_granted:false,message_sent:false,
   raw_content_in_output:false};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{
  const result=ingestEnvelope({
   evidenceFile:arg('--evidence-file')||process.env.EVERCRAFT_CRM_EVIDENCE_FILE||'',
   relationshipLedgerFile:arg('--relationship-ledger-file')||process.env.EVERCRAFT_CRM_RELATIONSHIP_LEDGER_FILE||''
  });
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch{
  // Always redact private source path, subject, name and input parser details.
  process.stderr.write(JSON.stringify({schema:'evercraft.crm.source-evidence-intake.v1',
    state:'held',reason:'input_invalid_or_unauthorized',
    contact_authority_granted:false,message_sent:false})+'\n');
  process.exitCode=2;
 }
}
