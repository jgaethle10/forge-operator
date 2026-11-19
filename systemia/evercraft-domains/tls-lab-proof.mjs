#!/usr/bin/env node
// Scoped, test-only DNS -> trusted TLS -> exact Client 001 HTML.
// All network connections are loopback. No system or browser CA installation.
// The lab CA and keys stay in an isolated short-lived runner directory.
import dns from 'node:dns/promises';
import https from 'node:https';
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const HOST='onthegoquicklube.evercraft';
const PORT=18443;
const dir=process.env.EVERCRAFT_DOMAINS_TLS_LAB_DIR;
const out=process.env.EVERCRAFT_DOMAINS_TLS_EVIDENCE;
assert.ok(dir&&dir.startsWith('/'),'private_lab_directory_required');
assert.ok(out&&out.startsWith('/'),'private_evidence_output_required');
const ca=fs.readFileSync(dir+'/ca.pem');
const source=fs.readFileSync(new URL('../../public/clients/on-the-go/review/index.html',import.meta.url));
const resolver=new dns.Resolver();
resolver.setServers(['127.0.0.1:15453']);
const result=await resolver.resolve4(HOST);
assert.deepEqual(result,['127.0.0.1'],'private alias did not resolve via local split DNS');
const connectAddress=result[0];
const sha=(buffer)=>crypto.createHash('sha256').update(buffer).digest('hex');
async function request({path='/',method='GET',host=HOST+':'+PORT,trust=true,servername=HOST}={}){
 return await new Promise((resolve,reject)=>{
  const req=https.request({
   hostname:HOST,port:PORT,path,method,servername,
   lookup:(name,opts,callback)=>{
    const cb=typeof opts==='function'?opts:callback;
    const settings=typeof opts==='object'&&opts?opts:{};
    if(name!==HOST){cb(Error('unexpected_dns_name'));return;}
    // Node 22 may request the multi-address form with {all:true}.
    // No fallback to system/public DNS is permitted.
    if(settings.all)cb(null,[{address:connectAddress,family:4}]);
    else cb(null,connectAddress,4);
   },
   ca:trust?ca:[],
   rejectUnauthorized:true,
   agent:false,
   timeout:4500,
   headers:{Host:host,'Accept-Encoding':'identity'}
  },res=>{
   const cert=res.socket.getPeerCertificate();
   const authorized=res.socket.authorized===true;
   const chunks=[];
   res.on('data',c=>chunks.push(c));
   res.on('end',()=>resolve({
    status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks),
    authorized,cert_subject:cert.subject?.CN||null,
    cert_subject_alt_names:cert.subjectaltname||null,
    cert_fingerprint_sha256:cert.fingerprint256||null
   }));
  });
  req.on('timeout',()=>req.destroy(Error('tls_test_timeout')));
  req.on('error',reject);
  req.end();
 });
}
const page=await request();
assert.equal(page.status,200,'correct SNI + Host must serve page');
assert.equal(page.authorized,true,'certificate must validate under scoped test CA');
assert.ok(page.cert_subject_alt_names?.includes('DNS:'+HOST),'TLS SAN must match exact hostname');
assert.equal(sha(page.body),sha(source),'live TLS page must match canonical GitHub bytes');
assert.match(page.body.toString('utf8',0,20000),/Client Preview V4\.1/);
assert.equal(page.headers['x-robots-tag'],'noindex, nofollow, noarchive');
assert.equal(page.headers['cache-control'],'no-store');
assert.equal(page.headers['x-content-type-options'],'nosniff');
const head=await request({method:'HEAD'});
assert.equal(head.status,200);
assert.equal(head.body.length,0);
assert.equal(Number(head.headers['content-length']),source.length);
const robots=await request({path:'/robots.txt'});
assert.equal(robots.body.toString('utf8').trim(),'User-agent: *\nDisallow: /');
const health=JSON.parse((await request({path:'/healthz'})).body.toString('utf8'));
assert.equal(health.state,'LOOPBACK_ONLY_TEST');
assert.equal(health.production_tls,false);
assert.equal(health.public_dns,false);
assert.equal(health.site_published,false);
const blockedWrite=await request({method:'POST'});
assert.equal(blockedWrite.status,405,'writes prohibited');
const blockedPath=await request({path:'/private'});
assert.equal(blockedPath.status,404,'unrelated paths prohibited');
const wrongHost=await request({host:'someoneelse.evercraft:'+PORT});
assert.notEqual(wrongHost.status,200,'wrong Host must not receive client page');
let noTrustRejected=false;
try{
 await request({trust:false});
}catch(e){
 noTrustRejected=true;
 assert.ok(
  ['UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_HAS_EXPIRED'].includes(e.code)||
  /certificate|self.signed|unable.to.verify/i.test(e.message),
  'untrusted CA should fail by certificate validation'
 );
}
assert.equal(noTrustRejected,true,'without scoped CA, HTTPS must fail');
let wrongSniRejected=false;
try{
 const p=await request({servername:'another.evercraft'});
 wrongSniRejected=p.status!==200;
}catch{wrongSniRejected=true;}
assert.equal(wrongSniRejected,true,'wrong TLS SNI cannot yield the page');
const receipt={
 schema:'evercraft.domains.client001.scoped-https-lab-proof.v1',
 state:'LOOPBACK_ONLY_TEST_PASS',
 alias:HOST,
 dns_path:'explicit-local-resolver-127.0.0.1:15453',
 resolved_address:connectAddress,
 tls_path:'loopback-Caddy-with-ephemeral-scoped-CA',
 tls_client_verified:true,
 sni_verified:true,
 certificate_fingerprint_sha256:page.cert_fingerprint_sha256,
 site_source_sha256:sha(source),
 https_body_sha256:sha(page.body),
 source_bytes:source.length,
 exact_source_match:true,
 no_ca_rejected:true,
 wrong_sni_rejected:true,
 wrong_host_blocked:true,
 write_blocked:true,
 unrelated_path_blocked:true,
 noindex:true,
 health,
 public_tld_delegated:false,
 client_device_trust_installed:false,
 public_dns_changed:false,
 site_publicly_deployed:false,
 production_browser_proven:false,
 human_owner_approval:false
};
fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
console.log('SCOPED_PRIVATE_DNS_TLS_CADDY_PASS');
console.log(JSON.stringify({alias:receipt.alias,certificate_verified:receipt.tls_client_verified,
 exact_source_match:receipt.exact_source_match,
 source_sha256:receipt.site_source_sha256,
 public_release:false,device_trust_installed:false},null,2));
