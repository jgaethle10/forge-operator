// Saban Graphics: explicitly opted-in, private scheduler transition observations.
// This is a local hash-chained diagnostic, NOT an independently signed audit log.
// No job IDs, worker IDs, assignments, customer data or error payloads.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const STATES=['queued','leased','completed','dead_letter'];
const EVENTS=['leased','completed','retry_queued','dead_letter','scheduler_finished'];
const DIGEST=/^[a-f0-9]{64}$/;
const within=(base,target)=>{
  const r=path.relative(base,target);
  return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));
};
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
const iso=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&
  Number.isFinite(Date.parse(value));

export function validateSabanAggregateEvent(event){
  if(!event||!EVENTS.includes(event.kind)||!iso(event.at)||!event.counts||
     !Number.isSafeInteger(event.total)||event.total<0||event.total>10000||
     STATES.some(s=>!Number.isSafeInteger(event.counts[s])||event.counts[s]<0)||
     STATES.reduce((n,s)=>n+event.counts[s],0)!==event.total||
     !['scheduler_observation','synthetic_test'].includes(event.source_class)||
     Object.keys(event).some(k=>!['kind','at','counts','total','source_class'].includes(k))){
    throw new Error('Invalid private aggregate transition');
  }
  return {
    kind:event.kind,at:event.at,total:event.total,
    counts:Object.fromEntries(STATES.map(s=>[s,event.counts[s]])),
    source_class:event.source_class
  };
}

export function createPrivateSabanTransitionJournal({directory,sourceClass='scheduler_observation'}={}){
  if(!['scheduler_observation','synthetic_test'].includes(sourceClass))
    throw new Error('Invalid Saban journal source class');
  if(typeof directory!=='string'||!path.isAbsolute(directory))
    throw new Error('Private journal directory must be absolute');
  const target=path.resolve(directory);
  if(target===path.parse(target).root||within(root,target))
    throw new Error('Journal must reside outside the repository and public web tree');
  // Require an existing operator-controlled parent, then create an exclusive
  // empty per-run directory. Existing dirs are never reused or overwritten.
  const parent=path.dirname(target);
  if(!fs.existsSync(parent))throw new Error('Journal parent directory does not exist');
  const parentReal=fs.realpathSync(parent);
  if(parentReal!==parent||within(root,parentReal)||!fs.statSync(parentReal).isDirectory())
    throw new Error('Unsafe journal parent directory');
  fs.mkdirSync(target,{mode:0o700});
  const file=path.join(target,'saban-transitions.jsonl');
  const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|
    (fs.constants.O_NOFOLLOW??0),0o600);
  let sequence=0,previous='0'.repeat(64),closed=false;
  const record=event=>{
    if(closed)throw new Error('Saban journal is closed');
    const clean=validateSabanAggregateEvent({...event,source_class:sourceClass});
    const payload={schema:'evercraft.saban.private-transition.v1',
      seq:sequence+1,previous_digest:previous,...clean};
    const digest=sha(JSON.stringify(payload));
    const line=JSON.stringify({...payload,entry_digest:digest})+'\n';
    // Do not mark a new sequence number until the append and sync succeed.
    fs.writeSync(fd,line);
    fs.fsyncSync(fd);
    sequence++;
    previous=digest;
    return {sequence,digest};
  };
  const close=()=>{
    if(closed)return;
    closed=true;fs.closeSync(fd);
  };
  return {record,close,file,summary:()=>({
    schema:'evercraft.saban.private-transition-journal.v1',
    source_class:sourceClass,entries:sequence,last_digest:previous,
    local_chain_only:true,independently_attested:false,publication_authority:false
  })};
}

export function verifyPrivateSabanTransitionJournal(raw){
  if(typeof raw!=='string'||Buffer.byteLength(raw)>8*1024*1024)
    throw new Error('Journal invalid or exceeds 8 MiB');
  const lines=raw.trimEnd().split('\n');
  if(!lines.length||lines.length>10000||!lines[0])throw new Error('Empty or oversized journal');
  let previous='0'.repeat(64),count=0;
  for(const line of lines){
    let entry;
    try{entry=JSON.parse(line);}catch{throw new Error('Malformed journal line');}
    if(entry.schema!=='evercraft.saban.private-transition.v1'||entry.seq!==count+1||
       !DIGEST.test(entry.entry_digest||'')||entry.previous_digest!==previous){
      throw new Error('Broken Saban journal sequence or chain');
    }
    if(Object.keys(entry).some(k=>!['schema','seq','previous_digest','entry_digest',
       'kind','at','counts','total','source_class'].includes(k)))throw new Error('Unexpected journal fields');
    const event=validateSabanAggregateEvent({
      kind:entry.kind,at:entry.at,total:entry.total,
      counts:entry.counts,source_class:entry.source_class
    });
    const payload={schema:entry.schema,seq:entry.seq,previous_digest:entry.previous_digest,...event};
    const expected=sha(JSON.stringify(payload));
    if(expected!==entry.entry_digest)throw new Error('Saban journal digest mismatch');
    previous=expected;count++;
  }
  return {entries:count,last_digest:previous,
    local_chain_only:true,independently_attested:false};
}
