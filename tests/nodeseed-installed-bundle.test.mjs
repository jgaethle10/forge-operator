import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {cp,rm} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');

test('installed NodeSeed bundle resolves every runtime import without repository context',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-installed-bundle-'));
 try{
  await cp(path.join(ROOT,'systemia'),path.join(root,'systemia'),{recursive:true});
  fs.mkdirSync(path.join(root,'infra'),{recursive:true});
  await cp(path.join(ROOT,'infra/evercraft-edge'),path.join(root,'infra/evercraft-edge'),{recursive:true});
  await cp(path.join(ROOT,'registry'),path.join(root,'registry'),{recursive:true});
  fs.mkdirSync(path.join(root,'public'),{recursive:true});
  await cp(path.join(ROOT,'public/faie'),path.join(root,'public/faie'),{recursive:true});
  assert.equal(fs.existsSync(path.join(root,'public/faie/index.html')),true);
  const target=pathToFileURL(path.join(root,'systemia/compute/node-seed.mjs')).href;
  await assert.doesNotReject(()=>import(target));
 }finally{
  await rm(root,{recursive:true,force:true});
 }
});
