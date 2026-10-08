#!/usr/bin/env node
/**
 * Ephemeral native Lineage acceptance proof for Systemia's first-offer mission.
 * It proves native snapshot -> fsck -> Git mirror byte parity. Does NOT persist
 * on a production Yard remote or grant publication/payment authority.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { LineageStore } from '../lineage/core.mjs';
import { verifyLineageIntegrity } from '../lineage/fsck.mjs';
import { exportLineageSnapshotToGit } from '../lineage/git-bridge.mjs';
import { firstOfferMission, firstOfferReadiness, OFFER_ONE } from './first-offer-command.mjs';

export async function proveFirstOfferNativeLineage({now=new Date()}={}){
 const root=await mkdtemp(join(tmpdir(),'evercraft-offer1-lineage-'));
 const gitRoot=await mkdtemp(join(tmpdir(),'evercraft-offer1-mirror-'));
 try{
  const mission=firstOfferMission({now});
  const readiness=firstOfferReadiness({now});
  const artifact={
   schema:'evercraft.systemia.offer-one-lineage-artifact.v1',
   mission_key:OFFER_ONE.mission_key,
   receipt_hash:mission.receipt.receipt_hash,
   read_only_admission:true,
   runtime_execution_performed:false,
   authoritative_order_verified:false,
   readiness,
  };
  const bytes=JSON.stringify(artifact,null,2)+'\n';
  await writeFile(join(root,'mission.json'),bytes,{mode:0o600});
  const store=new LineageStore(root);
  await store.init({branch:'offer-1'});
  const commit=await store.commit({
    message:'Systemia Offer #1 read-only evidence checkpoint',
    actor:{type:'agent',id:'systemia-offer-one-proof'},
    rationale:'Preserve exact Company Board mission evidence without inferring live deployment or paid orders.',
    provenance:{sources:['systemia/organism/first-offer-command.mjs'],evidence:[mission.receipt.receipt_hash],rights:[]},
    authority:{mutation:false,publish:false,payment:false,deploy:false},
  });
  assert.match(commit.commit_id,/^[a-f0-9]{64}$/);
  assert.equal(await store.resolveRef('offer-1'),commit.commit_id);
  const integrity=await verifyLineageIntegrity(store);
  assert.equal(integrity.ok,true,JSON.stringify(integrity.errors));
  const mirror=await exportLineageSnapshotToGit(store,{
    commitish:commit.commit_id,repository:gitRoot,branch:'offer-1-mirror',expectedGitHead:null
  });
  assert.equal(mirror.lineage_commit,commit.commit_id);
  assert.equal(mirror.lossless_artifact_bytes,true);
  const check=spawnSync('git',['show',mirror.git_commit_sha+':mission.json'],{
    cwd:gitRoot,encoding:'utf8'
  });
  assert.equal(check.status,0,check.stderr);
  assert.equal(check.stdout,bytes);
  return {
   schema:'evercraft.systemia.offer-one-native-lineage-proof.v1',
   mission_key:OFFER_ONE.mission_key,
   lineage_commit:commit.commit_id,
   integrity_ok:true,
   git_mirror_commit:mirror.git_commit_sha,
   git_artifact_byte_parity:true,
   checked_at:now instanceof Date?now.toISOString():new Date(now).toISOString(),
   source_only_ephemeral_proof:true,
   durable_lineage_remote_persisted:false,
   production_deployed:false,
   public_url_verified:false,
   order_verified:false,
   payment_verified:false,
  };
 }finally{
  await rm(root,{recursive:true,force:true});
  await rm(gitRoot,{recursive:true,force:true});
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const receipt=await proveFirstOfferNativeLineage();
 process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}
