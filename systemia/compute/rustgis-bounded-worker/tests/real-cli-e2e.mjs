#!/usr/bin/env node
// Offline execution acceptance. Requires externally downloaded and integrity-checked
// RustGIS v0.2.0 Linux CLI; no downloads or issuer credentials are needed.
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {execute,stable,sha} from '../src/worker.mjs';
import {reconcileRustgisSabanEvidence} from '../src/saban-evidence-bridge.mjs';
const approvedHash='2481682c2e9f7577565b91d35b256109eb7d4f25ebe9e795f0a19fe4ce86917b';
if(!process.argv[2]){console.error('Usage: node tests/real-cli-e2e.mjs /path/to/checksum-pinned/rustgis-cli');process.exit(2);}
const binary=await realpath(process.argv[2]);
if(sha(await readFile(binary))!==approvedHash){console.error('HELD: RustGIS binary hash does not match official v0.2.0 Linux asset binary');process.exit(20);}
const root=await mkdtemp(join(tmpdir(),'evercraft-rustgis-e2e-'));
const input=join(root,'input'),output=join(root,'output'),ledger=join(root,'ledger'),trust=join(root,'trust');
for(const p of [input,output,ledger,trust])await mkdir(p);
const dataset='canary_baseline.geojson';
await copyFile(resolve(import.meta.dirname,'../fixtures',dataset),join(input,dataset));
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const pub=join(trust,'public.pem');await writeFile(pub,publicKey.export({type:'spki',format:'pem'}));
const cfg={schema:'evercraft.rustgis.worker-config.v1',mode:'isolated_canary',remote_jobs_enabled:false,node_id:'evercraft-local-real-canary',mission_key:'evercraft-rustgis-geospatial-engine-evaluation-20261013',rustgis_binary:binary,pinned_binary_sha256:approvedHash,input_root:input,output_root:output,ledger_root:ledger,trusted_public_key_path:pub,timeout_ms:30000};
const configPath=join(root,'config.json');await writeFile(configPath,JSON.stringify(cfg));
const results=[];
try {
 for(const operation of ['render','buffer_100m']) {
   const now=Date.now(),suffix=operation.replace(/_/g,'-');
   const job={schema:'evercraft.rustgis.job.v1',job_id:'signed-real-'+suffix,mission_key:cfg.mission_key,target_node_id:cfg.node_id,issued_at:new Date(now).toISOString(),expires_at:new Date(now+120000).toISOString(),nonce:'nonce-'+suffix,operation,dataset,dataset_sha256:sha(await readFile(join(input,dataset))),expected_binary_sha256:approvedHash,synthetic_only:true};
   const signature=sign(null,Buffer.from(stable(job)),privateKey).toString('base64');
   const jobPath=join(root,operation+'.job.json'),permitPath=join(root,operation+'.permit.json');
   await writeFile(jobPath,JSON.stringify(job));await writeFile(permitPath,JSON.stringify({schema:'evercraft.rustgis.permit.v1',job_id:job.job_id,signature}));
   const receipt=await execute({configPath,jobPath,permitPath});
   if(receipt.state!=='verified'||receipt.feature_count!==41)throw Error('Real engine feature check failed');
   const art=receipt.artifacts?.[0];
   const bytes=await readFile(join(output,job.job_id,art.file));
   if(sha(bytes)!==art.sha256)throw Error('Artifact hash mismatch');
   if(operation==='render' && (bytes.readUInt32BE(16)!==640||bytes.readUInt32BE(20)!==420))throw Error('PNG dimensions wrong');
   const assignment = {
     agent_id:'agent-real-canary-review',role:'geospatial_canary_guard',
     idempotency_key:job.job_id,work:{key:job.job_id,raw:{job_id:job.job_id}}
   };
   const intake=reconcileRustgisSabanEvidence({
     assignment, job,
     permit:{schema:'evercraft.rustgis.permit.v1',job_id:job.job_id,signature},
     trustedIssuerPublicKey:publicKey.export({type:'spki',format:'pem'}),
     workerReceipt:receipt,artifactBytes:bytes,expectedNodeId:cfg.node_id
   });
   if(intake.state!=='verified_synthetic_evidence_only' ||
      intake.dispatch_allowed!==false || intake.systemia_release_ready!==false){
     throw Error('Saban evidence intake must remain read-only');
   }
   results.push({operation,features:receipt.feature_count,artifact:art,receipt_sha256:sha(await readFile(join(output,job.job_id,'receipt.json'))),saban_evidence_sha256:intake.evidence_sha256});
 }
 console.log(JSON.stringify({schema:'evercraft.rustgis.worker-e2e.v1',status:'verified_synthetic_runtime_only',real_binary_sha256:approvedHash,signatures:true,remote_jobs_enabled:false,artifacts:results,physical_evercraft_worker_connected:false,systemia_release_state:'held'},null,2));
} finally {
 if(process.env.EVERCRAFT_KEEP_TEST_OUTPUT==='1')console.log('TEST_OUTPUT_DIR:',root);
 else await rm(root,{recursive:true,force:true});
}
