import crypto from 'node:crypto';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { LargeObjectStore } from '../lineage/large-object.mjs';
import { pushLargeObject, fetchLargeObject } from '../lineage/large-object-remote.mjs';
import { verifyPrivateMediaImport, SCHEMA as SOURCE_SCHEMA } from '../../scripts/nextgen/verify-harbor-private-media-import.mjs';

export const HANDOFF_SCHEMA = 'evercraft.harbor-fallen.encrypted-lineage-handoff.v1';
const HEX = /^[a-f0-9]{64}$/;
const SAFE_JOB = /^[a-zA-Z0-9._-]{6,100}$/;
const maxAssetCount = 12;

function fail(code) { throw new Error('harbor_fallen_' + code); }
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function validKey(key, kind) {
  const k = kind === 'public' ? crypto.createPublicKey(key) : crypto.createPrivateKey(key);
  if (k.asymmetricKeyType !== 'x25519') fail('x25519_key_required');
  return k;
}
function deriveKey(shared, salt, jobRef, i) {
  return Buffer.from(crypto.hkdfSync('sha256', shared, salt, Buffer.from(
    'evercraft-harbor-fallen-private-media-v1:' + jobRef + ':' + i), 32));
}
function aad(jobRef, asset, i) {
  return Buffer.from(JSON.stringify({
    schema: HANDOFF_SCHEMA, jobRef, index: i,
    filename: asset.filename, bytes: asset.bytes, sha256: asset.sha256,
    mediaType: asset.mediaType
  }));
}
function checkPackage(p, expectedCount = maxAssetCount) {
  if (!p || p.schema !== HANDOFF_SCHEMA || !SAFE_JOB.test(p.jobRef || '') ||
    !Array.isArray(p.assets) || p.assets.length !== expectedCount ||
    p.sourceManifest?.schema !== SOURCE_SCHEMA ||
    !Array.isArray(p.sourceManifest.assets) ||
    p.sourceManifest.assets.length !== expectedCount) fail('package_schema_or_asset_count');
  if (!p.ephemeralPublicKey || !p.salt || !/^[A-Za-z0-9+/]{43}=$/.test(p.salt)) fail('package_key_material');
  validKey(p.ephemeralPublicKey, 'public');
  const names = new Set(), ids = new Set();
  for (let i=0;i<p.assets.length;i++) {
    const row = p.assets[i], source = p.sourceManifest.assets[i];
    if (!row || row.index !== i || !source || row.filename !== source.filename ||
      row.sourceSha256 !== source.sha256 || row.bytes !== source.bytes ||
      row.mediaType !== source.mediaType ||
      !/^[^\\/\x00-\x1f\x7f]{1,200}$/.test(row.filename) ||
      row.filename==='.' || row.filename==='..' || row.filename.startsWith('.') ||
      names.has(row.filename.toLowerCase()) ||
      !HEX.test(row.sourceSha256 || '') ||
      !Number.isSafeInteger(row.bytes) || row.bytes <= 0 || row.bytes > 2*1024**3 ||
      !HEX.test(row.cipherManifestId || '') || ids.has(row.cipherManifestId) ||
      !/^[A-Za-z0-9+/]{16}$/.test(row.nonce || '') ||
      !/^[A-Za-z0-9+/]{22}==$/.test(row.authTag || '')) fail('package_asset_invalid');
    names.add(row.filename.toLowerCase()); ids.add(row.cipherManifestId);
  }
  return p;
}
async function hashedPipeline(input, crypt, output) {
  const hash=crypto.createHash('sha256');
  let bytes=0;
  const meter=new Transform({ transform(chunk,enc,cb) {
    bytes+=chunk.length; hash.update(chunk); cb(null,chunk);
  }});
  await pipeline(fs.createReadStream(input), meter, crypt, fs.createWriteStream(output, {flags:'wx',mode:0o600}));
  return {sha256:hash.digest('hex'),bytes};
}
async function existingPath(p) {
  try {await fsp.lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}
}
function requirePrivateDescriptorFile(file) {
  const st=fs.lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink() || st.size>100_000 || st.nlink!==1)
    fail('descriptor_not_regular');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}

/** Prepare a private, encrypted, untrusted custody candidate. No upload or job authority. */
export async function stageHarborEncryptedHandoff({
  manifestPath, assetsDir, storeDir, packagePath, jobRef,
  recipientPublicKeyPem, expectedCount = maxAssetCount
}={}) {
  if (!SAFE_JOB.test(jobRef || '')) fail('job_ref_invalid');
  if (expectedCount < 1 || expectedCount > maxAssetCount) fail('expected_count_invalid');
  if (await existingPath(packagePath)) fail('package_already_exists');
  const sourceReceipt=await verifyPrivateMediaImport({
    manifestPath,assetDir:assetsDir,operatorRef:'harbor-private-sender',expectedCount
  });
  const sourceManifest=requirePrivateDescriptorFile(manifestPath);
  const recipient=validKey(recipientPublicKeyPem, 'public');
  const ephemeral=crypto.generateKeyPairSync('x25519');
  const publicPem=ephemeral.publicKey.export({format:'pem',type:'spki'}).toString();
  const salt=crypto.randomBytes(32), shared=crypto.diffieHellman({privateKey:ephemeral.privateKey, publicKey:recipient});
  const store=new LargeObjectStore(storeDir);
  await store.init();
  const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'fallen-encrypt-'));
  await fsp.chmod(temp,0o700);
  const rows=[];
  try {
    for (let i=0;i<sourceManifest.assets.length;i++) {
      const a=sourceManifest.assets[i];
      const key=deriveKey(shared,salt,jobRef,i),nonce=crypto.randomBytes(12);
      const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);
      cipher.setAAD(aad(jobRef,a,i));
      const encrypted=path.join(temp,'cipher-'+i+'.bin');
      const copied=await hashedPipeline(path.join(assetsDir,a.filename),cipher,encrypted);
      if (copied.sha256!==a.sha256 || copied.bytes!==a.bytes) fail('source_changed_during_encrypt');
      const tag=cipher.getAuthTag();
      const object=await store.putFile(encrypted,{
        logicalName:'encrypted-asset-'+i,mediaType:'application/octet-stream'
      });
      rows.push({
        index:i,filename:a.filename,mediaType:a.mediaType,sourceSha256:a.sha256,
        bytes:a.bytes,cipherManifestId:object.manifest_id,
        nonce:nonce.toString('base64'),authTag:tag.toString('base64')
      });
      key.fill(0); await fsp.rm(encrypted,{force:true});
    }
    const descriptor=checkPackage({
      schema:HANDOFF_SCHEMA,jobRef,sourceManifest,
      ephemeralPublicKey:publicPem,salt:salt.toString('base64'),assets:rows,
      boundaries:{encryptedAtSource:true,rawCustomerMediaNotInGitHub:true,
        receiverAttested:false,systemiaAdmission:false,
        fallenProductionAccepted:false,previewRelease:false}
    },expectedCount);
    await fsp.writeFile(packagePath,JSON.stringify(descriptor,null,2)+'\n',{flag:'wx',mode:0o600});
    return {status:'ENCRYPTED_STAGED_NOT_TRANSFERRED',jobRef,
      sourceAssetCount:sourceReceipt.assetCount,
      sourceManifestSha256:sourceReceipt.manifestSha256,
      packageSha256:sha256(await fsp.readFile(packagePath)),
      objectManifestIds:rows.map(row=>row.cipherManifestId),
      authority:{storageTransfer:false,production:false,delivery:false}};
  } finally { shared.fill(0);await fsp.rm(temp,{recursive:true,force:true}); }
}

/** Caller must supply an independently authenticated, scoped Evercraft Lineage remote. */
export async function pushHarborEncryptedHandoff({packagePath,storeDir,remote,expectedCount=maxAssetCount}={}) {
  const pkg=checkPackage(requirePrivateDescriptorFile(packagePath),expectedCount);
  const store=new LargeObjectStore(storeDir);
  const objects=[];
  for(const row of pkg.assets){
    const local=await store.readManifest(row.cipherManifestId);
    if(local.media_type!=='application/octet-stream')fail('cipher_type_invalid');
    objects.push(await pushLargeObject({store,remote,manifestId:row.cipherManifestId,concurrency:2}));
  }
  return {status:'ENCRYPTED_OBJECTS_STORED_NO_PRODUCTION_AUTHORITY',
    jobRef:pkg.jobRef,objectCount:objects.length,
    transferredBytes:objects.reduce((sum,v)=>sum+v.transferred_bytes,0),
    onlyCiphertextOnRemote:true,productionAuthorized:false,previewReleaseAuthorized:false};
}

/** Verify, decrypt and atomically quarantine. Does not admit the job or send a preview. */
export async function receiveHarborEncryptedHandoff({
  packagePath,storeDir,remote,recipientPrivateKeyPem,outputDir,operatorRef,
  expectedCount=maxAssetCount
}={}) {
  const pkg=checkPackage(requirePrivateDescriptorFile(packagePath),expectedCount);
  if (!operatorRef || typeof operatorRef!=='string' || operatorRef.length>120) fail('receiving_operator_missing');
  if(await existingPath(outputDir)) fail('output_already_exists');
  const privateKey=validKey(recipientPrivateKeyPem,'private');
  const ephemeral=validKey(pkg.ephemeralPublicKey,'public');
  const shared=crypto.diffieHellman({privateKey,publicKey:ephemeral});
  const salt=Buffer.from(pkg.salt,'base64');
  const store=new LargeObjectStore(storeDir);
  const parent=path.dirname(path.resolve(outputDir));
  await fsp.mkdir(parent,{recursive:true,mode:0o700});
  const stage=await fsp.mkdtemp(path.join(parent,'.fallen-quarantine-'));
  await fsp.chmod(stage,0o700);
  const assetsDir=path.join(stage,'assets');
  await fsp.mkdir(assetsDir,{mode:0o700});
  try {
    for(let i=0;i<pkg.assets.length;i++){
      const row=pkg.assets[i];
      await fetchLargeObject({store,remote,manifestId:row.cipherManifestId,concurrency:2});
      const encrypted=path.join(stage,'.encrypted-'+i);
      await store.writeToFile(row.cipherManifestId,encrypted);
      const key=deriveKey(shared,salt,pkg.jobRef,i);
      const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(row.nonce,'base64'));
      decipher.setAAD(aad(pkg.jobRef,pkg.sourceManifest.assets[i],i));
      decipher.setAuthTag(Buffer.from(row.authTag,'base64'));
      let result;
      try{
        result=await hashedPipeline(encrypted,decipher,path.join(assetsDir,row.filename));
      }finally{key.fill(0);await fsp.rm(encrypted,{force:true});}
      if(result.sha256!==row.sourceSha256 || result.bytes!==row.bytes)fail('decrypted_source_mismatch');
    }
    const manifestFile=path.join(stage,'manifest.json');
    await fsp.writeFile(manifestFile,JSON.stringify(pkg.sourceManifest,null,2)+'\n',{mode:0o600,flag:'wx'});
    const verified=await verifyPrivateMediaImport({
      manifestPath:manifestFile,assetDir:assetsDir,operatorRef,expectedCount
    });
    await fsp.writeFile(path.join(stage,'custody-receipt.json'),JSON.stringify({
      ...verified,state:'RECEIVED_AND_REHASHED_QUARANTINE_ONLY',
      sourcePackageSha256:sha256(await fsp.readFile(packagePath)),
      boundaries:{...verified.boundaries,sourceIdentityAuthenticatedByThisModule:false,
        studioProductionAuthorized:false,customerDeliveryAuthorized:false}
    },null,2)+'\n',{mode:0o600,flag:'wx'});
    if(await existingPath(outputDir))fail('output_created_concurrently');
    await fsp.rename(stage,outputDir);
    return {status:'RECEIVED_AND_REHASHED_QUARANTINE_ONLY',
      assetCount:verified.assetCount,totalBytes:verified.totalBytes,
      privateReceiptPath:path.join(outputDir,'custody-receipt.json'),
      productionAuthorized:false,customerDeliveryAuthorized:false};
  } catch(err){await fsp.rm(stage,{recursive:true,force:true});throw err;}
  finally{shared.fill(0);}
}
