// Offline backup/restore for the Evercraft-owned Worlds vault.
// Backup files contain edit capability hashes: treat the entire folder as PRIVATE.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {decodeSharedScene,encodeSharedScene} from '../../public/worlds/share-scene.mjs';
const ID=/^[a-f0-9]{32}\.json$/;
const sha=v=>createHash('sha256').update(v).digest('hex');
const within=(parent,child)=>{const r=path.relative(parent,child);return r===''||(!r.startsWith('..')&&!path.isAbsolute(r));};
async function mustRealDirectory(root){const real=await fs.realpath(root);if(!(await fs.lstat(real)).isDirectory())throw Error('vault_directory_required');return real;}
function checkedRecord(bytes,name){
 const o=JSON.parse(bytes.toString('utf8'));
 if(o.schema!=='evercraft.worlds.vault.v1'||o.id+'.json'!==name||!Number.isInteger(o.version)||o.version<1||!/^[a-f0-9]{64}$/.test(o.edit_hash||''))throw Error('invalid_vault_record');
 const scene=decodeSharedScene(o.scene_token);
 if(encodeSharedScene(scene)!==o.scene_token)throw Error('noncanonical_scene');
 return o;
}
async function checkedEntries(root){
 const entries=[];
 for(const name of (await fs.readdir(root)).sort()){
  if(!ID.test(name))continue;
  const full=path.join(root,name),stat=await fs.lstat(full);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('vault_file_unsafe');
  const bytes=await fs.readFile(full);
  const record=checkedRecord(bytes,name);
  entries.push({name,bytes,digest:sha(bytes),version:record.version});
 }
 return entries;
}
export async function createVaultBackup({dataRoot,backupRoot}={}){
 if(!dataRoot||!backupRoot)throw Error('backup_paths_required');
 const source=await mustRealDirectory(dataRoot);
 await fs.mkdir(backupRoot,{recursive:true,mode:0o700});
 const destinationParent=await mustRealDirectory(backupRoot);
 if(within(source,destinationParent)||within(destinationParent,source))throw Error('backup_must_be_outside_vault');
 const entries=await checkedEntries(source);
 const name='worlds-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(6).toString('hex');
 const destination=path.join(destinationParent,name);
 await fs.mkdir(destination,{mode:0o700});
 try{
  for(const item of entries){
   const output=path.join(destination,item.name);
   await fs.writeFile(output,item.bytes,{flag:'wx',mode:0o600});
  }
  const manifest={schema:'evercraft.worlds.private-backup.v1',created_at:new Date().toISOString(),
   records:entries.map(({name,digest,version})=>({name,sha256:digest,version}))};
  await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
  return {verified:true,backup_path:destination,world_count:entries.length,manifest_sha256:sha(JSON.stringify(manifest))};
 }catch(e){await fs.rm(destination,{recursive:true,force:true});throw e;}
}
export async function verifyVaultBackup(backupPath){
 const backup=await mustRealDirectory(backupPath);
 const manifestFile=path.join(backup,'manifest.json');
 if((await fs.lstat(manifestFile)).isSymbolicLink())throw Error('unsafe_backup_manifest');
 const m=JSON.parse(await fs.readFile(manifestFile,'utf8'));
 if(m.schema!=='evercraft.worlds.private-backup.v1'||!Array.isArray(m.records)||m.records.length>2000)throw Error('invalid_backup_manifest');
 const actual=await fs.readdir(backup);
 const expected=new Set(['manifest.json',...m.records.map(x=>x.name)]);
 if(actual.length!==expected.size||actual.some(x=>!expected.has(x)))throw Error('backup_file_set_mismatch');
 const seen=new Set();
 for(const record of m.records){
  if(!ID.test(record.name)||seen.has(record.name)||!Number.isInteger(record.version)||!/^[a-f0-9]{64}$/.test(record.sha256))throw Error('invalid_backup_entry');
  seen.add(record.name);
  const file=path.join(backup,record.name),stat=await fs.lstat(file);
  if(stat.isSymbolicLink()||!stat.isFile())throw Error('backup_file_unsafe');
  const bytes=await fs.readFile(file),row=checkedRecord(bytes,record.name);
  if(row.version!==record.version||sha(bytes)!==record.sha256)throw Error('backup_digest_mismatch');
 }
 return {verified:true,backup_path:backup,world_count:seen.size,manifest_sha256:sha(JSON.stringify(m))};
}
export async function restoreVaultBackup({backupPath,targetDataRoot}={}){
 if(!backupPath||!targetDataRoot)throw Error('restore_paths_required');
 const receipt=await verifyVaultBackup(backupPath);
 const target=path.resolve(targetDataRoot);
 if(within(receipt.backup_path,target)||within(target,receipt.backup_path))throw Error('restore_directory_overlap');
 try{await fs.lstat(target);throw Error('restore_target_must_not_exist');}
 catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
 await fs.mkdir(target,{mode:0o700});
 try{
  const m=JSON.parse(await fs.readFile(path.join(receipt.backup_path,'manifest.json'),'utf8'));
  for(const {name} of m.records){
   await fs.copyFile(path.join(receipt.backup_path,name),path.join(target,name),constants.COPYFILE_EXCL);
   await fs.chmod(path.join(target,name),0o600);
  }
  return {restored:true,target_data_root:target,world_count:m.records.length,manifest_sha256:receipt.manifest_sha256};
 }catch(e){await fs.rm(target,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,source,destination]=process.argv.slice(2);
 const action=command==='backup'?createVaultBackup({dataRoot:source,backupRoot:destination}):
  command==='verify'?verifyVaultBackup(source):
  command==='restore'?restoreVaultBackup({backupPath:source,targetDataRoot:destination}):
  Promise.reject(Error('Usage: backup <private-data-root> <private-backup-root> | verify <backup-dir> | restore <backup-dir> <NEW-target-dir>'));
 action.then(receipt=>console.log(JSON.stringify(receipt))).catch(e=>{console.error('Worlds vault backup failed:',e.message);process.exitCode=1;});
}
