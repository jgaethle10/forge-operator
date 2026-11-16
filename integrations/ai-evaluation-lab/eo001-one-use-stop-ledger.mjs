/**
 * EO-001: private, single-host, fail-closed one-use permit ledger.
 *
 * This is a locally fsync'd, owner-only filesystem sink for the draft native
 * synthetic stop controller. It is NOT a field runner, approval issuer,
 * network store, HSM, host attestation, or owner-proof tamper resistance.
 * Import is effect-free. Caller supplies a pre-existing, dedicated 0700
 * directory; no auto-create, cleanup, deletion or re-arming is supported.
 *
 * O_EXCL reservation survives process restarts and resists accidental replay
 * by cooperating processes sharing the same canonical directory. A malicious
 * local owner/root or storage rollback can defeat it. The approved reviewer
 * must assess these limits before any physical use.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {createHash} from 'node:crypto';

const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const ensure=(ok,code)=>{if(!ok)fail(code);};
const DIGEST=/^[a-f0-9]{64}$/;
const MAX_RECEIPT=256*1024;
const MAX_RECORDS=2;
const sha=b=>createHash('sha256').update(b).digest('hex');
const allowedSchema=s=>typeof s==='string'&&(
  /^evercraft\.eo001\.native-stop-(?:prestop|observation)\.v1$/.test(s)||
  s==='evercraft.eo001.gate1.native-stop-blocked.v1');

function parsePrivateDirectory(directory){
  ensure(process.platform==='linux'&&
    Number.isInteger(process.getuid?.())&&process.getuid()>0,
    'STOP_LEDGER_NONROOT_LINUX_REQUIRED');
  ensure(typeof directory==='string'&&path.isAbsolute(directory)&&
    path.normalize(directory)===directory&&!directory.includes('\0'),
    'STOP_LEDGER_DIRECTORY_INVALID');
  let fd;
  try{
    fd=fs.openSync(directory,fs.constants.O_RDONLY|
      fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
    const own=fs.fstatSync(fd);
    // Disallow aliases and symlinks in all ancestor path components too.
    ensure(fs.realpathSync(directory)===directory&&own.isDirectory()&&
      own.uid===process.getuid()&&(own.mode&0o077)===0,
      'STOP_LEDGER_DIRECTORY_UNTRUSTED');
    return fd;
  }catch(error){
    if(fd!==undefined)try{fs.closeSync(fd);}catch{}
    if(error?.code==='STOP_LEDGER_DIRECTORY_UNTRUSTED')throw error;
    fail('STOP_LEDGER_DIRECTORY_UNAVAILABLE');
  }
}
function writeExclusive(fd,filename,bytes){
  ensure(Buffer.isBuffer(bytes)&&bytes.length>0&&
    bytes.length<=MAX_RECEIPT,'STOP_LEDGER_RECORD_OVERSIZED');
  const dest='/proc/self/fd/'+fd+'/'+filename;
  let file;
  try{
    file=fs.openSync(dest,fs.constants.O_CREAT|fs.constants.O_EXCL|
      fs.constants.O_NOFOLLOW|fs.constants.O_WRONLY,0o600);
    const st=fs.fstatSync(file);
    ensure(st.isFile()&&st.uid===process.getuid()&&
      st.nlink===1&&(st.mode&0o177)===0,
      'STOP_LEDGER_CREATED_FILE_UNTRUSTED');
    fs.writeFileSync(file,bytes);
    fs.fsyncSync(file);
    fs.closeSync(file);
    file=undefined;
    // Directory fsync is necessary before claiming the new name persists.
    fs.fsyncSync(fd);
    return true;
  }catch(error){
    if(error?.code==='EEXIST')return false;
    if(error?.code?.startsWith('STOP_LEDGER_'))throw error;
    fail('STOP_LEDGER_WRITE_NOT_DURABLE');
  }finally{
    if(file!==undefined)try{fs.closeSync(file);}catch{}
  }
}
/**
 * Exposes exactly the native controller's reserve(digest) and record(receipt)
 * sink contract plus close(). One sink instance is bound to one permit.
 */
export function openPrivateOneUseStopLedger({directory}={}){
  const directoryFd=parsePrivateDirectory(directory);
  let closed=false,reserved=null,next=0,previousRecordDigest=null,firstRecordSchema=null;
  const requireOpen=()=>ensure(!closed,'STOP_LEDGER_CLOSED');
  return Object.freeze({
    reserve(digest){
      requireOpen();
      ensure(DIGEST.test(digest||''),'STOP_LEDGER_PERMIT_DIGEST_INVALID');
      ensure(reserved===null,'STOP_LEDGER_ALREADY_RESERVED_BY_THIS_SINK');
      const envelope=Buffer.from(JSON.stringify({
        schema:'evercraft.eo001.one-use-stop-reservation.v1',
        state:'PERMIT_BURNED_BEFORE_POSSIBLE_STOP',
        permit_digest_sha256:digest,
        local_disk_fsync_requested:true,
        source_authenticity_attested:false,
        authorized_host_run_proven:false
      }));
      const ok=writeExclusive(directoryFd,
        'eo001-stop-permit-'+digest+'.reserved.json',envelope);
      if(ok)reserved=digest;
      return ok;
    },
    record(receipt){
      requireOpen();
      ensure(reserved!==null,'STOP_LEDGER_NOT_RESERVED');
      ensure(receipt&&typeof receipt==='object'&&!Array.isArray(receipt)&&
        allowedSchema(receipt.schema)&&
        receipt.permit_digest_sha256===reserved,
        'STOP_LEDGER_RECEIPT_UNBOUND');
      ensure(next<MAX_RECORDS,'STOP_LEDGER_RECORD_LIMIT');
      const preSchema='evercraft.eo001.native-stop-prestop.v1';
      const blockedSchema='evercraft.eo001.gate1.native-stop-blocked.v1';
      const outcomeSchema='evercraft.eo001.native-stop-observation.v1';
      ensure(next===0?(receipt.schema===preSchema||
        receipt.schema===blockedSchema):(
        firstRecordSchema===preSchema&&
        (receipt.schema===outcomeSchema||receipt.schema===blockedSchema)),
        'STOP_LEDGER_RECEIPT_SEQUENCE_INVALID');
      let encoded;
      try{
        const data=JSON.stringify(receipt);
        ensure(typeof data==='string'&&
          Buffer.byteLength(data)<=MAX_RECEIPT-2048,
          'STOP_LEDGER_RECORD_OVERSIZED');
        encoded=Buffer.from(JSON.stringify({
          schema:'evercraft.eo001.one-use-stop-record.v1',
          permit_digest_sha256:reserved,ordinal:next,
          previous_record_sha256:previousRecordDigest,
          receipt_sha256:sha(Buffer.from(data)),receipt,
          independent_host_attestation:false,
          immutable_owner_proof:false
        }));
      }catch(error){
        if(error?.code==='STOP_LEDGER_RECORD_OVERSIZED')throw error;
        fail('STOP_LEDGER_RECEIPT_NOT_SERIALIZABLE');
      }
      const filename='eo001-stop-'+reserved+'-'+
        String(next).padStart(3,'0')+'.json';
      const ok=writeExclusive(directoryFd,filename,encoded);
      ensure(ok,'STOP_LEDGER_RECEIPT_ALREADY_EXISTS');
      previousRecordDigest=sha(encoded);
      if(next===0)firstRecordSchema=receipt.schema;
      next++;
      return true;
    },
    close(){
      if(!closed){closed=true;fs.closeSync(directoryFd);}
    }
  });
}

/**
 * Read-only post-crash consistency check for one burned permit. Never
 * re-arms, repairs, authenticates, or asserts that a systemd stop occurred.
 * Returns a MINIMIZED review status; original receipts stay local.
 */
export function auditPrivateOneUseStopLedger({directory,permitDigest}={}){
  ensure(DIGEST.test(permitDigest||''),'STOP_LEDGER_AUDIT_DIGEST_INVALID');
  const dirfd=parsePrivateDirectory(directory);
  try{
    const base='/proc/self/fd/'+dirfd+'/';
    const readPrivate=(filename)=>{
      let fd;
      try{
        fd=fs.openSync(base+filename,fs.constants.O_RDONLY|
          fs.constants.O_NOFOLLOW);
        const st=fs.fstatSync(fd);
        ensure(st.isFile()&&st.uid===process.getuid()&&
          st.nlink===1&&(st.mode&0o177)===0&&
          st.size>0&&st.size<=MAX_RECEIPT,
          'STOP_LEDGER_AUDIT_UNTRUSTED_FILE');
        const raw=fs.readFileSync(fd);
        ensure(raw.length===st.size&&raw.length<=MAX_RECEIPT&&
          Buffer.from(raw.toString('utf8'),'utf8').equals(raw),
          'STOP_LEDGER_AUDIT_UNTRUSTED_BYTES');
        let obj;
        try{obj=JSON.parse(raw.toString('utf8'));}
        catch{fail('STOP_LEDGER_AUDIT_INVALID_JSON');}
        ensure(obj&&typeof obj==='object'&&!Array.isArray(obj),
          'STOP_LEDGER_AUDIT_INVALID_JSON');
        return {obj,raw};
      }catch(error){
        if(error?.code?.startsWith('STOP_LEDGER_AUDIT_'))throw error;
        fail('STOP_LEDGER_AUDIT_UNAVAILABLE');
      }finally{
        if(fd!==undefined)fs.closeSync(fd);
      }
    };
    const reservation='eo001-stop-permit-'+permitDigest+'.reserved.json';
    const claim=readPrivate(reservation).obj;
    ensure(claim.schema==='evercraft.eo001.one-use-stop-reservation.v1'&&
      claim.state==='PERMIT_BURNED_BEFORE_POSSIBLE_STOP'&&
      claim.permit_digest_sha256===permitDigest&&
      claim.local_disk_fsync_requested===true&&
      claim.source_authenticity_attested===false&&
      claim.authorized_host_run_proven===false,
      'STOP_LEDGER_AUDIT_RESERVATION_INVALID');
    const prefix='eo001-stop-'+permitDigest+'-';
    const names=fs.readdirSync(base);
    const selected=names.filter(n=>n.startsWith(prefix)).sort();
    ensure(selected.length<=MAX_RECORDS&&selected.every(n=>
      new RegExp('^'+prefix+'[0-9]{3}\\.json$').test(n)),
      'STOP_LEDGER_AUDIT_RECORD_NAMES_INVALID');
    const records=[];
    let lastDigest=null;
    for(let i=0;i<selected.length;i++){
      ensure(selected[i]===prefix+String(i).padStart(3,'0')+'.json',
        'STOP_LEDGER_AUDIT_GAPPED_SEQUENCE');
      const {obj,raw}=readPrivate(selected[i]);
      ensure(obj.schema==='evercraft.eo001.one-use-stop-record.v1'&&
        obj.permit_digest_sha256===permitDigest&&obj.ordinal===i&&
        obj.previous_record_sha256===lastDigest&&
        obj.independent_host_attestation===false&&
        obj.immutable_owner_proof===false&&
        obj.receipt&&typeof obj.receipt==='object'&&
        !Array.isArray(obj.receipt)&&
        allowedSchema(obj.receipt.schema)&&
        obj.receipt.permit_digest_sha256===permitDigest&&
        DIGEST.test(obj.receipt_sha256||'')&&
        sha(Buffer.from(JSON.stringify(obj.receipt)))===
          obj.receipt_sha256,
        'STOP_LEDGER_AUDIT_RECORD_INTEGRITY_INVALID');
      records.push(obj.receipt);
      lastDigest=sha(raw);
    }
    // The current stop controller writes at most one PRESTOP followed by
    // one terminal success/blocked record. Extra entries are inconsistent.
    ensure(records.length<=2&&
      (records.length===0||
        records[0].schema==='evercraft.eo001.native-stop-prestop.v1'||
        (records.length===1&&records[0].schema===
          'evercraft.eo001.gate1.native-stop-blocked.v1'))&&
      (records.length<2||
        records[1].schema==='evercraft.eo001.native-stop-observation.v1'||
        records[1].schema==='evercraft.eo001.gate1.native-stop-blocked.v1'),
      'STOP_LEDGER_AUDIT_RECORD_SEQUENCE_INVALID');
    let state;
    if(records.length===0)state='PERMIT_BURNED_NO_PRESTOP_RECORD';
    else if(records[0].schema==='evercraft.eo001.gate1.native-stop-blocked.v1')
      state='BLOCKED_WITHOUT_PRESTOP_RECORD';
    else if(records.length===1)state='PRESTOP_RECORD_NO_TERMINAL_OUTCOME';
    else if(records[1].schema==='evercraft.eo001.native-stop-observation.v1')
      state='LOCAL_STOP_ACK_METADATA_REVIEW_REQUIRED';
    else state='LOCAL_STOP_BLOCKED_OR_UNKNOWN';
    return Object.freeze({
      schema:'evercraft.eo001.one-use-stop-audit.v1',
      state,permit_digest_sha256:permitDigest,
      files_checked:1+records.length,records_count:records.length,
      local_record_chain_consistent:true,
      permit_rearmed:false,
      disk_fsync_history_independently_attested:false,
      source_authenticity_attested:false,
      independent_host_attestation:false,
      systemd_stop_independently_observed:false,
      recursively_empty_cgroup_independently_proven:false,
      physical_scope_cleanup_verified:false,
      lab_gate1_authorized:false,
      model_execution_authorized:false,
      provider_effects_authorized:false
    });
  }finally{fs.closeSync(dirfd);}
}
