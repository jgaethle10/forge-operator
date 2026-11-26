import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {runDocumentCycle} from '../systemia/revenue-desk/public-demand-document-cycle.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const flags={qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
test('cycle normalizes existing extracted acquisition, creates triage, then idles without refetch',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'public-demand-cycle-'));
 try{
  const captures=path.join(root,'captures'),docs=path.join(root,'documents');
  for(const dir of [captures,docs])fs.mkdirSync(dir,{mode:0o700});
  const write=(file,data)=>fs.writeFileSync(file,data,{mode:0o600});
  const text='November 16, 2027\nScope of Work\fAll proposals from bidders must be submitted by December 7, 2026.';
  const source='https://www.susta.org/contact/rfp/',url='https://www.susta.org/example.pdf';
  const parent=Buffer.from(JSON.stringify({capture:{source_url:source,state:'captured_requires_research',text,text_sha256:sha(text),document_pointers:[{url,status:'unverified_document_pointer'}],...flags}}));
  const parentKey='a'.repeat(64);write(path.join(captures,parentKey+'.json'),parent);
  const job={url,parent_receipt_sha256:sha(parent),parent_source:source};
  const key=sha(JSON.stringify(job)),stem=path.join(docs,key);
  const pdf=Buffer.from('%PDF- synthetic bytes never parsed');
  write(stem+'.pdf',pdf);
  write(stem+'.json',JSON.stringify({schema:'evercraft.public-demand.pdf-evidence.v1',...job,pdf_sha256:sha(pdf),pdf_bytes:pdf.length,state:'extracted_requires_research',text,text_sha256:sha(text),page_limit:40,...flags}));
  const manifestFile=path.join(root,'inbox.json');
  const m={schema:'evercraft.public-demand.document-inbox.v1',captures:[{key:parentKey,sha256:sha(parent),indices:[0]}]};
  write(manifestFile,JSON.stringify(m));
  const result=runDocumentCycle({root,manifestFile});
  assert.equal(result.result.state,'hold_document_date_conflict');
  assert.equal(result.pending,0);
  assert.equal(result.result.send_performed,false);
  assert.equal(runDocumentCycle({root,manifestFile}).state,'idle');
  m.captures[0].sha256='0'.repeat(64);write(manifestFile,JSON.stringify(m));
  assert.throws(()=>runDocumentCycle({root,manifestFile}),/parent_receipt_mismatch/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
