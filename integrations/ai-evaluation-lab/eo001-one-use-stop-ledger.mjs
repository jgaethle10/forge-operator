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
const MAX_RECORDS=8;
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
  let closed=false,reserved=null,next=0;
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
      let encoded;
      try{
        const data=JSON.stringify(receipt);
        ensure(typeof data==='string'&&
          Buffer.byteLength(data)<=MAX_RECEIPT-2048,
          'STOP_LEDGER_RECORD_OVERSIZED');
        encoded=Buffer.from(JSON.stringify({
          schema:'evercraft.eo001.one-use-stop-record.v1',
          permit_digest_sha256:reserved,ordinal:next,
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
      next++;
      return true;
    },
    close(){
      if(!closed){closed=true;fs.closeSync(directoryFd);}
    }
  });
}
