import test from 'node:test';
import assert from 'node:assert/strict';
import {rankDocumentPointers} from '../systemia/revenue-desk/public-demand-capture.mjs';
const source='https://buyer.example/purchasing/';
const link=(name,text='')=>({href:'https://buyer.example/docs/'+name,text});
test('late RFP and addendum survive historical budget saturation',()=>{
 const links=[...Array.from({length:40},(_,i)=>link('Budget-'+i+'.pdf')),link('RFP-26-002-Website.pdf'),link('Addendum-1.pdf')];
 const result=rankDocumentPointers(source,links);
 assert.equal(result.eligible_count,42);
 assert.equal(result.truncated,true);
 assert.equal(result.pointers.length,20);
 assert.deepEqual(result.pointers.slice(0,2).map(p=>p.research_priority),[0,0]);
 assert.match(result.pointers[0].url,/RFP/);
 assert.match(result.pointers[1].url,/Addendum/);
});
test('same origin, no credentials or query, deduplicated and unverified',()=>{
 const result=rankDocumentPointers(source,[link('Request%20for%20Proposal.pdf'),link('Request%20for%20Proposal.pdf#page=2'),{href:'https://other.example/rfp.pdf'},{href:'https://buyer.example/rfp.pdf?token=secret'},{href:'https://user@buyer.example/rfp.pdf'},{href:'https://buyer.example/rfp.exe'}]);
 assert.equal(result.eligible_count,1);
 assert.equal(result.pointers[0].status,'unverified_document_pointer');
 assert.equal(result.pointers[0].research_priority,0);
 assert.equal(result.truncated,false);
});
