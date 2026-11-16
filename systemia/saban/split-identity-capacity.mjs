import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {sanitizeNodeSeedInventory} from './nodeseed-inventory-ingest.mjs';

// Account separation is enforced by the OS, not a self-asserted JSON claim.
// Root-owned mailbox directory, Yard-owned capacity/ and Saban-owned private
// state are validated by scripts/prepare-saban-yard-split-mailbox.sh.
const FILE='nodeseed-capacity-inventory.json';
const MAX_BYTES=256*1024;
const sha=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validHash=value=>/^sha256:[a-f0-9]{64}$/.test(String(value||''));
function requireValid(ok,code){if(!ok)throw new Error('split_capacity_'+code);}
function capacityDir(mailboxRoot){
  requireValid(mailboxRoot,'mailbox_required');
  const base=path.resolve(mailboxRoot),target=path.join(base,'capacity');
  for(const p of [base,target]){
    const s=fs.lstatSync(p);
    requireValid(s.isDirectory()&&!s.isSymbolicLink(),'unsafe_directory');
    requireValid((s.mode&0o002)===0,'world_writable_directory_denied');
  }
  return target;
}
function snapshotPath(mailboxRoot){return path.join(capacityDir(mailboxRoot),FILE);}
function readSnapshot(mailboxRoot){
  const fd=fs.openSync(snapshotPath(mailboxRoot),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{
    const s=fs.fstatSync(fd);
    requireValid(s.isFile()&&s.nlink===1&&s.size>0&&s.size<=MAX_BYTES,'invalid_snapshot_file');
    return JSON.parse(fs.readFileSync(fd,'utf8'));
  }finally{fs.closeSync(fd);}
}
function validateSnapshot(snapshot,{now=new Date(),maxAgeMs=90_000}={}){
  requireValid(snapshot?.schema==='evercraft.saban.nodeseed-safe-inventory.v1',
    'schema_invalid');
  requireValid(snapshot?.source_schema==='evercraft.yard.remote-capacity-nodes.v1',
    'source_invalid');
  requireValid(snapshot.allocator_tokens_exposed===false&&
    snapshot.control_tokens_exposed===false&&
    snapshot.service_relay_tokens_exposed===false&&
    snapshot.authority_material_exposed===false,
    'authority_flags_invalid');
  requireValid(Array.isArray(snapshot.nodes)&&snapshot.nodes.length<=32 &&
    snapshot.count===snapshot.nodes.length,'nodes_invalid');
  const time=Date.parse(snapshot.sanitized_at||'');
  const current=now instanceof Date?now.getTime():Date.parse(String(now));
  requireValid(Number.isFinite(time)&&Number.isFinite(current)&&time<=current+5000&&
    current-time>=-5000&&current-time<=Math.min(90_000,Math.max(1000,Number(maxAgeMs)||90_000)),
    'snapshot_stale_or_future');
  const {receipt_hash:receiptHash,...body}=snapshot;
  requireValid(validHash(receiptHash)&&receiptHash===sha(body),
    'receipt_hash_invalid');
  for(const node of snapshot.nodes){
    requireValid(typeof node.node_id==='string'&&node.node_id.length>0&&node.node_id.length<=160,
      'node_identity_invalid');
    requireValid(typeof node.device_fingerprint==='string'&&node.device_fingerprint.length<=160,
      'fingerprint_invalid');
    requireValid(node.capacity?.device_fingerprint===node.device_fingerprint,
      'capacity_identity_mismatch');
  }
  return snapshot;
}
function atomicFile(target,content,mode){
  const tmp=target+'.'+process.pid+'.'+randomBytes(6).toString('hex')+'.tmp';
  const fd=fs.openSync(tmp,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY,mode);
  try{
    fs.writeFileSync(fd,content,'utf8');
    fs.fchmodSync(fd,mode);
    fs.fsyncSync(fd);
  }finally{fs.closeSync(fd);}
  try{fs.renameSync(tmp,target);}finally{fs.rmSync(tmp,{force:true});}
}
export function publishSplitIdentityCapacity({mailboxRoot,inventory,now=new Date()}={}){
  const safe=sanitizeNodeSeedInventory(inventory);
  const bytes=Buffer.byteLength(JSON.stringify(safe));
  requireValid(bytes<=MAX_BYTES,'snapshot_too_large');
  // Verify the same shape and digest that the receiving account will read.
  validateSnapshot(safe,{now});
  atomicFile(snapshotPath(mailboxRoot),JSON.stringify(safe,null,2)+'\n',0o640);
  return {schema:'evercraft.yard.split-capacity-publish.v1',
    safe_node_count:safe.count,inventory_receipt_hash:safe.receipt_hash,
    authority_material_persisted:false};
}
export function importSplitIdentityCapacity({
  mailboxRoot,sabanRoot,now=new Date(),maxAgeMs=90_000,
}={}){
  requireValid(sabanRoot,'saban_root_required');
  const safe=validateSnapshot(readSnapshot(mailboxRoot),{now,maxAgeMs});
  const root=path.resolve(sabanRoot),stat=fs.lstatSync(root);
  requireValid(stat.isDirectory()&&!stat.isSymbolicLink(),'saban_state_invalid');
  const target=path.join(root,FILE);
  atomicFile(target,JSON.stringify(safe,null,2)+'\n',0o600);
  return {schema:'evercraft.saban.split-capacity-import.v1',
    safe_node_count:safe.count,inventory_receipt_hash:safe.receipt_hash,
    authority_material_persisted:false};
}
