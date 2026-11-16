import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateExternalSkill,evaluateExternalSkillRegistry} from './external-skill-intake.mjs';

const base=()=>({
 id:'vercel-web-design-guidelines',
 product_key:'audit-center-website-audit-machine-v1',
 execution_mode:'instructions_only',
 source:{repository:'https://github.com/vercel-labs/agent-skills',path:'skills/web-design-guidelines/SKILL.md',commit:'a'.repeat(40),sha256:'b'.repeat(64)},
 legal:{spdx:'MIT',reviewed:true,notice_path:'LICENSE'},
 review:{source_reviewed:true,dependencies_reviewed:true,sandbox_passed:true,fixture_comparison_passed:true,product_contract_checked:true,owner_approved:true},
 requested_scopes:[]
});
test('the three discovered candidates remain quarantined',()=>{
 const registry=JSON.parse(fs.readFileSync(new URL('./external-skill-candidates.json',import.meta.url),'utf8'));
 const result=evaluateExternalSkillRegistry(registry);
 assert.equal(result.count,3);assert.equal(result.eligible,0);
 assert.ok(result.results.every(x=>x.state==='quarantined'&&!x.executable));
});
test('even complete paperwork never grants execution',()=>{
 const x=evaluateExternalSkill(base());
 assert.equal(x.state,'eligible_for_separate_contract_admission');
 assert.equal(x.executable,false);assert.equal(x.customer_data_allowed,false);
 assert.equal(x.payment_or_contact_authorized,false);assert.equal(x.product_live_verified,false);
});
test('missing source pin, digest or license review blocks admission',()=>{
 for(const field of ['commit','sha256']){const c=base();c.source[field]=null;assert.equal(evaluateExternalSkill(c).state,'quarantined');}
 const c=base();c.legal.reviewed=false;assert.ok(evaluateExternalSkill(c).blockers.includes('license_review_unverified'));
});
test('execution, credentials, and network-scoped candidates are blocked',()=>{
 const c=base();c.execution_mode='run_shell';c.requested_scopes=['exec','credentials','network'];
 const x=evaluateExternalSkill(c);assert.equal(x.state,'quarantined');
 assert.ok(x.blockers.includes('execution_not_read_only'));
 assert.ok(x.blockers.includes('forbidden_scope:exec'));
 assert.ok(x.blockers.includes('forbidden_scope:credentials'));
});
test('missing or null scope declaration fails closed',()=>{
 const c=base();delete c.requested_scopes;assert.equal(evaluateExternalSkill(c).state,'quarantined');
 c.requested_scopes=null;assert.equal(evaluateExternalSkill(c).state,'quarantined');
});
