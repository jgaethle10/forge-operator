import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {runDocumentCycle} from '../systemia/revenue-desk/public-demand-document-cycle.mjs';
import {auditCommercialQueue} from '../systemia/revenue-desk/public-demand-commercial-queue-audit.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const flags={qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
test('read-only audit separates pending, verified review, date conflict and corrupted receipts',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'commercial-audit-'));
 try{
  const captures=path.join(root,'captures'),docs=path.join(root,'documents'),cycles=path.join(root,'document-cycle-receipts');
  for(const dir of [captures,docs,cycles])fs.mkdirSync(dir,{mode:0o700});
  const write=(file,data)=>fs.writeFileSync(file,data,{mode:0o600});
  const source='https://www.susta.org/contact/rfp/',urls=['review','conflict','pending'].map(x=>'https://www.susta.org/'+x+'.pdf');
  const text='Purchasing index';
  const parent=Buffer.from(JSON.stringify({capture:{source_url:source,state:'captured_requires_research',text,text_sha256:sha(text),document_pointers:urls.map(url=>({url,status:'unverified_document_pointer'})),...flags}}));
  const parentKey='a'.repeat(64);write(path.join(captures,parentKey+'.json'),parent);
  const manifestFile=path.join(root,'document-inbox.json');
  write(manifestFile,JSON.stringify({schema:'evercraft.public-demand.document-inbox.v1',captures:[{key:parentKey,sha256:sha(parent),indices:[0,1,2]}]}));
  const keys=urls.map(url=>sha(JSON.stringify({url,parent_receipt_sha256:sha(parent),parent_source:source})));
  for(let i=0;i<2;i++){
   const job={url:urls[i],parent_receipt_sha256:sha(parent),parent_source:source},stem=path.join(docs,keys[i]);
   const pdf=Buffer.from('%PDF- synthetic bytes never parsed');
   const text='November 16, '+(i===0?'2026':'2027')+'\nScope of Work\fAll proposals from bidders must be submitted by December 7, 2026.';
   write(stem+'.pdf',pdf);
   write(stem+'.json',JSON.stringify({schema:'evercraft.public-demand.pdf-evidence.v1',...job,pdf_sha256:sha(pdf),pdf_bytes:pdf.length,state:'extracted_requires_research',text,text_sha256:sha(text),page_limit:40,...flags}));
   runDocumentCycle({root,manifestFile});
  }
  const before=auditCommercialQueue({root});
  assert.deepEqual(before.counts,{admitted:3,pending:1,verified_document_results:2,commercial_review_required:1,worker_holds:0,evidence_integrity_holds:0,date_review_holds:1,qualified:0});
  assert.deepEqual(before.review_queue,[keys[0]]);
  assert.equal(before.write_performed,false);
  write(path.join(docs,keys[0]+'.pdf'),'%PDF- corrupted');
  write(path.join(cycles,keys[2]+'.json'),'{}');
  const after=auditCommercialQueue({root});
  assert.equal(after.counts.evidence_integrity_holds,2);
  assert.equal(after.counts.verified_document_results,1);
  assert.equal(after.review_queue.length,0);
  assert.equal(after.contact_authorized,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
