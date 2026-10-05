import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  validateWorldForgeProject,
  worldForgeDigest,
  type WorldForgeProject,
} from './world-forge.js';

export interface WorldForgeStoreReceipt {
  schema:'evercraft.fallen.world-forge-store-receipt.v1';
  projectId:string;
  projectVersion:number;
  projectDigest:string;
  previousVersion:number|null;
  previousDigest:string|null;
  storage:'owned_filesystem';
  atomicWrite:true;
  createdAt:string;
}

export interface WorldForgeStoredProjectSummary {
  id:string;
  title:string;
  version:number;
  digest:string;
  updatedAt:string;
}

function validProjectId(id:string){
  return /^[a-z0-9][a-z0-9._-]{0,127}$/i.test(id);
}

function assertProjectId(id:string){
  if(!validProjectId(id)) throw new Error(`world_forge_store_project_id_invalid:${id}`);
}

function projectPath(rootDir:string,id:string){
  assertProjectId(id);
  return path.join(path.resolve(rootDir),`${id}.world-forge.json`);
}

function parseProject(filePath:string):WorldForgeProject{
  const parsed=JSON.parse(fs.readFileSync(filePath,'utf8')) as WorldForgeProject;
  const validation=validateWorldForgeProject(parsed);
  if(validation.status!=='accepted'){
    throw new Error(`world_forge_store_project_invalid:${validation.errors.join('|')}`);
  }
  return parsed;
}

export function loadWorldForgeProject(input:{
  rootDir:string;
  projectId:string;
}):WorldForgeProject|null{
  const filePath=projectPath(input.rootDir,input.projectId);
  if(!fs.existsSync(filePath)) return null;
  return parseProject(filePath);
}

export function saveWorldForgeProject(input:{
  rootDir:string;
  project:WorldForgeProject;
  expectedStoredVersion?:number|null;
}):WorldForgeStoreReceipt{
  const validation=validateWorldForgeProject(input.project);
  if(validation.status!=='accepted'){
    throw new Error(`world_forge_store_rejected_invalid_project:${validation.errors.join('|')}`);
  }
  assertProjectId(input.project.id);

  const root=path.resolve(input.rootDir);
  fs.mkdirSync(root,{recursive:true,mode:0o700});

  const filePath=projectPath(root,input.project.id);
  const existing=fs.existsSync(filePath)?parseProject(filePath):null;
  const expected=input.expectedStoredVersion;

  if(expected!==undefined){
    const actual=existing?.version??null;
    if(actual!==expected){
      throw new Error(`world_forge_store_version_conflict:expected=${String(expected)}:actual=${String(actual)}`);
    }
  }

  const previousVersion=existing?.version??null;
  const previousDigest=existing?worldForgeDigest(existing):null;
  const payload=JSON.stringify(input.project,null,2)+'\n';
  const tempName=`.${input.project.id}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const tempPath=path.join(root,tempName);

  try{
    fs.writeFileSync(tempPath,payload,{encoding:'utf8',mode:0o600,flag:'wx'});
    fs.renameSync(tempPath,filePath);
  }finally{
    if(fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }

  return {
    schema:'evercraft.fallen.world-forge-store-receipt.v1',
    projectId:input.project.id,
    projectVersion:input.project.version,
    projectDigest:validation.digest,
    previousVersion,
    previousDigest,
    storage:'owned_filesystem',
    atomicWrite:true,
    createdAt:new Date().toISOString(),
  };
}

export function listWorldForgeProjects(input:{
  rootDir:string;
  limit?:number;
}):WorldForgeStoredProjectSummary[]{
  const root=path.resolve(input.rootDir);
  if(!fs.existsSync(root)) return [];
  const limit=Math.max(1,Math.min(500,input.limit??100));
  const rows:WorldForgeStoredProjectSummary[]=[];

  for(const name of fs.readdirSync(root).sort()){
    if(!name.endsWith('.world-forge.json')) continue;
    if(rows.length>=limit) break;
    const id=name.slice(0,-'.world-forge.json'.length);
    if(!validProjectId(id)) continue;
    try{
      const project=parseProject(path.join(root,name));
      rows.push({
        id:project.id,
        title:project.title,
        version:project.version,
        digest:worldForgeDigest(project),
        updatedAt:project.updatedAt,
      });
    }catch{
      continue;
    }
  }

  return rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
