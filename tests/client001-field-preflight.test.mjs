import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {inspectSourceStage,firstSymlinkAncestor,admission} from '../scripts/client001-field-preflight.mjs';

const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
function lab(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'client001-node-preflight-'));
 const sourcePath=path.join(dir,'source.html');
 const releaseRoot=path.join(dir,'owned','client001','releases');
 const html=Buffer.from('<html><title>owned-client001</title></html>\n');
 fs.writeFileSync(sourcePath,html);
 fs.mkdirSync(releaseRoot,{recursive:true});
 return {dir,sourcePath,releaseRoot,html,sha:digest(html),
  clean(){fs.rmSync(dir,{recursive:true,force:true});}};
}
test('missing stage is an explicit HOLD even with canonical source present',()=>{
 const t=lab();try{
  const obs=inspectSourceStage(t);
  assert.equal(obs.source_present,true);
  assert.equal(obs.releases_root_exists,true);
  assert.equal(obs.release_staged,false);
  assert.equal(obs.canonical_sha256,t.sha);
  const p=admission(obs,{caddyStatus:'active',fabricStatus:'active'});
  assert.equal(p.status,'HOLD_PUBLIC_PROMOTION');
  assert.ok(p.blockers.includes('canonical_release_not_staged_on_this_node'));
  assert.ok(p.blockers.includes('juan_publication_approval_unverified'));
  assert.equal(p.public_deploy_performed,false);
  assert.equal(p.no_filesystem_writes,true);
 }finally{t.clean();}
});
test('immutable hash verified; a recognized current pointer never implies public publication',()=>{
 const t=lab();try{
  const dest=path.join(t.releaseRoot,t.sha);
  fs.mkdirSync(dest);
  fs.writeFileSync(path.join(dest,'index.html'),t.html);
  fs.symlinkSync(dest,path.join(path.dirname(t.releaseRoot),'current'));
  const o=inspectSourceStage(t);
  assert.equal(o.release_staged,true);
  assert.equal(o.staged_sha256_matches,true);
  assert.equal(o.current_pointer_exists,true);
  assert.equal(o.current_pointer_owned,true);
  const p=admission(o);
  assert.equal(p.status,'HOLD_PUBLIC_PROMOTION');
  assert.equal(p.customer_release_authorized,false);
  assert.equal(p.staged_digest_verified,true);
  assert.ok(p.blockers.includes('registered_public_domain_unverified'));
 }finally{t.clean();}
});
test('tampered or symlinked release artifacts are never treated as verified',()=>{
 const t=lab();try{
  const dest=path.join(t.releaseRoot,t.sha);
  fs.mkdirSync(dest);
  const htmlPath=path.join(dest,'index.html');
  fs.writeFileSync(htmlPath,Buffer.from('tampered'));
  let o=inspectSourceStage(t);
  assert.equal(o.staged_sha256_matches,false);
  assert.equal(o.immutable_release_violation,true);
  fs.rmSync(htmlPath);
  fs.symlinkSync(t.sourcePath,htmlPath);
  o=inspectSourceStage(t);
  assert.equal(o.immutable_release_violation,true);
  assert.equal(o.release_staged,false);
  assert.ok(admission(o).blockers.includes('staged_release_tamper_or_symlink'));
 }finally{t.clean();}
});
test('symlink ancestors and unrelated active current pointers are rejected',()=>{
 const t=lab();try{
  const parent=path.join(t.dir,'shadow');
  fs.symlinkSync(path.dirname(t.releaseRoot),parent);
  const maliciousRoot=path.join(parent,'releases');
  assert.equal(firstSymlinkAncestor(maliciousRoot),true);
  assert.equal(inspectSourceStage({...t,releaseRoot:maliciousRoot}).symlink_ancestor_found,true);
  fs.symlinkSync(t.sourcePath,path.join(path.dirname(t.releaseRoot),'current'));
  const o=inspectSourceStage(t);
  assert.equal(o.current_pointer_exists,true);
  assert.equal(o.current_pointer_owned,false);
  assert.ok(admission(o).blockers.includes('current_pointer_unrecognized'));
 }finally{t.clean();}
});
test('read-only module does not silently set network, registrar or Caddy readiness',()=>{
 const t=lab();try{
  const a=admission(inspectSourceStage(t));
  for(const b of ['owned_public_ingress_and_tls_unverified','external_browser_and_uptime_unverified',
   'authorized_public_dns_control_unverified','rollback_and_recovery_unverified']){
   assert.ok(a.blockers.includes(b),b);
  }
  assert.equal(a.no_network_writes,true);
  assert.equal(a.public_dns_changed,false);
 }finally{t.clean();}
});
