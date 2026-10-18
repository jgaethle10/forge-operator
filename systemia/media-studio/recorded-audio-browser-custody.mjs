/**
 * Browser-side attestation validation for the existing Fallen PulseGrid asset vault.
 * Verifies the Node custody gate's exact Ed25519 signed payload and audio bytes.
 * A verified review is NEVER a commercial rights grant or publication approval.
 * The trusted reviewer public key MUST be pinned independently of the asset.
 */
export const BROWSER_CUSTODY_SCHEMA='evercraft.fallen.recorded-audio-custody.v1';
export const BROWSER_REVIEW_SCHEMA='evercraft.fallen.recorded-audio-review.v1';
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const LICENSES=new Set(['CC0-1.0','CC-BY-4.0','LicenseRef-Evercraft-Owned']);
const MAX_BYTES=250*1024*1024;
const encoder=new TextEncoder();

function fail(code){throw new Error('recorded_audio_'+code);}
function httpsUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&Boolean(url.hostname)&&!url.username&&!url.password;}catch{return false;}}
function base64Bytes(value){
  if(typeof value!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(value)) fail('signature_format_invalid');
  return Uint8Array.from(atob(value),char=>char.charCodeAt(0));
}
function pemBytes(pem){
  if(typeof pem!=='string'||!pem.includes('-----BEGIN PUBLIC KEY-----')||!pem.includes('-----END PUBLIC KEY-----'))fail('trusted_reviewer_key_missing');
  const body=pem.match(/-----BEGIN PUBLIC KEY-----([\s\S]*?)-----END PUBLIC KEY-----/)?.[1]?.replace(/\s/g,'');
  if(!body||!/^[A-Za-z0-9+/]+={0,2}$/.test(body))fail('trusted_reviewer_key_invalid');
  try{return Uint8Array.from(atob(body),c=>c.charCodeAt(0));}catch{fail('trusted_reviewer_key_invalid');}
}
export function recordedAudioReviewPayload(asset){
  const review=asset?.review||{};
  return {
    domain:'evercraft.fallen.recorded-audio-review.v1:approval',
    assetId:asset?.assetId,
    sha256:asset?.sha256,
    licenseId:asset?.licenseId,
    sourceUrl:asset?.sourceUrl,
    licenseEvidenceUrl:asset?.licenseEvidenceUrl,
    attribution:asset?.attribution||'',
    decision:review.decision,
    reviewedBy:review.reviewedBy,
    reviewedAt:review.reviewedAt,
  };
}
function verifyDeclaredContainer(raw,relativePath){
  // The Node/desktop gate permits only local relative WAV, FLAC and OGG names.
  if(typeof relativePath!=='string'||!relativePath||relativePath.includes('\\')||relativePath.includes('\0')||
      relativePath.startsWith('/')||/^[a-z]:/i.test(relativePath)||
      relativePath.split('/').some(part=>!part||part==='.'||part==='..'))fail('relative_path_invalid');
  const ext=relativePath.match(/\.(wav|flac|ogg)$/i)?.[1]?.toLowerCase();
  if(!ext)fail('container_extension_invalid');
  if(raw.byteLength<44 && ext==='wav')fail('wav_container_invalid');
  const h=new DataView(raw);
  const bytes=new Uint8Array(raw,0,Math.min(raw.byteLength,44));
  const four=(offset)=>String.fromCharCode(...bytes.slice(offset,offset+4));
  if(ext==='wav'){
    if(four(0)!=='RIFF'||four(8)!=='WAVE'||h.getUint32(4,true)+8!==raw.byteLength||
        four(12)!=='fmt '||h.getUint32(16,true)<16||four(36)!=='data'||
        h.getUint32(40,true)>raw.byteLength-44)fail('wav_container_invalid');
  } else if(ext==='flac'){
    if(raw.byteLength<8||four(0)!=='fLaC')fail('flac_container_invalid');
  } else if(raw.byteLength<8||four(0)!=='OggS')fail('ogg_container_invalid');
}
/** Key admission is separate from original rights verification and cannot publish. */
export async function verifyBrowserRecordedAudio(blob,asset,trustedReviewerPublicKeyPem){
  if(!(blob instanceof Blob)||!blob.size||blob.size>MAX_BYTES)fail('invalid_blob_size');
  if(!ID.test(asset?.assetId||''))fail('asset_id_invalid');
  if(typeof asset?.sha256!=='string'||!SHA.test(asset.sha256))fail('sha256_invalid');
  if(!LICENSES.has(asset?.licenseId))fail('license_unknown_or_disallowed');
  if(!httpsUrl(asset?.sourceUrl)||!httpsUrl(asset?.licenseEvidenceUrl))fail('evidence_url_invalid');
  if(asset.licenseId==='CC-BY-4.0'&&!String(asset.attribution||'').trim())fail('attribution_required');
  const review=asset.review;
  const reviewedAt=Date.parse(review?.reviewedAt);
  if(review?.schema!==BROWSER_REVIEW_SCHEMA||review.decision!=='approved'||!ID.test(review.reviewedBy||'')||
      !Number.isFinite(reviewedAt)||reviewedAt>Date.now()+300000)fail('review_invalid');
  if(!globalThis.crypto?.subtle)fail('webcrypto_unavailable');
  const keyBytes=pemBytes(trustedReviewerPublicKeyPem);
  const signature=base64Bytes(review.signature);
  let key;
  try{key=await globalThis.crypto.subtle.importKey('spki',keyBytes,{name:'Ed25519'},false,['verify']);}
  catch{fail('trusted_reviewer_key_invalid');}
  let valid=false;
  try{valid=await globalThis.crypto.subtle.verify({name:'Ed25519'},key,signature,encoder.encode(JSON.stringify(recordedAudioReviewPayload(asset))));}
  catch{fail('signature_invalid');}
  if(!valid)fail('signature_invalid');
  const raw=await blob.arrayBuffer();
  verifyDeclaredContainer(raw,asset.relativePath);
  const digest=Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==asset.sha256)fail('audio_sha256_mismatch');
  return Object.freeze({
    schema:'evercraft.fallen.browser-recorded-audio-review.v1',
    status:'accepted_for_ingest_review',
    sha256:digest,
    assetId:asset.assetId,
    sourceRefs:[`recorded-custody:${asset.assetId}`,`sha256:${digest}`,asset.sourceUrl,asset.licenseEvidenceUrl,`reviewer:${review.reviewedBy}`],
    sourceName:asset.assetId,
    rights:'unknown',
    publicationAuthorized:false,
  });
}
/** Adapter calls the canonical PulseGridBrowserAudioAssetVault.ingest method. */
export async function ingestReviewedRecordingIntoVault(vault,blob,asset,pinnedReviewerPublicKeyPem){
  const receipt=await verifyBrowserRecordedAudio(blob,asset,pinnedReviewerPublicKeyPem);
  // Unknown rights by design: verification of a signer does not prove copyright.
  const stored=await vault.ingest(blob,{
    source_name:receipt.sourceName,
    source_refs:receipt.sourceRefs,
    source_state:'imported',
    rights:'unknown',
  });
  if(stored.digest!==receipt.sha256)fail('vault_digest_mismatch');
  return {asset:stored,receipt};
}