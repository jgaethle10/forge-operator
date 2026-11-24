// Destination-only restore primitive. Trusted resident supplies a verified,
// authorized migration envelope; never expose this as an arbitrary file writer.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const NODE='evercraft-node002-nextgen';
const sha=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const MAX=1024*1024;
export function restoreCemeterySnapshot({nodeId,warehouse,bytes,expectedDigest,enabled=false}={}){
 if(enabled!==true||nodeId!==NODE)throw Error('cemetery_restore_not_admitted');
 if(!Buffer.isBuffer(bytes)||bytes.length<100||bytes.length>MAX||sha(bytes)!==expectedDigest)throw Error('cemetery_snapshot_digest_or_size_invalid');
 if(bytes.subarray(0,16).toString('ascii')!=='SQLite format 3\0')throw Error('cemetery_snapshot_header_invalid');
 if(!warehouse||!path.isAbsolute(warehouse))throw Error('cemetery_warehouse_required');
 const registry=path.join(warehouse,'registry');
 for(const d of [warehouse,registry]){
  const s=fs.lstatSync(d);
  if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077))throw Error('cemetery_private_storage_required');
 }
 const dest=path.join(registry,'va-gravesite-canary.sqlite3');
 const temp=path.join(registry,'.restore-'+randomBytes(12).toString('hex'));
 const code=`import sqlite3,sys,json
from pathlib import Path
with sqlite3.connect(Path(sys.argv[1]).as_uri()+"?mode=ro&immutable=1",uri=True) as db:
    assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
    count=db.execute("SELECT count(*) FROM burials").fetchone()[0]
    cursor=db.execute("SELECT cursor FROM checkpoint WHERE id=1").fetchone()[0]
    batches=db.execute("SELECT count(*) FROM receipts").fetchone()[0]
    assert (count,cursor,batches)==(250,1216,1)
    assert db.execute("SELECT max(decedent_id) FROM burials").fetchone()[0]==cursor
    assert db.execute("SELECT cursor_before,cursor_after,rows FROM receipts").fetchone()==(-1,1216,250)
    print(json.dumps(dict(records=count,cursor=cursor,batches=batches)))`;
 try{
  const fd=fs.openSync(temp,'wx',0o600);
  try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  const p=spawnSync('python3',['-I','-c',code,temp],{encoding:'utf8',timeout:10000,maxBuffer:4096});
  if(p.status!==0||p.error)throw Error('cemetery_snapshot_integrity_or_checkpoint_failed');
  const proof=JSON.parse(p.stdout);
  // Atomic no-clobber publication. Never overwrite an existing warehouse.
  try{fs.linkSync(temp,dest)}catch(e){
   if(e.code!=='EEXIST')throw e;
   const s=fs.lstatSync(dest);
   if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)||s.size!==bytes.length||sha(fs.readFileSync(dest))!==expectedDigest)throw Error('cemetery_existing_warehouse_conflict');
  }
  const dirfd=fs.openSync(registry,'r');try{fs.fsyncSync(dirfd)}finally{fs.closeSync(dirfd)}
  return {schema:'evercraft.cemetery.snapshot-restore.v1',node_id:NODE,object_sha256:expectedDigest,...proof,sqlite_integrity_verified:true,destination_installed:true,writer_handoff_complete:false};
 }finally{try{fs.unlinkSync(temp)}catch(e){if(e.code!=='ENOENT')throw e}}
}
