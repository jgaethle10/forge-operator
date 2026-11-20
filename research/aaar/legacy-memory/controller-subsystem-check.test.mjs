import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkControllerSubsystem} from './controller-subsystem-check.mjs';
const source=JSON.parse(readFileSync(new URL('./controller-subsystem-case-2026-11-19.json',import.meta.url),'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));
test('CCU 8MB ceiling does not become a PCU20 ceiling',()=>{
 const r=checkControllerSubsystem(source);const a=r.checks[0],b=r.checks[1];
 assert.ok(a.hold_flags.includes('ABOVE_CCU_PUBLISHED_CAPACITY_LIMIT'));
 assert.ok(!b.hold_flags.includes('ABOVE_CCU_PUBLISHED_CAPACITY_LIMIT'));
 assert.ok(b.hold_flags.includes('PCU20_MAXIMUM_SUPPORTED_CAPACITY_NOT_ESTABLISHED_BY_THIS_SOURCE'));
});
test('PCU20 8MB card below 8MB image minimum',()=>{
 const r=checkControllerSubsystem(source);assert.ok(r.checks[2].hold_flags.includes('BELOW_PCU20_PUBLISHED_MINIMUM_FOR_IMAGE'));
});
test('even 256MB above minimum is never approved for PCU20',()=>{
 const r=checkControllerSubsystem(source);assert.equal(r.checks[1].state,'EVIDENCE_AND_SPECIALIST_REVIEW_HOLD');assert.equal(r.checks[1].compatible,false);assert.equal(r.automatic_fitment_approval,false);
});
test('unknown subsystem always held',()=>{
 const x=clone(source);x.requests[0].subsystem_id='UNKNOWN';const r=checkControllerSubsystem(x);assert.ok(r.checks[0].hold_flags.includes('SUBSYSTEM_NOT_IDENTIFIED_IN_SOURCE'));
});
test('missing CF adapter is flagged',()=>{
 const x=clone(source);x.requests[1].adapter_present=false;const r=checkControllerSubsystem(x);assert.ok(r.checks[1].hold_flags.includes('PCU20_CF_PCMCIA_ADAPTER_NOT_CONFIRMED'));
});
test('wrong PCU20 medium cannot be treated as proven',()=>{
 const x=clone(source);x.requests[1].media_kind='PCMCIA_TYPE_II_FLASH';const r=checkControllerSubsystem(x);assert.ok(r.checks[1].hold_flags.includes('MEDIUM_NOT_DOCUMENTED_FOR_PCU20_USE_CASE'));
});
test('invalid official source URL fails closed',()=>{
 const x=clone(source);x.references[0].official_manual_url='file:///fake';assert.throws(()=>checkControllerSubsystem(x),/invalid_official_reference/);
});
test('no case authorizes procurement or a quote',()=>{
 const r=checkControllerSubsystem(source);assert.equal(r.automatic_sourcing_order,false);assert.ok(r.checks.every(x=>!x.purchase_authorized&&!x.quoted&&!x.compatible));
});
