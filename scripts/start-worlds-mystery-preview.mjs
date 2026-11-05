#!/usr/bin/env node
/**
 * One-command private, temporary preview of the existing Evercraft Worlds app.
 * Reuses the owned Worlds Vault. No new renderer, cloud service, paid runtime,
 * deployment, publication, account connection, or remote listener.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startWorldsVault} from '../systemia/worlds/worlds-vault-runtime.mjs';

const repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let server;
let dataRoot;
try {
  dataRoot=await fs.mkdtemp(path.join(os.tmpdir(),'evercraft-mystery-preview-'));
  server=await startWorldsVault({
    host:'127.0.0.1',
    port:0,
    publicRoot:path.join(repositoryRoot,'public'),
    dataRoot
  });
  const url=server.url+'/worlds/';
  process.stdout.write('EVERCRAFT WORLDS | PRIVATE MYSTERY WALK\n');
  process.stdout.write('Open in this computer\u2019s browser: '+url+'\n');
  process.stdout.write('Select "Investigate a mystery" or "Mystery Walk".\n');
  process.stdout.write('This is a fictional, rule-based local preview. No independent AI agents.\n');
  process.stdout.write('Only 127.0.0.1 is listening. Press Ctrl+C to shut down.\n');
  await new Promise(resolve=>{
    process.once('SIGINT',resolve);
    process.once('SIGTERM',resolve);
  });
} finally {
  if(server)await server.close();
  if(dataRoot)await fs.rm(dataRoot,{recursive:true,force:true});
}
