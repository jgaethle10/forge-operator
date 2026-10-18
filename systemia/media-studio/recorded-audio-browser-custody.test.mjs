import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import test from 'node:test';
import {recordedAudioReviewPayload,verifyBrowserRecordedAudio,ingestReviewedRecordingIntoVault} from './recorded-audio-browser-custody.mjs';

function fixture(){
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const pem=publicKey.export({type:'spki',format:'pem'}).toString();
 const bytes=Buffer.alloc(60);bytes.write('RIFF',0);bytes.writeUInt32LE(52,4);bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(48000,24);bytes.writeUInt32LE(96000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(16,40);
 const blob=new Blob([bytes],{type:'audio/wav'});
 const asset={assetId:'switch1',relativePath:'switch.wav',sha256:createHash('sha256').update(bytes).digest('hex'),licenseId:'CC0-1.0',sourceUrl:'https://example.org/switch',licenseEvidenceUrl:'https://example.org/license',attribution:'',review:{schema:'evercraft.fallen.recorded-audio-review.v1',decision:'approved',reviewedBy:'trusted-human',reviewedAt:'2026-10-14T18:00:00Z',signature:''}};
 const signIt=()=>{asset.review.signature=sign(null,Buffer.from(JSON.stringify(recordedAudioReviewPayload(asset))),privateKey).toString('base64')};signIt();
 return {pem,blob,bytes,asset,signIt};
}
const reject=async(f,code)=>await assert.rejects(f,new RegExp('recorded_audio_'+code));
test('accepts exact verified bytes and signer but explicitly no publishing',async()=>{const x=fixture();const r=await verifyBrowserRecordedAudio(x.blob,x.asset,x.pem);assert.equal(r.sha256,x.asset.sha256);assert.equal(r.rights,'unknown');assert.equal(r.publicationAuthorized,false);});
test('signed review payload matches Node custody canonical JSON order',()=>{const x=fixture();assert.deepEqual(Object.keys(recordedAudioReviewPayload(x.asset)),['domain','assetId','sha256','licenseId','sourceUrl','licenseEvidenceUrl','attribution','decision','reviewedBy','reviewedAt']);});
test('rejects changed sample bytes',async()=>{const x=fixture();await reject(()=>verifyBrowserRecordedAudio(new Blob([Buffer.from(x.bytes).fill(1,48,49)]),x.asset,x.pem),'audio_sha256_mismatch')});
test('rejects wrong trusted key',async()=>{const x=fixture();const y=fixture();await reject(()=>verifyBrowserRecordedAudio(x.blob,x.asset,y.pem),'signature_invalid');});
test('rejects unsigned forged approval',async()=>{const x=fixture();x.asset.review.signature='';await reject(()=>verifyBrowserRecordedAudio(x.blob,x.asset,x.pem),'signature_format_invalid');});
test('rejects rights mutation after signing',async()=>{const x=fixture();x.asset.licenseId='CC-BY-4.0';x.asset.attribution='Somebody';await reject(()=>verifyBrowserRecordedAudio(x.blob,x.asset,x.pem),'signature_invalid');});
test('rejects missing CC BY attribution even when signed',async()=>{const x=fixture();x.asset.licenseId='CC-BY-4.0';x.signIt();await reject(()=>verifyBrowserRecordedAudio(x.blob,x.asset,x.pem),'attribution_required');});
test('rejects unknown licenses',async()=>{const x=fixture();x.asset.licenseId='all-rights-reserved';x.signIt();await reject(()=>verifyBrowserRecordedAudio(x.blob,x.asset,x.pem),'license_unknown_or_disallowed');});
test('rejects altered source claims',async()=>{const x=fixture();x.asset.sourceUrl='https://example.org/other';await reject(()=>verifyBrowserRecordedAudio(x.blob,x.asset,x.pem),'signature_invalid');});
test('rejects URL userinfo tricks',async()=>{const x=fixture();x.asset.sourceUrl='https://user:password@example.org';x.signIt();await reject(()=>verifyBrowserRecordedAudio(x.blob,x.asset,x.pem),'evidence_url_invalid');});
test('rejects fake WAV content',async()=>{const x=fixture();const bytes=Buffer.alloc(60);x.asset.sha256=createHash('sha256').update(bytes).digest('hex');x.signIt();await reject(()=>verifyBrowserRecordedAudio(new Blob([bytes]),x.asset,x.pem),'wav_container_invalid');});
test('rejects future review timestamps even when signed',async()=>{const x=fixture();x.asset.review.reviewedAt='2099-10-14T18:00:00Z';x.signIt();await reject(()=>verifyBrowserRecordedAudio(x.blob,x.asset,x.pem),'review_invalid');});
test('ingest adapter feeds actual bytes into existing vault and preserves unknown rights',async()=>{const x=fixture();let called=0;const vault={async ingest(blob,options){called++;assert.equal(blob,x.blob);assert.equal(options.rights,'unknown');assert.equal(options.source_state,'imported');assert.ok(options.source_refs.includes(x.asset.sourceUrl));return {digest:x.asset.sha256,rights:options.rights};}};const result=await ingestReviewedRecordingIntoVault(vault,x.blob,x.asset,x.pem);assert.equal(called,1);assert.equal(result.receipt.publicationAuthorized,false);});
test('rejects altered bytes before vault write',async()=>{const x=fixture();let calls=0;const vault={async ingest(){calls++;}};await reject(()=>ingestReviewedRecordingIntoVault(vault,new Blob([Buffer.alloc(60)]),x.asset,x.pem),'wav_container_invalid');assert.equal(calls,0);});
test('rejects dishonest vault receipt hash',async()=>{const x=fixture();const vault={async ingest(){return{digest:'0'.repeat(64)}}};await reject(()=>ingestReviewedRecordingIntoVault(vault,x.blob,x.asset,x.pem),'vault_digest_mismatch');});
test('requires an externally supplied reviewer key',async()=>{const x=fixture();await reject(()=>verifyBrowserRecordedAudio(x.blob,x.asset,''),'trusted_reviewer_key_missing');});

test('rejects path traversal declarations',async()=>{const x=fixture();x.asset.relativePath='../switch.wav';await reject(()=>verifyBrowserRecordedAudio(x.blob,x.asset,x.pem),'relative_path_invalid');});
test('rejects mismatched extension even when signed',async()=>{const x=fixture();x.asset.relativePath='switch.flac';await reject(()=>verifyBrowserRecordedAudio(x.blob,x.asset,x.pem),'flac_container_invalid');});
test('rejects short fraudulent RIFF length',async()=>{const x=fixture();const bad=Buffer.from(x.bytes);bad.writeUInt32LE(2,4);x.asset.sha256=createHash('sha256').update(bad).digest('hex');x.signIt();await reject(()=>verifyBrowserRecordedAudio(new Blob([bad]),x.asset,x.pem),'wav_container_invalid');});