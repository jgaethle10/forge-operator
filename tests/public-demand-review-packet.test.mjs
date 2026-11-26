import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const sha=x=>createHash('sha256').update(x).digest('hex');
const script=fileURLToPath(new URL('../systemia/revenue-desk/public-demand-review-packet.mjs',import.meta.url));
test('CLI writes immutable review, exits zero, reuses evidence, rejects wrong hash',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'review-packet-'));
 try{
  const stem=path.join(dir,'a'.repeat(64));
  const pdf=Buffer.from('%PDF- synthetic fixture, never parsed');
  const url='https://example.org/rfp.pdf';
  const flags={qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
  const acquisition=Buffer.from(JSON.stringify({schema:'evercraft.public-demand.pdf-evidence.v1',url,pdf_sha256:sha(pdf),pdf_bytes:pdf.length,parent_source:'https://example.org/purchasing/',parent_receipt_sha256:'b'.repeat(64),...flags}));
  const text='November 16, 2027\nScope of Work\nDeliverables include software.\fDeadline for Proposal\nSubmit by December 7, 2026.';
  const extraction=Buffer.from(JSON.stringify({schema:'evercraft.public-demand.pdf-extraction.v1',url,state:'extracted_requires_research',acquisition_receipt_sha256:sha(acquisition),pdf_sha256:sha(pdf),text,text_sha256:sha(text),...flags}));
  fs.writeFileSync(stem+'.pdf',pdf,{mode:0o600});
  fs.writeFileSync(stem+'.json',acquisition,{mode:0o600});
  const file=stem+'.extraction-v1.json';
  fs.writeFileSync(file,extraction,{mode:0o600});
  const run=hash=>spawnSync(process.execPath,[script,file,hash],{encoding:'utf8',timeout:10000});
  const first=run(sha(extraction));
  assert.equal(first.status,0,first.stderr);
  const result=JSON.parse(first.stdout),body=fs.readFileSync(result.receipt);
  assert.equal(result.receipt_sha256,sha(body));
  assert.equal(JSON.parse(body).qualified,false);
  const second=run(sha(extraction));
  assert.equal(second.status,0,second.stderr);
  assert.equal(JSON.parse(second.stdout).receipt_sha256,result.receipt_sha256);
  const invalid=run('0'.repeat(64));
  assert.notEqual(invalid.status,0);
  assert.match(invalid.stderr,/extraction_receipt_mismatch/);
  assert.equal(sha(fs.readFileSync(result.receipt)),result.receipt_sha256);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
