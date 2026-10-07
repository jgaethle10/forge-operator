import assert from 'node:assert/strict';
import test from 'node:test';
import { CHARTER_PATHS, buildCharterReadiness, compareCharterPaths } from './charter-readiness.mjs';

test('all charter paths fail closed with no evidence',()=>{
  for(const pathKey of Object.keys(CHARTER_PATHS)){
    const result=buildCharterReadiness({pathKey,evidence:{}});
    assert.equal(result.application_ready,false);
    assert.equal(result.regulated_execution_authorized,false);
    assert.equal(result.readiness_percent,0);
  }
});

test('federal credit union path explicitly requires field of membership and cooperative ownership',()=>{
  const path=CHARTER_PATHS.federal_credit_union;
  assert.equal(path.ownership_model,'member_owned_cooperative');
  assert.ok(path.requirements.includes('field_of_membership'));
  assert.ok(path.requirements.includes('share_insurance_path'));
});

test('Washington state bank path tracks interagency charter/deposit-insurance packet',()=>{
  const path=CHARTER_PATHS.washington_state_bank;
  assert.ok(path.requirements.includes('interagency_charter_and_deposit_insurance_application'));
  assert.ok(path.requirements.includes('biographical_and_financial_reports'));
});

test('complete evidence can make an application packet ready without authorizing banking',()=>{
  const path=CHARTER_PATHS.federal_credit_union;
  const evidence=Object.fromEntries(path.requirements.map(key=>[key,{status:'verified',ref:'evidence://'+key}]));
  const result=buildCharterReadiness({pathKey:path.path_key,evidence});
  assert.equal(result.application_ready,true);
  assert.equal(result.readiness_percent,100);
  assert.equal(result.regulated_execution_authorized,false);
});

test('comparison ranks more complete evidence first',()=>{
  const evidenceByPath={
    federal_credit_union:{
      purpose_and_need:{status:'verified',ref:'evidence://purpose'},
      field_of_membership:{status:'verified',ref:'evidence://fom'}
    }
  };
  const ranked=compareCharterPaths({evidenceByPath});
  assert.equal(ranked[0].path_key,'federal_credit_union');
});
