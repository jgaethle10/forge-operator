import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createWorldForgeStarterProject } from './world-forge-http.js';
import {
  listWorldForgeProjects,
  loadWorldForgeProject,
  saveWorldForgeProject,
} from './world-forge-store.js';
import { worldForgeDigest } from './world-forge.js';

test('World Forge store saves and reloads exact canonical project state',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'world-forge-store-'));
  try{
    const project=createWorldForgeStarterProject();
    const receipt=saveWorldForgeProject({
      rootDir:root,
      project,
      expectedStoredVersion:null,
    });
    assert.equal(receipt.storage,'owned_filesystem');
    assert.equal(receipt.atomicWrite,true);
    assert.equal(receipt.previousVersion,null);

    const loaded=loadWorldForgeProject({rootDir:root,projectId:project.id});
    assert.ok(loaded);
    assert.equal(worldForgeDigest(loaded!),worldForgeDigest(project));
    assert.equal(loaded?.version,project.version);

    const rows=listWorldForgeProjects({rootDir:root});
    assert.equal(rows.length,1);
    assert.equal(rows[0].digest,worldForgeDigest(project));
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('World Forge store enforces optimistic version checks',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'world-forge-store-'));
  try{
    const project=createWorldForgeStarterProject();
    saveWorldForgeProject({rootDir:root,project,expectedStoredVersion:null});

    assert.throws(
      ()=>saveWorldForgeProject({
        rootDir:root,
        project:{...project,version:2},
        expectedStoredVersion:null,
      }),
      /world_forge_store_version_conflict/,
    );

    const next={...project,version:2,updatedAt:new Date(Date.now()+1000).toISOString()};
    const receipt=saveWorldForgeProject({
      rootDir:root,
      project:next,
      expectedStoredVersion:1,
    });
    assert.equal(receipt.previousVersion,1);
    assert.equal(receipt.projectVersion,2);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('World Forge store rejects path traversal project ids',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'world-forge-store-'));
  try{
    assert.throws(
      ()=>loadWorldForgeProject({rootDir:root,projectId:'../../escape'}),
      /world_forge_store_project_id_invalid/,
    );
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
