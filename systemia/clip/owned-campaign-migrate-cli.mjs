#!/usr/bin/env node
// Operator-only offline migration entrypoint; does NOT call Base44 or any social provider.
// Writes no legacy data until --commit is explicitly provided.
import fs from 'node:fs';
import path from 'node:path';
import {prepareOwnedClipSnapshot,inspectOwnedClipSnapshot,stageOwnedClipSnapshot} from './owned-campaign-migration.mjs';

const args=process.argv.slice(2);
const flag=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const exportPath=flag('--export');
const stateDir=flag('--state-dir')||process.env.EVERCRAFT_CLIP_STATE_DIR;
const commit=args.includes('--commit');
if(!exportPath){console.error('Usage: node systemia/clip/owned-campaign-migrate-cli.mjs --export PRIVATE_EXPORT.json [--state-dir PRIVATE_STATE_DIR] [--commit]');process.exitCode=2;}
else {
 try{
  const source=JSON.parse(fs.readFileSync(path.resolve(exportPath),'utf8'));
  const snapshot=prepareOwnedClipSnapshot(source);
  const validation=inspectOwnedClipSnapshot(snapshot);
  if(commit&&!stateDir)throw new Error('Private --state-dir / EVERCRAFT_CLIP_STATE_DIR is required for --commit');
  const result=commit?stageOwnedClipSnapshot({snapshot,stateDir}):{status:'DRY_RUN_ONLY'};
  console.log(JSON.stringify({schema:'evercraft.clip.migration-operation-receipt.v1',
    mode:commit?'stage_private':'inspect_only',
    status:result.status,source_sha256:snapshot.content_sha256,
    counts:validation.counts,cutover_proven:false,publish_authority_granted:false,
    media_migrated:false,provider_credentials_migrated:false},null,2));
 }catch(error){console.error('OWNED_CLIP_MIGRATION_REJECTED:'+String(error?.message||error));process.exitCode=1;}
}
