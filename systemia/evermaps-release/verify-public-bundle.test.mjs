import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyPublicEvermaps} from './verify-public-bundle.mjs';

const revision='ab'.repeat(20);
const origin='https://evermaps.base44.app';
const bundlePath='/assets/index-qa123.js';
const bytes=Buffer.from('console.log("sourced release candidate");','utf8');
const digest=createHash('sha256').update(bytes).digest('hex');

function fixture(overrides={}){
 const manifest={
  schema:'evercraft.evermaps.release-manifest.v1',
  product:'EverMaps',source_revision:revision,
  bundle_path:bundlePath,bundle_sha256:digest,...overrides
 };
 const html='<html><head><script type="module" crossorigin src="'+bundlePath+'"></script></head></html>';
 const data=new Map([
  [origin+'/world',new Response(html,{headers:{'content-type':'text/html'}})],
  [origin+'/evermaps-release.json',new Response(JSON.stringify(manifest),{headers:{'content-type':'application/json'}})],
  [origin+bundlePath,new Response(bytes,{headers:{'content-type':'application/javascript'}})]
 ]);
 return {manifest,data,fetchImpl:async (url,{redirect})=>{
  assert.equal(redirect,'manual');
  return data.get(url)?.clone()||new Response('not found',{status:404});
 }};
}

test('fail closed with no externally supplied exact reviewed source revision',async()=>{
 const result=await verifyPublicEvermaps({fetchImpl:async()=>{throw Error('must not fetch')}});
 assert.equal(result.state,'BLOCKED');
 assert.equal(result.reason,'EXACT_REVIEWED_SOURCE_REVISION_REQUIRED');
 assert.equal(result.release_authorized,false);
});

test('byte-exact pinned release is parity only, never automatic public approval',async()=>{
 const f=fixture();
 const result=await verifyPublicEvermaps({expectedRevision:revision,fetchImpl:f.fetchImpl});
 assert.equal(result.state,'BUNDLE_PARITY_PROVEN');
 assert.equal(result.bundle_sha256,digest);
 assert.equal(result.source_revision,revision);
 assert.equal(result.release_authorized,false);
 assert.match(result.limitations.join(' '),/headset/);
});

test('stale/missing published release manifest produces a blocked receipt',async()=>{
 const f=fixture();
 f.data.delete(origin+'/evermaps-release.json');
 const result=await verifyPublicEvermaps({expectedRevision:revision,fetchImpl:f.fetchImpl});
 assert.equal(result.state,'BLOCKED');
 assert.equal(result.detail,'HTTP_404');
});

test('a self-attested but unreviewed revision cannot pass',async()=>{
 const f=fixture({source_revision:'ff'.repeat(20)});
 const result=await verifyPublicEvermaps({expectedRevision:revision,fetchImpl:f.fetchImpl});
 assert.equal(result.reason,'REVIEWED_SOURCE_REVISION_MISMATCH');
});

test('a bundle hash mismatch fails even when manifest and HTML agree on the filename',async()=>{
 const f=fixture({bundle_sha256:'1'.repeat(64)});
 const result=await verifyPublicEvermaps({expectedRevision:revision,fetchImpl:f.fetchImpl});
 assert.equal(result.reason,'PUBLISHED_BUNDLE_BYTES_DIFFER');
});

test('a manifest cannot nominate a JS bundle missing from the actual HTML',async()=>{
 const f=fixture({bundle_path:'/assets/other.js'});
 const result=await verifyPublicEvermaps({expectedRevision:revision,fetchImpl:f.fetchImpl});
 assert.equal(result.reason,'BUNDLE_PATH_NOT_IN_HTML');
});

test('reject untrusted origins, external URLs, wrong content type and incomplete schemas',async()=>{
 const invalid=await verifyPublicEvermaps({origin:'https://127.0.0.1',expectedRevision:revision,fetchImpl:async()=>{throw Error('no network')}});
 assert.equal(invalid.reason,'UNTRUSTED_ORIGIN');
 const external=await verifyPublicEvermaps({origin:'https://evil.example',expectedRevision:revision});
 assert.equal(external.state,'BLOCKED');
 const f=fixture({schema:'unreviewed.manifest'});
 assert.equal((await verifyPublicEvermaps({expectedRevision:revision,fetchImpl:f.fetchImpl})).reason,'RELEASE_MANIFEST_MISSING_OR_WRONG_SCHEMA');
 const noJs=fixture();
 noJs.data.set(origin+'/world',new Response('<html>no executable bundle</html>',{headers:{'content-type':'text/html'}}));
 assert.equal((await verifyPublicEvermaps({expectedRevision:revision,fetchImpl:noJs.fetchImpl})).reason,'NO_SAME_ORIGIN_BUNDLE_SCRIPT');
});

test('oversized release manifests are refused, rather than downloaded as unbounded evidence',async()=>{
 const f=fixture();
 f.data.set(origin+'/evermaps-release.json',new Response(' '.repeat(66000),{headers:{'content-type':'application/json'}}));
 const result=await verifyPublicEvermaps({expectedRevision:revision,fetchImpl:f.fetchImpl});
 assert.equal(result.state,'BLOCKED');
 assert.equal(result.detail,'RESPONSE_TOO_LARGE');
});
