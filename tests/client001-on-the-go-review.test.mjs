import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

const html=fs.readFileSync('public/clients/on-the-go/review/index.html','utf8');

test('client preview is unlisted, branded and contact-first',()=>{
 assert.match(html,/<meta name="robots" content="noindex,nofollow,noarchive">/);
 assert.match(html,/CLIENT REVIEW/);
 assert.match(html,/Not a live booking service/);
 assert.match(html,/ON THE GO/);
 assert.match(html,/tel:\+15098335025/);
 assert.match(html,/mailto:onthegomobileoilchange@outlook\.com/);
 assert.doesNotMatch(html,/<script[^>]+src\s*=/i);
 assert.doesNotMatch(html,/\bfetch\s*\(/);
 assert.doesNotMatch(html,/google-analytics|gtag\(|facebook\.com\/tr|pixel\.js/i);
 assert.doesNotMatch(html,/squareup\.com\/oauth|squareup\.com\/payments/);
});

test('both language choices and service inquiry remain with no tracking jargon',()=>{
 assert.match(html,/id="en"/);
 assert.match(html,/id="es"/);
 assert.match(html,/Cambio de aceite sintético/);
 assert.match(html,/Full synthetic oil change/);
 assert.match(html,/emailSubject:'On The Go service inquiry'/);
 assert.match(html,/emailSubject:'Consulta de servicio On The Go'/);
 assert.doesNotMatch(html,/beaconTitle|beaconDesc|refCode|EC-DIRECT-001|emailRef|emailSource/);
 assert.doesNotMatch(html,/How optional referral tracking would work/);
 const start=html.indexOf('<div class="contact-card">');
 const card=html.slice(start,html.indexOf('</section>',start));
 assert.ok(start>0&&card.indexOf('id="emailCta"')>=0&&card.indexOf('id="callCta"')>card.indexOf('id="emailCta"'),'desktop contact must put email before call');
 assert.match(card,/id="copyEmail"/);
 assert.match(card,/onthegomobileoilchange@outlook\.com/);
 assert.match(html,/href="#contact" aria-label="Request service from On The Go"/);
});
