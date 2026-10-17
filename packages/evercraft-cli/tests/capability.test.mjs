import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateCapabilitySubmission} from '../capability.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'examples/capability-candidate.json');
const source=JSON.parse(readFileSync(file,'utf8'));

test('illustrative third-party manifest validates but is not published or trusted',()=>{
 const result=validateCapabilitySubmission(source);
 assert.equal(result.state,'candidate_unverified');
 assert.equal(result.human_review_required,true);
 assert.equal(result.execution_granted,false);
 assert.equal(result.commerce_granted,false);
 assert.match(result.fingerprint_sha256,/^[a-f0-9]{64}$/);
});
test('commercial and execution claims cannot be silently promoted',()=>{
 assert.throws(()=>validateCapabilitySubmission({...source,commercial_model:'live'}),/commercial_model/);
 assert.throws(()=>validateCapabilitySubmission({...source,execution_granted:true}),/unrecognized field/);
 assert.throws(()=>validateCapabilitySubmission({...source,integration:{...source.integration,side_effects:'unrestricted'}}),/side_effects/);
});
test('credential-bearing and non-HTTPS URLs are rejected',()=>{
 assert.throws(()=>validateCapabilitySubmission({...source,publisher:{...source.publisher,website:'http://example.org'}}),/HTTPS/);
 assert.throws(()=>validateCapabilitySubmission({...source,publisher:{...source.publisher,website:'https://user:password@example.org'}}),/without credentials/);
 assert.throws(()=>validateCapabilitySubmission({...source,evidence:{...source.evidence,api_key:'secret'}}),/unrecognized/);
});
test('CLI capability validate is read-only and prints explicit holds',()=>{
 const result=spawnSync(process.execPath,[path.join(root,'cli.mjs'),'capability','validate',file],{encoding:'utf8',timeout:8000});
 assert.equal(result.status,0,result.stderr);
 const data=JSON.parse(result.stdout);
 assert.equal(data.publication_granted,false);
 assert.equal(data.execution_granted,false);
 assert.equal(data.manifest.id,'example.math');
});
