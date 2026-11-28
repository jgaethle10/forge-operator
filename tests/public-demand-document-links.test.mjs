import test from 'node:test';
import assert from 'node:assert/strict';
import {collectPublicDocumentLinks} from '../systemia/evercraft-web/browser-worker/document-link-contract.mjs';
test('late first-party solicitation survives navigation and budget saturation',()=>{
 const anchors=Array.from({length:180},(_,i)=>({href:'https://www.yvl.org/nav/'+i,textContent:'Navigation'}));
 anchors.push(...Array.from({length:200},(_,i)=>({href:'https://www.yvl.org/budget-'+i+'.pdf',textContent:'Budget'})));
 anchors.push({href:'https://www.yvl.org/RFP-26-002.pdf',textContent:'Open bid'},{href:'https://www.yvl.org/RFP-26-002-Addendum.pdf',textContent:'Addendum'},{href:'https://other.example/RFP.pdf',textContent:'Foreign'});
 globalThis.document={querySelectorAll:()=>anchors};globalThis.location={origin:'https://www.yvl.org'};
 try{const r=collectPublicDocumentLinks();assert.equal(r.anchors_scanned,383);assert.equal(r.eligible_count,202);assert.equal(r.output_truncated,true);assert.equal(r.scan_truncated,false);assert.deepEqual(r.links.slice(0,2).map(x=>x.href),['https://www.yvl.org/RFP-26-002.pdf','https://www.yvl.org/RFP-26-002-Addendum.pdf']);}
 finally{delete globalThis.document;delete globalThis.location;}
});
