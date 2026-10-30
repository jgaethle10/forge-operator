import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {issuePackage,checkPackage} from '../scripts/passage-signed-package.mjs';
import {verifySignedPackage,MAX_TEXT_BYTES} from '../public/passage/package-verifier.mjs';
const article={id:'demo-article',title:'Original educational demonstration',edition:'2026-10-30',category:'Media literacy',
 description:'Example only',rights:'Original Evercraft demonstration text. Broad redistribution rights have not been approved.',
 sections:[{heading:'Read carefully',paragraphs:['A small fact.','Never mistake a signature for a truth guarantee.']}],sources:[]};
const pemPair=()=>{const {privateKey,publicKey}=generateKeyPairSync('ed25519');return {privatePem:privateKey.export({type:'pkcs8',format:'pem'}).toString(),publicPem:publicKey.export({type:'spki',format:'pem'}).toString()}};
const now='2026-10-30T21:00:00.000Z',keys=pemPair();
const issue=()=>issuePackage({article,privateKeyPem:keys.privatePem,issuedAt:new Date(now),ttlDays:2});
test('trusted Ed25519 package verifies with Node and browser-compatible code',async()=>{
 const p=issue(),object=JSON.parse(p);
 assert.equal(Object.hasOwn(object,'public_key'),false,'a received file cannot self-authorize its signing key');
 const v=await checkPackage({packageJson:p,trustedPublicKeyPem:keys.publicPem,now:new Date('2026-10-31T00:00:00Z')});
 assert.equal(v.metadata.article_id,'demo-article');assert.match(v.text,/A small fact/);
 const browser=await verifySignedPackage(p,keys.publicPem,Date.parse('2026-10-31T00:00:00Z'));assert.deepEqual(v,browser);
});
test('altered text is rejected despite an intact metadata signature',async()=>{
 const p=JSON.parse(issue());p.content_base64=Buffer.from('This is altered').toString('base64');
 await assert.rejects(()=>verifySignedPackage(JSON.stringify(p),keys.publicPem,Date.parse(now)),/length changed|checksum failed/);
});
test('altered rights and dates invalidate the signed metadata',async()=>{
 const p=JSON.parse(issue());p.signed_data.rights='Permission to redistribute freely';
 await assert.rejects(()=>verifySignedPackage(JSON.stringify(p),keys.publicPem,Date.parse(now)),/Signature failed/);
 const p2=JSON.parse(issue());p2.signed_data.expires_at='2026-11-20T21:00:00.000Z';
 await assert.rejects(()=>verifySignedPackage(JSON.stringify(p2),keys.publicPem,Date.parse(now)),/Signature failed/);
});
test('wrong out-of-band trust anchor is rejected',async()=>{
 const wrong=pemPair();await assert.rejects(()=>verifySignedPackage(issue(),wrong.publicPem,Date.parse(now)),/Signature failed/);
});
test('expired and future-dated packages fail closed',async()=>{
 await assert.rejects(()=>verifySignedPackage(issue(),keys.publicPem,Date.parse('2026-11-02T21:00:00.000Z')),/expired/);
 await assert.rejects(()=>verifySignedPackage(issue(),keys.publicPem,Date.parse('2026-10-30T20:00:00.000Z')),/future/);
});
test('self-authorizing keys and unknown fields fail validation',async()=>{
 const p=JSON.parse(issue());p.public_key_pem=keys.publicPem;
 await assert.rejects(()=>verifySignedPackage(JSON.stringify(p),keys.publicPem,Date.parse(now)),/unexpected or missing/);
 const p2=JSON.parse(issue());p2.signed_data.publisher_approved=true;
 await assert.rejects(()=>verifySignedPackage(JSON.stringify(p2),keys.publicPem,Date.parse(now)),/unexpected or missing/);
});
test('size limits and noncanonical base64 are enforced',async()=>{
 const p=JSON.parse(issue());p.content_base64=Buffer.alloc(MAX_TEXT_BYTES+1).toString('base64');
 await assert.rejects(()=>verifySignedPackage(JSON.stringify(p),keys.publicPem,Date.parse(now)),/limit|too large|exceeds/);
 const p2=JSON.parse(issue());p2.content_base64+='a';
 await assert.rejects(()=>verifySignedPackage(JSON.stringify(p2),keys.publicPem,Date.parse(now)),/base64/);
});
test('fake signature fails',async()=>{
 const p=JSON.parse(issue());p.signature_base64=Buffer.alloc(64).toString('base64');
 await assert.rejects(()=>verifySignedPackage(JSON.stringify(p),keys.publicPem,Date.parse(now)),/Signature failed/);
});
