#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const sha=data=>createHash('sha256').update(data).digest('hex');
function valid(ok,why){if(!ok)throw new Error('split_pack_'+why);}
function safePath(p){
  valid(typeof p==='string'&&p.length>0&&!path.isAbsolute(p)&&
    p!=='..'&&!p.startsWith('../')&&!p.includes('/../')&&
    !p.includes('\\')&&!p.includes('\0'),'invalid_relative_path');
  return p;
}
function readNoFollow(file){
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{
    const stat=fs.fstatSync(fd);
    valid(stat.isFile()&&stat.nlink===1,'file_must_be_regular_and_unlinked');
    return fs.readFileSync(fd);
  }finally{fs.closeSync(fd);}
}
function verify({root}){
  const base=path.resolve(root),stat=fs.lstatSync(base);
  valid(stat.isDirectory()&&!stat.isSymbolicLink(),'invalid_root');
  const manifest=JSON.parse(readNoFollow(path.join(base,'manifest.json')).toString('utf8'));
  valid(manifest.schema==='evercraft.split-identity.source-pack.v1','manifest_schema');
  valid(['saban','yard'].includes(manifest.role),'invalid_role');
  valid(/^[a-f0-9]{40}$/.test(manifest.source_commit||''),'source_commit_invalid');
  valid(Array.isArray(manifest.files)&&manifest.files.length>0&&
    manifest.files.length<2000&&manifest.modules===manifest.files.length,'file_list_invalid');
  const {manifest_hash:expected,...body}=manifest;
  valid(expected==='sha256:'+sha(Buffer.from(JSON.stringify(body))),'manifest_hash_invalid');
  let total=0;
  const allowed=new Set(['manifest.json','verify-role-pack.mjs']);
  for(const entry of manifest.files){
    const rel=safePath(entry.path);
    valid(!allowed.has(rel),'duplicate_file');
    allowed.add(rel);
    const parts=rel.split('/');
    let cursor=base;
    for(const part of parts.slice(0,-1)){
      cursor=path.join(cursor,part);
      const d=fs.lstatSync(cursor);
      valid(d.isDirectory()&&!d.isSymbolicLink(),'symlinked_parent_denied');
    }
    const bytes=readNoFollow(path.join(base,rel));
    valid(entry.bytes===bytes.length,'byte_count_mismatch');
    valid(entry.sha256===sha(bytes),'file_hash_mismatch');
    total+=bytes.length;
  }
  valid(total===manifest.total_source_bytes&&total<=10*1024*1024,'total_bytes_mismatch');
  valid(allowed.has(manifest.entrypoint),'entrypoint_missing');

  function walk(directory,prefix=''){
    for(const child of fs.readdirSync(directory)){
      const rel=prefix?prefix+'/'+child:child;
      const target=path.join(directory,child),stat=fs.lstatSync(target);
      valid(!stat.isSymbolicLink(),'symlink_denied');
      if(stat.isDirectory())walk(target,rel);
      else valid(stat.isFile()&&allowed.has(rel),'unlisted_pack_file');
    }
  }
  walk(base);
  return {
    schema:'evercraft.split-identity.source-pack-verify.v1',
    ok:true,role:manifest.role,source_commit:manifest.source_commit,
    entrypoint:manifest.entrypoint,verified_files:manifest.files.length,
    manifest_hash:manifest.manifest_hash,
    services_changed:false,
  };
}
try{
  if(!process.argv[2])throw new Error('usage: node verify-role-pack.mjs /path/to/extracted/role');
  console.log(JSON.stringify(verify({root:process.argv[2]}),null,2));
}catch(error){
  console.error(JSON.stringify({ok:false,schema:'evercraft.split-identity.source-pack-verify-error.v1',
    error:String(error?.message||error).slice(0,240)}));
  process.exitCode=1;
}
