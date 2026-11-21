import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fingerprintPublicKey,createNodeAttestation} from '../systemia/compute/device-identity.mjs';
import {projectPinnedNodeIdentity} from '../systemia/organism/mission-control-identity.mjs';
import {buildLocalMissionSnapshot} from '../systemia/organism/mission-control-local-reader.mjs';
import {parseOperatorSnapshot} from '../public/live/mission-source.mjs';

function identity(id='node-test-001'){
 const keys=generateKeyPairSync('ed25519');
 const publicPem=keys.publicKey.export({type:'spki',format:'pem'});
 const privatePem=keys.privateKey.export({type:'pkcs8',format:'pem'});
 return {node_id:id,public_key_pem:publicPem,private_key_pem:privatePem,
  fingerprint:fingerprintPublicKey(publicPem)};
}
const nonce='owner-verified-challenge-20261116';

test('valid signed node challenge matches pin and only yields a sanitized identity claim',()=>{
 const key=identity();
 const now=Date.now();
 const receipt=createNodeAttestation({identity:key,nonce,observedAt:new Date(now)});
 const result=projectPinnedNodeIdentity(receipt,{
  nodeKey:'node001',expectedNodeId:key.node_id,expectedNonce:nonce,
  trustedPublicKeyPem:key.public_key_pem,now
 });
 assert.equal(result.verification,'pinned_signature_verified');
 const serialized=JSON.stringify(result);
 assert.doesNotMatch(serialized,/BEGIN PUBLIC KEY|\\"signature\\"|nonce|fingerprint|node-test-001|owner-verified-challenge/i);
 assert.match(result.note,/Remote connectivity/);
});

test('untrusted signing key, wrong challenge, wrong node ID, modified statement and old receipt fail closed',()=>{
 const key=identity();
 const evil=identity();
 const now=Date.now();
 const att=createNodeAttestation({identity:key,nonce,observedAt:new Date(now)});
 const good={nodeKey:'node001',expectedNodeId:key.node_id,expectedNonce:nonce,trustedPublicKeyPem:key.public_key_pem,now};
 assert.throws(()=>projectPinnedNodeIdentity(att,{...good,trustedPublicKeyPem:evil.public_key_pem}),/differs from operator pin/);
 assert.throws(()=>projectPinnedNodeIdentity(att,{...good,expectedNonce:'different-challenge-12345'}),/nonce_mismatch/);
 assert.throws(()=>projectPinnedNodeIdentity(att,{...good,expectedNodeId:'node-test-002'}),/node_mismatch/);
 assert.throws(()=>projectPinnedNodeIdentity({...att,statement:{...att.statement,runtime:'tampered'}},good),/signature_invalid/);
 assert.throws(()=>projectPinnedNodeIdentity(att,{...good,now:now+61000}),/attestation_stale/);
 assert.throws(()=>projectPinnedNodeIdentity({...att,statement:{...att.statement,field_claim:true}},good),/self_claim_field/);
});

test('identity-only explicit reader excludes raw key, challenge and receipt, and browser import stays untrusted',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'mission-id-proof-'));
 try{
  const key=identity();const now=Date.now();
  const receipt=createNodeAttestation({identity:key,nonce,observedAt:new Date(now)});
  const [file,keyFile,nonceFile]=['att.json','pinned.pem','challenge.txt'].map(x=>path.join(dir,x));
  await writeFile(file,JSON.stringify(receipt),{mode:0o600});
  await writeFile(keyFile,key.public_key_pem,{mode:0o600});
  await writeFile(nonceFile,nonce+'\n',{mode:0o600});
  const args={nodeKey:'node001',file,keyFile,nonceFile,expectedNodeId:key.node_id};
  const result=await buildLocalMissionSnapshot({nodeIdentityProofs:[args],now});
  assert.equal(result.missions.length,0);
  assert.equal(result.nodes.length,0);
  assert.equal(result.identity_checks[0].verification,'pinned_signature_verified');
  assert.doesNotMatch(JSON.stringify(result),/BEGIN PUBLIC KEY|owner-verified-challenge|node-test-001|att\.json|pinned\.pem/);
  const cliOut=path.join(dir,'identity-export.json');
  const exporter=fileURLToPath(new URL('../systemia/organism/mission-control-export.mjs',import.meta.url));
  const cli=spawnSync(process.execPath,[exporter,
   '--node001-attestation',file,'--node001-public-key',keyFile,
   '--node001-nonce-file',nonceFile,'--node001-id',key.node_id,
   '--out',cliOut],{encoding:'utf8',timeout:10000});
  assert.equal(cli.status,0,cli.stderr);
  const exported=JSON.parse(await readFile(cliOut,'utf8'));
  assert.equal(exported.identity_checks.length,1);
  assert.equal(exported.nodes.length,0);
  assert.match(cli.stdout,/1 pinned identity check/);
  const view=parseOperatorSnapshot(result,now);
  assert.equal(view.identity_checks[0].verification,'operator_reported_key_check');
  assert.match(view.identity_checks[0].provenance,/NOT BROWSER-AUTHENTICATED/);
  const expired=parseOperatorSnapshot(result,now+61000);
  assert.equal(expired.identity_checks[0].verification,'expired');
  await assert.rejects(buildLocalMissionSnapshot({nodeIdentityProofs:[{...args,nonceFile:keyFile}],now}),/duplicate/);
  await assert.rejects(buildLocalMissionSnapshot({nodeIdentityProofs:[{...args,expectedNodeId:'node-test-999'}],now}),/node_mismatch/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('public UI leaves node health unknown and does not offer privileged actions',async()=>{
 const {readFile}=await import('node:fs/promises');
 const root=new URL('../public/live/',import.meta.url);
 const html=await readFile(new URL('mission-control.html',root),'utf8');
 const js=await readFile(new URL('mission-control.mjs',root),'utf8');
 assert.match(html,/HEALTH UNKNOWN/);
 assert.match(html,/id="localIdentityChecks"/);
 assert.match(js,/SIGNED IDENTITY CLAIM EXPIRED/);
 assert.match(js,/OWNER-PINNED SIGNATURE CHECK REPORTED/);
 assert.doesNotMatch(js,/executeMission\(|authorizePayment\(|fetch\([^\n]*method:\s*['"]POST/);
});
