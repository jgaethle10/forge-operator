import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  generateRecipientKeyFiles,loadPrivateOperatorConfig,
  readPinnedRelay,runHarborLineageOperator
} from './harbor-lineage-operator-cli.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

async function sandbox(fn){
  const d=await fsp.mkdtemp(path.join(os.tmpdir(),'harbor-operator-private-'));
  await fsp.chmod(d,0o700);
  try{await fn(d);}finally{await fsp.rm(d,{recursive:true,force:true});}
}
test('receiver identity generated only in 0700 directory; private key is 0600 and cannot be overwritten',()=>sandbox(async d=>{
  const privateKeyPath=path.join(d,'identity-private.pem'),publicKeyPath=path.join(d,'identity-public.pem');
  const result=generateRecipientKeyFiles({privateKeyPath,publicKeyPath});
  assert.equal(result.trustState,'CREATED_NOT_OWNER_ATTESTED');
  assert.equal(result.privateKeyMaterialExported,false);
  assert.equal(result.publicKeySha256,sha(crypto.createPublicKey(
    await fsp.readFile(publicKeyPath,'utf8')).export({format:'der',type:'spki'})));
  assert.equal((await fsp.stat(privateKeyPath)).mode & 0o077,0);
  assert.throws(()=>generateRecipientKeyFiles({privateKeyPath,publicKeyPath}),/refuse_key_overwrite/);
}));
test('operator loads only private, regular and non-symlink config files',()=>sandbox(async d=>{
  const config=path.join(d,'private.json');
  await fsp.writeFile(config,JSON.stringify({one:1}),{mode:0o600});
  assert.equal(loadPrivateOperatorConfig(config).one,1);
  await fsp.chmod(config,0o644);
  assert.throws(()=>loadPrivateOperatorConfig(config),/private_file_permissions_or_type_invalid/);
  await fsp.chmod(config,0o600);
  const link=path.join(d,'link.json');await fsp.symlink(config,link);
  assert.throws(()=>loadPrivateOperatorConfig(link),/private_file_permissions_or_type_invalid/);
}));
test('outbound relay requires exact owner pin, HTTPS, and 0600 token',()=>sandbox(async d=>{
  const tokenPath=path.join(d,'relay-token');
  await fsp.writeFile(tokenPath,'synthetic-private-authorization-123',{mode:0o600});
  const env={EVERCRAFT_OWNER_APPROVED_LINEAGE_RELAY_URL:'https://owned.invalid/relay',
    EVERCRAFT_LINEAGE_RELAY_TOKEN_FILE:tokenPath};
  assert.throws(()=>readPinnedRelay({relayUrl:'https://attacker.invalid/relay'},env),/relay_not_owner_pinned/);
  assert.throws(()=>readPinnedRelay({relayUrl:'http://owned.invalid/relay'},{
    ...env,EVERCRAFT_OWNER_APPROVED_LINEAGE_RELAY_URL:'http://owned.invalid/relay'
  }),/relay_https_only/);
  await fsp.chmod(tokenPath,0o644);
  assert.throws(()=>readPinnedRelay({relayUrl:env.EVERCRAFT_OWNER_APPROVED_LINEAGE_RELAY_URL},env),/private_file_permissions_or_type_invalid/);
  await fsp.chmod(tokenPath,0o600);
  const remote=readPinnedRelay({relayUrl:env.EVERCRAFT_OWNER_APPROVED_LINEAGE_RELAY_URL},env);
  assert.equal(typeof remote.hasChunk,'function');
}));
test('operator stage mode creates 12-file encrypted custody candidate; never sends',()=>sandbox(async d=>{
  const assetsDir=path.join(d,'originals');await fsp.mkdir(assetsDir,{mode:0o700});
  const manifest={schema:'evercraft.harbor.private-media-manifest.v1',assets:[]};
  for(let i=0;i<12;i++){
    const filename='asset-'+String(i).padStart(2,'0')+'.jpg';
    const b=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(100+i,i)]);
    await fsp.writeFile(path.join(assetsDir,filename),b);
    manifest.assets.push({filename,bytes:b.length,sha256:sha(b),mediaType:'image/jpeg'});
  }
  const manifestPath=path.join(d,'manifest.json');
  await fsp.writeFile(manifestPath,JSON.stringify(manifest),{mode:0o600});
  const privateKeyPath=path.join(d,'private.pem'),publicKeyPath=path.join(d,'public.pem');
  const keys=generateRecipientKeyFiles({privateKeyPath,publicKeyPath});
  const packagePath=path.join(d,'package.json');
  const r=await runHarborLineageOperator('stage',{manifestPath,assetsDir,
    storeDir:path.join(d,'encrypted-store'),packagePath,
    jobRef:'order-0123456',recipientPublicKeyPath:publicKeyPath,
    recipientPublicKeyFingerprint:keys.publicKeySha256});
  assert.equal(r.status,'ENCRYPTED_STAGED_NOT_TRANSFERRED');
  assert.equal(r.sourceAssetCount,12);
  assert.equal(r.authority.delivery,false);
  const descriptor=JSON.parse(await fsp.readFile(packagePath,'utf8'));
  assert.equal(descriptor.assets.length,12);
  assert.equal(descriptor.boundaries.previewRelease,false);
  assert.equal((await fsp.stat(packagePath)).mode & 0o077,0);
}));
test('unsupported modes fail closed',async()=>{
  await assert.rejects(runHarborLineageOperator('publish',{}),/unsupported_mode/);
});
