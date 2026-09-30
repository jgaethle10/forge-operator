import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { persistAliEvSnapshot } from './source-runtime.mjs';

const sha=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const clean=(v)=>String(v??'').trim();
const norm=(v)=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}

export function createAliEvSnapshotBundle({outDir,snapshots=[]}={}){
  if(!outDir) throw new Error('outDir is required');
  if(!Array.isArray(snapshots)||!snapshots.length) throw new Error('snapshots are required');
  const root=path.resolve(outDir);
  const objects=path.join(root,'objects');
  fs.mkdirSync(objects,{recursive:true,mode:0o750});
  const entries=[];
  for(const snapshot of snapshots){
    const bytes=Buffer.from(JSON.stringify(snapshot));
    const digest=sha(bytes);
    const file=path.join(objects,digest+'.json');
    if(!fs.existsSync(file)) fs.writeFileSync(file,bytes,{mode:0o600});
    const reopened=fs.readFileSync(file);
    if(sha(reopened)!==digest||reopened.byteLength!==bytes.byteLength) throw new Error('bundle_object_integrity_failed');
    entries.push({
      sha256:digest,
      byte_count:bytes.byteLength,
      matched_address:clean(snapshot?.matched_address),
      address_key:norm(snapshot?.matched_address),
      aliases:Array.isArray(snapshot?.address_aliases)?snapshot.address_aliases.map(norm).filter(Boolean):[],
      retrieved_at:clean(snapshot?.retrieved_at),
      response_profile:clean(snapshot?.response_profile),
      evidence_state:clean(snapshot?.evidence_state),
      object_ref:path.posix.join('objects',digest+'.json'),
    });
  }
  entries.sort((a,b)=>{
    const ta=Date.parse(a.retrieved_at)||0,tb=Date.parse(b.retrieved_at)||0;
    return ta-tb || a.sha256.localeCompare(b.sha256);
  });
  const manifest={
    schema:'evercraft.aliev.snapshot-bundle.v1',
    created_at:new Date().toISOString(),
    snapshot_count:entries.length,
    object_count:new Set(entries.map(x=>x.sha256)).size,
    semantics:'Objects are content-addressed. Import order is oldest to newest. The destination store refuses stale address rebinding.',
    entries,
  };
  manifest.manifest_sha256=sha(Buffer.from(JSON.stringify({...manifest,manifest_sha256:undefined})));
  atomicJson(path.join(root,'manifest.json'),manifest);
  return manifest;
}

export function verifyAliEvSnapshotBundle({bundleDir}={}){
  if(!bundleDir) throw new Error('bundleDir is required');
  const root=path.resolve(bundleDir);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  if(manifest?.schema!=='evercraft.aliev.snapshot-bundle.v1') throw new Error('bundle_schema_invalid');
  const seen=new Set();
  for(const entry of manifest.entries||[]){
    const file=path.resolve(root,String(entry.object_ref||''));
    if(!file.startsWith(root+path.sep)) throw new Error('bundle_object_path_escape');
    const bytes=fs.readFileSync(file);
    if(sha(bytes)!==entry.sha256) throw new Error('bundle_object_sha_mismatch');
    if(bytes.byteLength!==Number(entry.byte_count||0)) throw new Error('bundle_object_byte_count_mismatch');
    const snapshot=JSON.parse(bytes.toString('utf8'));
    if(clean(snapshot?.response_profile)!=='rivet_report_snapshot_v1') throw new Error('bundle_snapshot_profile_invalid');
    seen.add(entry.sha256);
  }
  return {
    ok:true,
    schema:'evercraft.aliev.snapshot-bundle-verification.v1',
    snapshot_count:(manifest.entries||[]).length,
    object_count:seen.size,
    manifest_sha256:clean(manifest.manifest_sha256),
  };
}

export function importAliEvSnapshotBundle({bundleDir,stateDir}={}){
  const verified=verifyAliEvSnapshotBundle({bundleDir});
  const root=path.resolve(bundleDir);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  const receipts=[];
  for(const entry of manifest.entries||[]){
    const bytes=fs.readFileSync(path.resolve(root,entry.object_ref));
    const snapshot=JSON.parse(bytes.toString('utf8'));
    const receipt=persistAliEvSnapshot({stateDir,snapshot});
    if(receipt.sha256!==entry.sha256) throw new Error('bundle_import_sha_mismatch');
    receipts.push(receipt);
  }
  return {
    ok:true,
    schema:'evercraft.aliev.snapshot-bundle-import-receipt.v1',
    source_manifest_sha256:verified.manifest_sha256,
    snapshot_count:receipts.length,
    indexed_key_count:receipts.reduce((n,x)=>n+(x.indexed_keys?.length||0),0),
    stale_key_count:receipts.reduce((n,x)=>n+(x.stale_keys?.length||0),0),
    receipts,
  };
}
