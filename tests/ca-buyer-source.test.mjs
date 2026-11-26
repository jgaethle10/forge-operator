import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCanadaCsv,normalizeCanada,collectCanada} from '../systemia/revenue-desk/ca-buyer-source.mjs';
import {planBuyerResearch} from '../systemia/revenue-desk/buyer-research-plan.mjs';
const now=new Date('2026-11-25T00:00:00Z');
const fields=['title-titre-eng','title-titre-fra','referenceNumber-numeroReference','tenderClosingDate-appelOffresDateCloture','tenderStatus-appelOffresStatut-eng','contractingEntityName-nomEntitContractante-eng','contractingEntityName-nomEntitContractante-fra','noticeURL-URLavis-eng','noticeURL-URLavis-fra','tenderDescription-descriptionAppelOffres-eng','tenderDescription-descriptionAppelOffres-fra'];
const row=['','Production vidéo','example-001','2026-12-12T14:00:00-0500','Open','Example Authority','Autorité exemple','https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/example-001','','','Vidéo, montage et "sous-titres"\nLivraison numérique'];
const encode=r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',');
const csv=(...rows)=>[encode(fields),...rows.map(encode)].join('\r\n');
test('CSV preserves accents, quoted commas, doubled quotes and multiline content',()=>{
 const p=parseCanadaCsv('\uFEFF'+csv(row));
 assert.deepEqual(p.header,fields);assert.deepEqual(p.rows,[row]);
});
test('French demand becomes one deduplicated, unqualified research candidate',()=>{
 const r=normalizeCanada(csv(row,row),{now});
 assert.equal(r.records_observed,2);assert.equal(r.candidates.length,1);
 const c=r.candidates[0];
 assert.equal(c.suggested_lane,'media');assert.equal(c.deadline,'2026-12-12T19:00:00.000Z');
 assert.equal(c.qualified,false);assert.equal(c.contact_authorized,false);
 assert.equal(r.send_performed,false);
 const p=planBuyerResearch({schema:'evercraft.kaidance.discovery-checkpoint.v1',records:r.candidates},{now});
 assert.equal(p.jobs.length,1);assert.equal(p.jobs[0].execution_authorized,false);
});
test('closed, expired, unzoned and spoofed notices cannot enter research',()=>{
 for(const [i,v] of [[4,'Closed'],[3,'2026-11-20T14:00:00-0500'],[3,'2026-12-12T14:00:00'],[7,'https://example.test/en/tender-opportunities/test']]){
  const r=[...row];r[i]=v;
  assert.equal(normalizeCanada(csv(r),{now}).candidates.length,0);
 }
});
test('unexpected schema and malformed CSV fail closed',()=>{
 assert.throws(()=>normalizeCanada('unexpected,header\n1,2',{now}),/ca_schema_changed/);
 assert.throws(()=>parseCanadaCsv('a,b\n"unclosed'),/ca_unclosed_quote/);
 assert.throws(()=>parseCanadaCsv('a,b\n1,2,3'),/ca_row_width/);
});
test('collector uses official endpoint and read-only request',async()=>{
 const r=await collectCanada({now,fetchFn:async(url,options)=>{
  assert.equal(url,'https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv');
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  return new Response(csv(row));
 }});
 assert.equal(r.candidates.length,1);
});
