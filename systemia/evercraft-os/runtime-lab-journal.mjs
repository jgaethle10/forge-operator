/**
 * Offline lab-only lifecycle journal. Hash-chain + local head detect accidental/local
 * modifications; not a trusted external anchor or production audit authority.
 * All malformed/ambiguous states are read-only holds. No automatic repair.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

const ENTRY_SCHEMA='evercraft.os.lab-lifecycle-event.v1';
const HEAD_SCHEMA='evercraft.os.lab-lifecycle-head.v1';
const LIMIT=4*1024*1024;
const EMPTY='sha256:'+'0'.repeat(64);
const canon=x=>Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
const hash=x=>'sha256:'+createHash('sha256').update(JSON.stringify(canon(x))).digest('hex');
const syncDir=dir=>{const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
function checkRegular(file){
  try {const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw Error('journal_nonregular_or_linked');return stat;}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
}
function readStrict(file){
  const stat=checkRegular(file);
  if(!stat)return null;
  if(stat.size>LIMIT)throw Error('journal_size_limit');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try {const fst=fs.fstatSync(fd);if(!fst.isFile()||fst.nlink!==1||fst.size!==stat.size)throw Error('journal_file_changed_during_read');return fs.readFileSync(fd,'utf8');}
  finally {fs.closeSync(fd);}
}
function storeHead(file,value){
  const tmp=file+'.tmp-'+randomUUID();
  let created=false;
  try{
    const fd=fs.openSync(tmp,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);created=true;
    try{fs.writeFileSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    // The replacement target must still be regular if it exists.
    checkRegular(file);
    fs.renameSync(tmp,file);created=false;syncDir(path.dirname(file));
  }finally{if(created){try{fs.unlinkSync(tmp);}catch{}}}
}
export class EvercraftOsLabLifecycleJournal {
  constructor(root){
    this.root=path.resolve(root);
    if(!fs.statSync(this.root).isDirectory())throw Error('journal_root_invalid');
    this.log=path.join(this.root,'lab-lifecycle.jsonl');
    this.head=path.join(this.root,'lab-lifecycle-head.json');
    this.writer=path.join(this.root,'lab-lifecycle-writer.lock');
  }
  /** Pure read. Neither checkpoint lag nor lock evidence is repaired. */
  inspect(){
    try{
      const content=readStrict(this.log),checkpoint=readStrict(this.head);
      if(content===null&&checkpoint===null)return {state:'clean_empty',count:0,head_hash:EMPTY,events:[],mutation_performed:false};
      if(content===null||checkpoint===null)throw Error('journal_log_checkpoint_disagree');
      if(!content.endsWith('\n'))throw Error('journal_incomplete_line');
      const lines=content.slice(0,-1).split('\n');
      if(!lines.length||lines.some(x=>!x))throw Error('journal_empty_or_gap');
      let prev=EMPTY;
      const events=[];
      for(let i=0;i<lines.length;i++){
        let entry;try{entry=JSON.parse(lines[i]);}catch{throw Error('journal_invalid_json');}
        if(!entry||Object.keys(entry).sort().join('|')==='')throw Error('journal_entry_invalid');
        if(Object.keys(entry).sort().join('|')!==['schema','seq','previous_hash','event','entry_hash'].sort().join('|')||entry.schema!==ENTRY_SCHEMA||entry.seq!==i+1||entry.previous_hash!==prev||!entry.event||typeof entry.event!=='object'||Array.isArray(entry.event))throw Error('journal_chain_invalid');
        const expected=hash({schema:entry.schema,seq:entry.seq,previous_hash:entry.previous_hash,event:entry.event});
        if(expected!==entry.entry_hash)throw Error('journal_hash_mismatch');
        prev=expected;events.push(entry.event);
      }
      let head;try{head=JSON.parse(checkpoint);}catch{throw Error('journal_checkpoint_invalid');}
      if(!head||Object.keys(head).sort().join('|')!==['schema','seq','entry_hash'].sort().join('|')||head.schema!==HEAD_SCHEMA||head.seq!==lines.length||head.entry_hash!==prev)throw Error('journal_head_mismatch_or_truncation');
      return {state:'verified_local_chain',count:lines.length,head_hash:prev,events,mutation_performed:false,independently_anchored:false};
    }catch(e){return {state:'held',reason:String(e.message||e),mutation_performed:false,independently_anchored:false};}
  }
  append(event){
    // An exclusive global writer handles cross-product contention without requiring an external lock service.
    const fd=fs.openSync(this.writer,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
    const writerStat=fs.fstatSync(fd);
    try{
      const st=writerStat;if(!st.isFile()||st.nlink!==1)throw Error('journal_writer_not_regular');
      fs.writeFileSync(fd,JSON.stringify({owner_pid:process.pid,token:randomUUID()}));fs.fsyncSync(fd);fs.closeSync(fd);syncDir(this.root);
      const checked=this.inspect();
      if(!['clean_empty','verified_local_chain'].includes(checked.state))throw Error('lab_journal_held:'+checked.reason);
      if(!event||typeof event!=='object'||Array.isArray(event))throw Error('lab_journal_event_invalid');
      const row={schema:ENTRY_SCHEMA,seq:checked.count+1,previous_hash:checked.head_hash,event:canon(event)};
      row.entry_hash=hash(row);
      const line=JSON.stringify(row)+'\n';
      const current=checkRegular(this.log);
      if(current&&current.size+Buffer.byteLength(line)>LIMIT)throw Error('journal_size_limit');
      const logFd=fs.openSync(this.log,fs.constants.O_APPEND|fs.constants.O_CREAT|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
      try{const after=fs.fstatSync(logFd);if(!after.isFile()||after.nlink!==1||current&&after.size!==current.size)throw Error('journal_changed_before_append');fs.writeFileSync(logFd,line);fs.fsyncSync(logFd);}finally{fs.closeSync(logFd);}
      syncDir(this.root);
      storeHead(this.head,{schema:HEAD_SCHEMA,seq:row.seq,entry_hash:row.entry_hash});
      return {state:'committed_local',sequence:row.seq,head_hash:row.entry_hash,independently_anchored:false};
    }finally{
      try{fs.closeSync(fd);}catch{}
      // Never delete a writer reservation another actor replaced while we were working.
      try{
        const current=fs.lstatSync(this.writer);
        if(current.isFile()&&!current.isSymbolicLink()&&current.ino===writerStat.ino&&current.dev===writerStat.dev){
          fs.unlinkSync(this.writer);syncDir(this.root);
        }
      }catch{} // Ambiguity remains a hold for review, never a guessed repair.
    }
  }
}
