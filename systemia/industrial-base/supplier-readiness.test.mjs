import assert from 'node:assert/strict';
import test from 'node:test';
import {buildPublicSupplierReadiness} from './supplier-readiness.mjs';

test('matches Evercraft capabilities only to Boeing public general supplier categories',()=>{
  const packet=buildPublicSupplierReadiness({
    company:'Evercraft LLC',
    capabilities:[
      'AI software engineering and agent orchestration',
      'data systems, studies, analysis and research',
      'geospatial decision support',
      'testing and evaluation software'
    ],
    evidence_refs:['repo:forge-operator'],
    certifications:[],
    registrations:{buyer_capability_profile:false,sam_gov:false}
  },{
    buyer:'Boeing',
    categories:[
      {key:'technology',terms:['technology','testing and evaluation','studies','analysis','research']},
      {key:'aerospace-support',terms:['engineering services','ground support equipment','training services']},
      {key:'avionics',terms:['navigation','guidance','mission management','sensors']}
    ],
    registration_path:'Enterprise Supplier LifeCycle capability registration',
    source_refs:['public:boeing-suppliers:become'],
    disclaimer:'Registration does not guarantee business or contracts.'
  });

  assert.equal(packet.buyer,'Boeing');
  assert.equal(packet.matched_public_categories.some((row)=>row.category_key==='technology'),true);
  assert.equal(packet.matched_public_categories.some((row)=>row.category_key==='avionics'),false);
  assert.equal(packet.boundary.sensitive_program_mapping_allowed,false);
  assert.ok(packet.missing.includes('buyer_capability_registration'));
});

test('fails closed without buyer source lineage',()=>{
  assert.throws(()=>buildPublicSupplierReadiness({
    company:'Evercraft LLC',
    capabilities:['research'],
    evidence_refs:['repo:forge-operator']
  },{
    buyer:'Example',
    categories:[{key:'technology',terms:['research']}],
    source_refs:[]
  }),/source_refs/i);
});
