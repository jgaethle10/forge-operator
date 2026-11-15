/**
 * Private EO-001 archive -> existing Black Box UNSIGNED read-only candidate.
 *
 * Compatible with source-only EO-001 evidence-vault v1 (PR #2065). The
 * archive digest is local integrity, NOT authenticated provenance. No service
 * starts, file writes, signatures, network, provider effects, or authority.
 *
 * Linux only. The importer opens an owned 0700 directory and reads a 0600
 * regular file through its held dirfd so the directory itself is not swapped
 * between validation and read. Private procfs and stop metadata never appear
 * in the returned projection.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {createHash} from 'node:crypto';
import {projectEo001NegativeToBlackBox}
  from './eo001-blackbox-projection.mjs';

const reject=code=>{const e=new Error(code);e.code=code;throw e;};
const requireTrue=(cond,code)=>{if(!cond)reject(code);};
const SHA=/^[a-f0-9]{64}$/;
const ARCHIVE=/^eo001-private-([a-f0-9]{64})\.json$/;
const MAX=256*1024;
const digest=b=>createHash('sha256').update(b).digest('hex');

function verifiedArchiveBytes(directory,filename){
  requireTrue(process.platform==='linux'&&Number.isInteger(process.getuid?.())&&
    process.getuid()>0,'EO001_ARCHIVE_READER_LINUX_USER_REQUIRED');
  requireTrue(typeof directory==='string'&&path.isAbsolute(directory)&&
    path.normalize(directory)===directory&&!directory.includes('\0')&&
    typeof filename==='string'&&ARCHIVE.test(filename),
    'EO001_ARCHIVE_LOCATION_INVALID');
  let dirfd,filefd;
  try{
    dirfd=fs.openSync(directory,
      fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
    const st=fs.fstatSync(dirfd);
    requireTrue(st.isDirectory()&&st.uid===process.getuid()&&
      (st.mode&0o077)===0,
      'EO001_ARCHIVE_DIRECTORY_UNTRUSTED');
    // Assert that the chosen pathname itself resolves without aliases.
    requireTrue(fs.realpathSync(directory)===directory,
      'EO001_ARCHIVE_DIRECTORY_UNTRUSTED');
    filefd=fs.openSync('/proc/self/fd/'+dirfd+'/'+filename,
      fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    const f=fs.fstatSync(filefd);
    requireTrue(f.isFile()&&f.nlink===1&&
      f.uid===process.getuid()&&(f.mode&0o177)===0&&
      f.size>0&&f.size<=MAX,
      'EO001_ARCHIVE_FILE_UNTRUSTED');
    const raw=fs.readFileSync(filefd);
    requireTrue(raw.length===f.size&&raw.length<=MAX,
      'EO001_ARCHIVE_SHORT_OR_OVERSIZED_READ');
    requireTrue(digest(raw)===filename.match(ARCHIVE)[1],
      'EO001_ARCHIVE_CONTENT_DIGEST_MISMATCH');
    requireTrue(Buffer.from(raw.toString('utf8'),'utf8').equals(raw),
      'EO001_ARCHIVE_ENCODING_INVALID');
    return raw;
  }catch(error){
    if(/^EO001_ARCHIVE_/.test(error?.code||''))throw error;
    reject('EO001_ARCHIVE_READ_UNVERIFIED');
  }finally{
    if(filefd!==undefined)fs.closeSync(filefd);
    if(dirfd!==undefined)fs.closeSync(dirfd);
  }
}

/**
 * Caller supplies existing Systemia tenant/mission/incident/scope metadata.
 * No default tenant, signer or authority. The archive's label cannot elevate
 * the classification above an explicit operator report.
 */
export function projectPrivateEo001ArchiveToBlackBox({
  directory,filename,...scope
}={}){
  const raw=verifiedArchiveBytes(directory,filename);
  let parsed;
  try{parsed=JSON.parse(raw.toString('utf8'));}
  catch{reject('EO001_ARCHIVE_JSON_INVALID');}
  requireTrue(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&
    parsed.schema==='evercraft.eo001.private-evidence-archive.v1'&&
    parsed.category==='supervisor-negative'&&
    parsed.evidence_provenance_authenticated===false&&
    parsed.local_file_tamper_resistant===false&&
    typeof parsed.receipt==='object'&&parsed.receipt!==null&&
    parsed.receipt.source_revision===parsed.source_revision&&
    parsed.source_revision===scope.sourceRevision,
    'EO001_ARCHIVE_UNVERIFIED_ENVELOPE');
  requireTrue(scope.provenanceMode==='SYNTHETIC_FIXTURE'||
    scope.provenanceMode==='OPERATOR_REPORTED_PHYSICAL',
    'EO001_ARCHIVE_PROVENANCE_UNVERIFIED');
  const receiptBytes=Buffer.from(JSON.stringify(parsed.receipt),'utf8');
  const projected=projectEo001NegativeToBlackBox({
    ...scope,sourceBytes:receiptBytes
  });
  return Object.freeze({
    schema:'evercraft.eo001.blackbox.private-archive-readonly.v1',
    state:'ARCHIVE_HASH_MATCHED_UNSIGNED_INCIDENT_CANDIDATE',
    archive_sha256:digest(raw),
    archive_local_integrity_checked:true,
    archive_signer_authenticated:false,
    physical_host_attestation_verified:false,
    original_scope_cleanup_verified:false,
    live_spider_service_invoked:false,
    source_receipt_sha256:projected.source_receipt_sha256,
    incident_candidate:projected,
    execution_authority:'NONE_READ_ONLY'
  });
}
