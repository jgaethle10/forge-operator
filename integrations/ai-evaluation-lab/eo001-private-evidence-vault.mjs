/**
 * EO-001: explicitly invoked PRIVATE local evidence archive.
 *
 * Not a network sink, service, encryption layer, authenticated attestation or
 * production evidence store. No automatic invocation. A future reviewed host
 * runner must call this after every success/error with a founder-approved
 * destination and a defined retention/backup policy. Tests use temporary
 * owned directories and synthetic packets only.
 *
 * Files are content-addressed, mode 0600 and created with O_EXCL|O_NOFOLLOW.
 * This prevents accidental overwrite, NOT malicious owner/host tampering.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {createHash} from 'node:crypto';

const reject=code=>{const e=new Error(code);e.code=code;throw e;};
const requireTrue=(condition,code)=>{if(!condition)reject(code);};
const SHA40=/^[a-f0-9]{40}$/;
const SHA256=/^[a-f0-9]{64}$/;
const TOKEN=/^[a-z0-9-]{3,40}$/;
const CATEGORIES=new Set([
  'supervisor-negative','supervisor-consistency','admission-blocked',
  'synthetic-field-report'
]);
const maxBytes=256*1024;

export function encodePrivateEvidenceEnvelope({
  category,sourceRevision,receipt
}={}){
  requireTrue(CATEGORIES.has(category)&&SHA40.test(sourceRevision||'')&&
    receipt&&typeof receipt==='object'&&!Array.isArray(receipt),
    'PRIVATE_RECEIPT_ENVELOPE_INVALID');
  requireTrue(TOKEN.test(category),'PRIVATE_RECEIPT_CATEGORY_INVALID');
  let json;
  try{
    json=JSON.stringify({
      schema:'evercraft.eo001.private-evidence-archive.v1',
      category,source_revision:sourceRevision,
      evidence_provenance_authenticated:false,
      local_file_tamper_resistant:false,
      receipt
    });
  }catch{reject('PRIVATE_RECEIPT_NOT_SERIALIZABLE');}
  requireTrue(json&&Buffer.byteLength(json)<=maxBytes,
    'PRIVATE_RECEIPT_OVERSIZED');
  const sha256=createHash('sha256').update(json,'utf8').digest('hex');
  requireTrue(SHA256.test(sha256),'PRIVATE_RECEIPT_DIGEST_INVALID');
  return Object.freeze({
    bytes:Buffer.from(json,'utf8'),
    sha256,
    filename:'eo001-private-'+sha256+'.json'
  });
}

/**
 * Caller must create a dedicated 0700 directory first; this function NEVER
 * creates a destination directory or follows a symlink. Refuse a directory
 * that can be browsed by other users, even if umask is permissive.
 */
export function writePrivateEvidence({directory,envelope}={}){
  requireTrue(typeof directory==='string'&&path.isAbsolute(directory)&&
    path.normalize(directory)===directory&&!directory.includes('\0'),
    'PRIVATE_RECEIPT_DIRECTORY_INVALID');
  requireTrue(envelope&&Buffer.isBuffer(envelope.bytes)&&
    SHA256.test(envelope.sha256||'')&&
    envelope.filename==='eo001-private-'+envelope.sha256+'.json'&&
    envelope.bytes.length>0&&envelope.bytes.length<=maxBytes,
    'PRIVATE_RECEIPT_INPUT_INVALID');
  requireTrue(
    createHash('sha256').update(envelope.bytes).digest('hex')===envelope.sha256,
    'PRIVATE_RECEIPT_CONTENT_CHANGED');

  let details,real;
  try{
    details=fs.lstatSync(directory);
    real=fs.realpathSync(directory);
  }catch{reject('PRIVATE_RECEIPT_DIRECTORY_UNAVAILABLE');}
  requireTrue(details.isDirectory()&&!details.isSymbolicLink()&&
    real===directory&&
    Number.isInteger(process.getuid?.())&&
    details.uid===process.getuid()&&
    (details.mode&0o077)===0,
    'PRIVATE_RECEIPT_DIRECTORY_UNTRUSTED');

  const dest=path.join(directory,envelope.filename);
  let fd;
  try{
    fd=fs.openSync(dest,fs.constants.O_CREAT|fs.constants.O_EXCL|
      fs.constants.O_NOFOLLOW|fs.constants.O_WRONLY,0o600);
    const opened=fs.fstatSync(fd);
    requireTrue(opened.isFile()&&opened.uid===process.getuid()&&
      (opened.mode&0o177)===0,
      'PRIVATE_RECEIPT_FILE_UNTRUSTED');
    fs.writeFileSync(fd,envelope.bytes);
    fs.fsyncSync(fd);
  }catch(error){
    // A partial file may remain after I/O failure: never call it archived.
    if(error?.code==='EEXIST')reject('PRIVATE_RECEIPT_ALREADY_ARCHIVED');
    if(error?.code==='PRIVATE_RECEIPT_FILE_UNTRUSTED')throw error;
    reject('PRIVATE_RECEIPT_WRITE_FAILED');
  }finally{if(fd!==undefined)fs.closeSync(fd);}
  return Object.freeze({
    schema:'evercraft.eo001.private-evidence-write.v1',
    state:'PRIVATE_LOCAL_RECEIPT_WRITTEN_NOT_ATTESTED',
    sha256:envelope.sha256,filename:envelope.filename,
    byte_count:envelope.bytes.length,permission_mode:'0600',
    observer_provenance_authenticated:false,
    local_file_tamper_resistant:false,
    external_actions_authorized:false
  });
}
