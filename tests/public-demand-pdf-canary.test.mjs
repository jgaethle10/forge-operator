import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {planReceiptBoundPdfs} from '../systemia/revenue-desk/public-demand-pdf-canary.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(url='https://www.susta.org/docs/RFP.pdf'){
 const text='Published procurement notice';
 const raw=Buffer.from(JSON.stringify({capture:{source_url:'https://www.susta.org/contact/rfp/',state:'captured_requires_research',qualified:false,contact_authorized:false,execution_authorized:false,text,text_sha256:sha(text),document_pointers:[{url,status:'unverified_document_pointer'}]}}));
 return {raw,hash:sha(raw)};
}
test('only receipt-bound first party PDF selected',()=>{
 const {raw,hash}=fixture();
 assert.equal(planReceiptBoundPdfs(raw,hash,[0])[0].parent_receipt_sha256,hash);
 assert.throws(()=>planReceiptBoundPdfs(raw,'0'.repeat(64),[0]),/parent_receipt_mismatch/);
 assert.throws(()=>planReceiptBoundPdfs(raw,hash,[0,0]),/invalid_selection/);
});
test('foreign origin and query-bearing or non-PDF URLs held',()=>{
 for(const url of ['https://example.org/RFP.pdf','https://www.susta.org/RFP.pdf?token=abc','https://www.susta.org/RFP.docx']){
  const {raw,hash}=fixture(url);
  assert.throws(()=>planReceiptBoundPdfs(raw,hash,[0]),/invalid_pdf_pointer/);
 }
});
