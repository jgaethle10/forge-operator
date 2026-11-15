import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {runCryptoSelfCheck,createDeviceReceipt} from '../public/passage/device-qa.mjs';
test('offline SHA-256 and RFC8032 Ed25519 known-answer checks run without network',async()=>{
 const result=await runCryptoSelfCheck(webcrypto);
 assert.deepEqual(result,{sha256:'pass',ed25519:'pass',tamper_rejected:'pass'});
 await assert.rejects(()=>runCryptoSelfCheck(null),/WebCrypto is unavailable/);
});
test('local receipt is minimal, truthful and excludes device identifiers and content',async()=>{
 const result=await runCryptoSelfCheck(webcrypto);
 const receipt=createDeviceReceipt({result,platform:'iphone-ipad',reportedOffline:true,packageState:'not-tried',at:new Date('2026-11-09T18:00:00Z')});
 assert.equal(receipt.schema,'evercraft.passage.device-qa.v1');
 assert.equal(receipt.offline_manually_confirmed,true);
 assert.equal(receipt.signed_package_observation,'not-tried');
 assert.equal(receipt.tested_at,'2026-11-09T18:00:00.000Z');
 assert.deepEqual(Object.keys(receipt),['schema','tested_at','platform_category','offline_manually_confirmed','sha256_known_answer','ed25519_known_answer','altered_signature_rejected','signed_package_observation','interpretation']);
 assert.doesNotMatch(JSON.stringify(receipt),/user.agent|ip.address|location|file.content|publisher.key/i);
 assert.throws(()=>createDeviceReceipt({result:{sha256:'pass',ed25519:'fail',tamper_rejected:'pass'}}),/did not pass/);
 assert.throws(()=>createDeviceReceipt({result,platform:'device-id'}),/Unknown platform/);
 assert.throws(()=>createDeviceReceipt({result,packageState:'verified-remotely'}),/Invalid package/);
});
