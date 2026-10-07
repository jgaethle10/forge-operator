#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

function readJson(file){
  return JSON.parse(fs.readFileSync(file,'utf8'));
}

export function gitBlobSha(body){
  const buffer=Buffer.isBuffer(body)?body:Buffer.from(body);
  const header=Buffer.concat([Buffer.from('blob '+buffer.length),Buffer.from([0])]);
  return createHash('sha1').update(Buffer.concat([header,buffer])).digest('hex');
}

export function enforceProtectedGeneratedArtifacts({
  root=process.cwd(),
  registryPath='governance/protected-generated-artifacts.json'
}={}){
  const registry=readJson(path.resolve(root,registryPath));
  const receipts=[];
  for(const rule of registry.artifacts||[]){
    if(rule.rule!=='preserve_exactly_until_explicit_rivet_approval') continue;
    const target=path.resolve(root,rule.path);
    const approved=path.resolve(root,rule.approved_source_path||'');
    if(!fs.existsSync(approved)) throw new Error('protected_generated_artifact_approved_source_missing:'+rule.path);
    const approvedBody=fs.readFileSync(approved);
    if(gitBlobSha(approvedBody)!==rule.git_blob_sha) throw new Error('protected_generated_artifact_approved_source_drift:'+rule.path);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(approved,target);
    const materializedSha=gitBlobSha(fs.readFileSync(target));
    if(materializedSha!==rule.git_blob_sha) throw new Error('protected_generated_artifact_materialization_drift:'+rule.path);
    receipts.push({
      path:rule.path,
      authority:rule.authority||null,
      approved_source_path:rule.approved_source_path,
      git_blob_sha:materializedSha,
      state:'restored_exact_approved_bytes'
    });
  }
  return {
    schema:'evercraft.protected-generated-artifacts.enforcement.v1',
    protected_count:receipts.length,
    production_authority_granted:false,
    artifacts:receipts
  };
}

const isCli=fileURLToPath(import.meta.url)===path.resolve(process.argv[1]||'');
if(isCli){
  try{
    process.stdout.write(JSON.stringify(enforceProtectedGeneratedArtifacts(),null,2)+'\n');
  }catch(error){
    process.stderr.write(JSON.stringify({ok:false,error:String(error?.message||error)},null,2)+'\n');
    process.exitCode=1;
  }
}
