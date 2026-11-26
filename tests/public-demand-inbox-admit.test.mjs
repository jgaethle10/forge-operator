import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {admitCapture} from '../systemia/revenue-desk/public-demand-inbox-admit.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
test('private inbox append is idempotent and preserves previous assignments',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'inbox-admit-'));
 try{
  const captures=path.join(root,'captures');fs.mkdirSync(captures,{mode:0o700});
  const text='test procurement page',sourceFile=path.join(captures,'a'.repeat(64)+'.json');
  const raw=Buffer.from(JSON.stringify({capture:{state:'captured_requires_research',source_url:'https://www.susta.org/rfp/',text,text_sha256:sha(text),qualified:false,contact_authorized:false,execution_authorized:false,document_pointers:['a','b'].map(x=>({url:'https://www.susta.org/'+x+'.pdf',status:'unverified_document_pointer'}))}}));
  fs.writeFileSync(sourceFile,raw,{mode:0o600});
  const inbox=path.join(root,'document-inbox.json');
  fs.writeFileSync(inbox,JSON.stringify({schema:'evercraft.public-demand.document-inbox.v1',captures:[{key:'a'.repeat(64),sha256:sha(raw),indices:[0]}]}),{mode:0o600});
  const r=admitCapture({root,sourceFile,expectedSha:sha(raw),indices:[0,1]});
  assert.equal(r.added,1);assert.equal(r.total,2);
  const saved=fs.readFileSync(inbox);
  assert.deepEqual(JSON.parse(saved).captures[0].indices,[0,1]);
  assert.equal(admitCapture({root,sourceFile,expectedSha:sha(raw),indices:[1]}).state,'unchanged');
  assert.throws(()=>admitCapture({root,sourceFile,expectedSha:'0'.repeat(64),indices:[0]}),/parent_receipt_mismatch/);
  assert.ok(fs.readFileSync(inbox).equals(saved));assert.ok(fs.readFileSync(sourceFile).equals(raw));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
