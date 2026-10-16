import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifySourceCustodyCandidate} from './source-custody-preflight.mjs';

const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const commit='a'.repeat(40);
const pin='b'.repeat(64);
const prefix='systemia/compute/node002-inventory-review/';
const names=[
 'systemia/compute/hardware-inventory.mjs',
 prefix+'README.md',
 prefix+'operator-inventory.mjs',
 prefix+'operator-inventory.test.mjs',
 prefix+'signed-completion-verifier.mjs',
];
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'node002-custody-'));
 const files=new Map();
 for(const name of names){
  const body=Buffer.from('SOURCE:'+name+'\n');
  files.set(name,body);
  const p=path.join(root,name);
  fs.mkdirSync(path.dirname(p),{recursive:true});
  fs.writeFileSync(p,body);
 }
 const archive=path.join(root,'review.tar');
 execFileSync('tar',[
   '--sort=name','--mtime=@0','--owner=0','--group=0',
   '--numeric-owner','--format=ustar','-cf',archive,...names
 ],{cwd:root});
 const archiveBytes=fs.readFileSync(archive);
 const manifest=[...files].map(([name,bytes])=>sha(bytes)+'  '+name).join('\n')+'\n';
 const sourceRef='git_head_sha='+commit+'\nrelease_state=REVIEW_HELD\nworker_authorized=false\nphysical_execution_proven=false\n';
 const opts={archiveBytes,sha256SumsText:manifest,sourceRefText:sourceRef,expectedArchiveSha256:sha(archiveBytes),expectedCommitSha:commit,approvedAdapterSha256:pin};
 return {root,opts,archive};
}
function runWithFixture(fn){
 const f=fixture();
 try{return fn(f)}finally{fs.rmSync(f.root,{recursive:true,force:true})}
}
test('independently pinned source integrity may pass but never authorizes work',()=>runWithFixture(({opts})=>{
 const out=verifySourceCustodyCandidate(opts);
 assert.equal(out.source_integrity_verified,true);
 assert.equal(out.source_files_verified,5);
 assert.equal(out.pinned_adapter_matches_existing_policy,false);
 assert.equal(out.mode,'REVIEW_HELD');
 assert.equal(out.approved_for_machine_installation,false);
 assert.equal(out.authorized_for_execution,false);
 assert.equal(out.physical_device_attested,false);
 assert.equal(out.evidence_level,'source_integrity_only_not_source_origin_authentication');
}));
test('archive requires an independent expected digest',()=>runWithFixture(({opts})=>{
 assert.throws(()=>verifySourceCustodyCandidate({...opts,expectedArchiveSha256:undefined}),/expected_hash_invalid/);
 assert.throws(()=>verifySourceCustodyCandidate({...opts,expectedArchiveSha256:'0'.repeat(64)}),/archive_pin_mismatch/);
}));
test('approved adapter mismatch is explicit; matching policy remains review-held',()=>runWithFixture(({opts})=>{
 const digest=sha(Buffer.from('SOURCE:'+prefix+'operator-inventory.mjs\n'));
 const result=verifySourceCustodyCandidate({...opts,approvedAdapterSha256:digest});
 assert.equal(result.pinned_adapter_matches_existing_policy,true);
 assert.equal(result.authorized_for_execution,false);
 assert.equal(result.approved_for_machine_installation,false);
}));
test('forged commit and identity claims fail closed',()=>runWithFixture(({opts})=>{
 assert.throws(()=>verifySourceCustodyCandidate({...opts,expectedCommitSha:'c'.repeat(40)}),/source_commit_pin_mismatch/);
 assert.throws(()=>verifySourceCustodyCandidate({...opts,sourceRefText:opts.sourceRefText.replace('worker_authorized=false','worker_authorized=true')}),/source_ref_invalid/);
 assert.throws(()=>verifySourceCustodyCandidate({...opts,sourceRefText:opts.sourceRefText+'issuer_approved=true\n'}),/source_ref_invalid/);
}));
test('tampered file manifests fail closed even if external archive digest matches',()=>runWithFixture(({opts})=>{
 const one=opts.sha256SumsText.replace(/^[0-9a-f]{64}/,'0'.repeat(64));
 assert.throws(()=>verifySourceCustodyCandidate({...opts,sha256SumsText:one}),/member_hash_mismatch/);
 const missing=opts.sha256SumsText.split('\n').slice(1).join('\n');
 assert.throws(()=>verifySourceCustodyCandidate({...opts,sha256SumsText:missing}),/manifest_member_set_mismatch/);
}));
const HEADERLESS_BYTES=names.length*1024; // each fixture member = one 512-byte header + one 512-byte content block
test('tar member tampering, missing terminator, and unsupported tar types fail closed',()=>runWithFixture(({opts})=>{
 const blob=Buffer.from(opts.archiveBytes);
 blob[150]=(blob[150]+1)%256;
 assert.throws(()=>verifySourceCustodyCandidate({...opts,archiveBytes:blob,expectedArchiveSha256:sha(blob)}),/tar_header_checksum_invalid/);
 // GNU tar pads to 10 KiB, so remove ALL post-payload zero blocks.
 const cut=opts.archiveBytes.subarray(0,HEADERLESS_BYTES);
 assert.throws(()=>verifySourceCustodyCandidate({...opts,archiveBytes:cut,expectedArchiveSha256:sha(cut)}));
}));
test('unexpected symlinks are never admitted as source',()=>runWithFixture(({opts,root})=>{
 const filename=prefix+'link.mjs';
 fs.symlinkSync('operator-inventory.mjs',path.join(root,filename));
 const entries=[...names,filename];
 const otherTar=path.join(root,'withlink.tar');
 execFileSync('tar',['--sort=name','--mtime=@0','--owner=0','--group=0','--numeric-owner','--format=ustar','-cf',otherTar,...entries],{cwd:root});
 const other=fs.readFileSync(otherTar);
 assert.throws(()=>verifySourceCustodyCandidate({...opts,archiveBytes:other,expectedArchiveSha256:sha(other)}),/tar_non_regular_entry/);
}));
