import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {auditClientExperienceHtml,CLIENT001} from '../systemia/experience/client-experience-contract.mjs';

const source=fs.readFileSync(CLIENT001.sourcePath,'utf8');
const audit=html=>auditClientExperienceHtml(html);
const failure=(html,id)=>{
 const result=audit(html);
 assert.equal(result.state,'source_fail');
 assert.ok(result.failures.some(v=>v.id===id),`expected ${id} failure, found ${result.failures.map(x=>x.id).join(',')}`);
};

test('Client 001 meets enforceable source-level customer release checks',()=>{
 const result=audit(source);
 assert.equal(result.state,'source_pass',JSON.stringify(result.failures));
 assert.equal(result.browser_state,'unverified');
 assert.equal(result.client_approval,'unverified');
 assert.equal(result.live_state,'unverified');
 assert.ok(result.checks.length>=20);
});

test('blocks desktop phone-only navigation',()=>{
 failure(source.replace('class="nav-phone" href="#contact"','class="nav-phone" href="tel:+15098335025"'),'nav_desktop_nondialer');
});
test('blocks desktop phone-only primary hero',()=>{
 failure(source.replace('href="#contact" data-i18n="callService"','href="tel:+15098335025" data-i18n="callService"'),'hero_desktop_nondialer');
});
test('blocks buried desktop email action',()=>{
 const mutated=source.replace('id="emailCta"','id="removedEmailCta"');
 failure(mutated,'email_first');
});
test('blocks removal of visible copyable desktop business email',()=>{
 failure(source.replace('id="copyEmail"','id="disabledCopyEmail"'),'email_fallback');
});
test('blocks unprofessional owner-first public buttons',()=>{
 failure(source.replace("mobileCall:'☎  Call On The Go'","mobileCall:'☎  Call Juan'"),'professional_ctas');
});
test('blocks incomplete Spanish contact translations',()=>{
 failure(source.replace("emailCta:'✉  Solicitar servicio por correo'","emailCta:'✉  ---'"),'bilingual_contact');
});
test('blocks missing inquiry selection wiring',()=>{
 failure(source.replace("function refreshSelection()","function refreshInputDraft()"),'selection_to_inquiry');
});
test('blocks external scripts and trackers',()=>{
 failure(source.replace('</head>','<script src="https://example.invalid/sdk.js"></script></head>'),'no_external_runtime');
 failure(source.replace('</head>','<script>gtag("config");</script></head>'),'privacy_and_jargon');
});
test('blocks pretending booking is active',()=>{
 failure(source.replaceAll('Not a live booking service','Live booking active').replaceAll('This preview does not accept bookings','Book online now'),'not_false_booking');
});
test('source PASS never implies actual customer/publishing PASS',()=>{
 const result=audit(source);
 assert.equal(result.state,'source_pass');
 assert.notEqual(result.browser_state,'browser_pass');
 assert.notEqual(result.client_approval,'client_approved');
 assert.notEqual(result.live_state,'preview_live_verified');
});
