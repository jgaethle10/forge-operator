#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {builtinModules} from 'node:module';
import {build} from 'esbuild';

// Repository/CI-only SOURCE CLOSURE packer. No runtime execution, permissions
// changes, device access, network calls, deployment or service restarts.
// This is NOT a JavaScript bundle: preserving module file paths is essential
// for import.meta.url CLI guards in Evercraft's existing modules.
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ENTRYPOINTS={
  saban:'systemia/saban/split-identity-cycle-runner.mjs',
  yard:'systemia/yard/split-identity-request-consumer.mjs',
};
const builtins=new Set(builtinModules.flatMap(name=>[name,name.startsWith('node:')?name.slice(5):'node:'+name]));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function safeRelative(p){
  const normalized=p.split(path.sep).join('/');
  if(!normalized||path.isAbsolute(p)||normalized==='..'||normalized.startsWith('../')||
    normalized.includes('/../')||normalized.includes('\0'))
    throw new Error('role_pack_unsafe_source_path');
  return normalized;
}
function source(p){
  const rel=safeRelative(p);
  const absolute=path.resolve(ROOT,rel);
  if(!absolute.startsWith(ROOT+path.sep))throw new Error('role_pack_outside_repo');
  const stat=fs.lstatSync(absolute);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('role_pack_invalid_source_file:'+rel);
  return {rel,absolute,bytes:fs.readFileSync(absolute)};
}
function checkDynamicImports(file,bytes){
  const text=bytes.toString('utf8');
  const mentions=[...text.matchAll(/\bimport\s*\(/g)].length;
  const literal=[...text.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)].length;
  if(mentions!==literal)throw new Error('role_pack_unresolved_dynamic_import:'+file);
}
function ensureNoExternalPackages(metafile){
  for(const [sourcePath,details] of Object.entries(metafile.inputs)){
    for(const imp of details.imports||[]){
      if(imp.external&&!builtins.has(imp.path))
        throw new Error('role_pack_external_package_requires_review:'+sourcePath+':'+imp.path);
    }
  }
}
async function pack(role,entry,out){
  const analyzed=await build({
    entryPoints:[path.join(ROOT,entry)],
    bundle:true,platform:'node',format:'esm',target:'node22',
    packages:'external',write:false,metafile:true,logLevel:'silent',
    outfile:path.join(out,'.analysis-'+role+'.mjs'),
  });
  ensureNoExternalPackages(analyzed.metafile);
  const names=new Set(['package.json']);
  for(const pathName of Object.keys(analyzed.metafile.inputs)){
    names.add(safeRelative(path.relative(ROOT,path.resolve(ROOT,pathName))));
  }
  names.add(entry);
  const totalLimit=10*1024*1024;
  const roleDir=path.join(out,role);
  fs.mkdirSync(roleDir,{recursive:true,mode:0o755});
  const files=[];
  let bytesTotal=0;
  for(const p of [...names].sort()){
    const src=source(p);
    if(!p.endsWith('.json'))checkDynamicImports(p,src.bytes);
    bytesTotal+=src.bytes.length;
    if(bytesTotal>totalLimit)throw new Error('role_pack_exceeds_10mb_limit:'+role);
    const dest=path.join(roleDir,src.rel);
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.writeFileSync(dest,src.bytes,{mode:0o644});
    files.push({path:src.rel,sha256:sha(src.bytes),bytes:src.bytes.length});
  }
  const commit=execFileSync('git',['rev-parse','HEAD'],{
    cwd:ROOT,encoding:'utf8',
  }).trim();
  if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('role_pack_unpinned_source');
  const body={
    schema:'evercraft.split-identity.source-pack.v1',
    role,
    source_commit:commit,
    entrypoint:entry,
    modules:files.length,
    total_source_bytes:bytesTotal,
    files,
    contains_broker_credentials:false,
    installer_or_runtime_activated:false,
    full_repo_archive_required:false,
  };
  const manifest={...body,manifest_hash:'sha256:'+sha(Buffer.from(JSON.stringify(body)))};
  fs.writeFileSync(path.join(roleDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o644});
  fs.copyFileSync(path.join(ROOT,'scripts/verify-saban-yard-role-pack.mjs'),
    path.join(roleDir,'verify-role-pack.mjs'));
  execFileSync('tar',[
    '--sort=name','--mtime=@0','--owner=0','--group=0','--numeric-owner',
    '-czf',path.join(out,role+'-source.tar.gz'),'-C',roleDir,'.',
  ]);
  return {
    role,commit,entrypoint:entry,files:files.length,
    total_source_bytes:bytesTotal,manifest_hash:manifest.manifest_hash,
    archive:path.join(out,role+'-source.tar.gz'),
    services_changed:false,
  };
}
async function main(){
  const outArg=process.argv[2];
  if(!outArg)throw new Error('usage: node scripts/build-saban-yard-role-packs.mjs /out/directory');
  const out=path.resolve(outArg);
  if(out===ROOT||out==='/'||!out.startsWith(ROOT+path.sep))
    throw new Error('role_pack_output_must_be_repo_subdirectory');
  fs.mkdirSync(out,{recursive:true,mode:0o755});
  const roles=[];
  for(const [role,entry] of Object.entries(ENTRYPOINTS))
    roles.push(await pack(role,entry,out));
  console.log(JSON.stringify({
    schema:'evercraft.split-identity.source-pack-build.v1',
    roles,verified_by:'scripts/verify-saban-yard-role-pack.mjs',
    physical_node_deployment:false,
  },null,2));
}
main().catch(error=>{
  console.error(JSON.stringify({
    ok:false,schema:'evercraft.split-identity.source-pack-build-error.v1',
    error:String(error?.message||error).slice(0,260),
  }));
  process.exitCode=1;
});
