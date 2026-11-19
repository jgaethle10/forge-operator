#!/usr/bin/env node
// First-customer Harbor -> Fallen PRIVATE receiving-side byte-verification helper.
// It does NOT transfer files, authenticate Harbor, grant rights or admit production.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 'evercraft.harbor.private-media-manifest.v1';
const HEX = /^[a-f0-9]{64}$/i;
const allowed = new Set(['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime']);
const limit = 2 * 1024 * 1024 * 1024;
function fail(code) { throw new Error('harbor_import_' + code); }
function safeName(s) {
  return typeof s === 'string' && s.length > 0 && s.length <= 200 &&
    s !== '.' && s !== '..' && !s.startsWith('.') &&
    s === path.basename(s) && !s.includes('\\') && !s.includes('/') &&
    !s.includes('\0') && !/[\u0000-\u001f\u007f]/.test(s);
}
function sniff(file) {
  const b=Buffer.alloc(24),fd=fs.openSync(file,'r');
  try { fs.readSync(fd,b,0,b.length,0); } finally { fs.closeSync(fd); }
  if(b.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])))return 'image/jpeg';
  if(b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return 'image/png';
  if(b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WEBP')return 'image/webp';
  if(b.toString('ascii',4,8)==='ftyp'){
    const brand=b.toString('ascii',8,12);
    if(['heic','heix','hevc','hevx','mif1'].includes(brand))return 'image/heic';
    if(brand==='qt  ')return 'video/quicktime';
    return 'video/mp4';
  }
  return null;
}
async function fileSha(file) {
  const hash=crypto.createHash('sha256');
  for await(const chunk of fs.createReadStream(file,{highWaterMark:1024*1024}))hash.update(chunk);
  return hash.digest('hex');
}
export async function verifyPrivateMediaImport({manifestPath,assetDir,operatorRef,expectedCount=12}){
  if(!operatorRef || typeof operatorRef!=='string' || operatorRef.length>120)fail('operator_missing');
  const manifestStat=fs.lstatSync(manifestPath);
  if(!manifestStat.isFile() || manifestStat.isSymbolicLink())fail('manifest_not_regular');
  const original=fs.readFileSync(manifestPath);
  if(original.length>1024*1024)fail('manifest_oversized');
  let manifest;
  try{manifest=JSON.parse(original.toString('utf8'));}catch{fail('manifest_bad_json');}
  if(manifest?.schema!==SCHEMA || !Array.isArray(manifest.assets) ||
    manifest.assets.length!==expectedCount || expectedCount<1 || expectedCount>500)fail('manifest_count_or_schema');
  const rootStat=fs.lstatSync(assetDir);
  if(!rootStat.isDirectory() || rootStat.isSymbolicLink())fail('directory_untrusted');
  const names=new Set();
  const actual=fs.readdirSync(assetDir);
  if(actual.length!==expectedCount)fail('directory_extra_or_missing_files');
  const items=[];
  let total=0;
  for(const a of manifest.assets){
    const name=a?.filename;
    if(!safeName(name))fail('unsafe_filename');
    if(names.has(name.toLowerCase()))fail('duplicate_filename');
    names.add(name.toLowerCase());
    if(!HEX.test(a.sha256||'') || !Number.isSafeInteger(a.bytes) || a.bytes<=0 ||
      !allowed.has(a.mediaType))fail('invalid_asset_record');
    if(!actual.includes(name))fail('file_missing');
    const full=path.join(assetDir,name);
    const st=fs.lstatSync(full);
    if(!st.isFile() || st.isSymbolicLink() || st.nlink!==1)fail('asset_not_regular');
    if(st.size!==a.bytes || st.size>limit)fail('asset_size');
    total+=st.size;
    if(total>3*1024*1024*1024)fail('transfer_total_oversized');
    if(sniff(full)!==a.mediaType)fail('media_signature_mismatch');
    const observed=await fileSha(full);
    if(observed.toLowerCase()!==a.sha256.toLowerCase())fail('asset_digest_mismatch');
    items.push({filename:name,sha256:observed,bytes:st.size,mediaType:a.mediaType});
  }
  // Do not claim source, rights, operator identity or actual device attestation.
  return {
    schema:'evercraft.fallen.private-media-import-receipt.v1',
    state:'BYTES_REVERIFIED_ONLY',
    manifestSha256:crypto.createHash('sha256').update(original).digest('hex'),
    receiverHostname:os.hostname(),
    operatorRef,
    receivedVerifiedAt:new Date().toISOString(),
    assets:items,
    assetCount:items.length,
    totalBytes:total,
    boundaries:{transportAuthenticatedByThisTool:false,receiverIdentityCryptographicallyAttested:false,
      commercialUseRightsVerified:false,systemiaAdmissionGranted:false,
      fallenProductionAccepted:false,customerPreviewReleaseAllowed:false},
  };
}
const executed=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(executed){
  const [, ,manifestPath,assetDir,receiptPath,operatorRef]=process.argv;
  try{
    if(!manifestPath||!assetDir||!receiptPath||!operatorRef)fail('usage_manifest_assets_receipt_operator');
    const r=await verifyPrivateMediaImport({manifestPath,assetDir,operatorRef});
    const out=path.resolve(receiptPath),root=path.resolve(assetDir);
    if(out===path.resolve(manifestPath) || out===root || out.startsWith(root+path.sep))fail('receipt_must_be_outside_asset_dir');
    fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n',{mode:0o600,flag:'wx'});
    // No customer filenames, paths, IDs or hashes printed to terminal.
    console.log(JSON.stringify({status:r.state,assets:r.assetCount,bytes:r.totalBytes,rights:r.boundaries.commercialUseRightsVerified,admission:r.boundaries.systemiaAdmissionGranted}));
  }catch(e){console.error(e instanceof Error ? e.message : 'harbor_import_unknown_error');process.exitCode=2;}
}
