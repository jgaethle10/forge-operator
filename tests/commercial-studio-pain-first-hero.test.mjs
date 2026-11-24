import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/commercial-studio/index.html',import.meta.url),'utf8');
test('first screen states exact introductory price, runtime and deliverable before brand features',()=>{
 const hero=html.slice(html.indexOf('<section class="hero">'),html.indexOf('</section>',html.indexOf('<section class="hero">')));
 assert.match(hero,/<em>\$50 commercial<\/em>/);
 assert.match(hero,/30-second social video/);
 assert.match(hero,/one included revision/);
 assert.match(hero,/No filming or ad spend included/);
 assert.ok(hero.indexOf('Request my $50 commercial')<hero.indexOf('</section>')||hero.includes('Request my $50 commercial'));
 assert.match(hero,/href="#inquire"/);
});
test('proof is not invented, and buying is still manual scope reviewed',()=>{
 assert.match(html,/<title>\$50 Small Business Commercial/);
 assert.match(html,/creativ[e]? review/i);
 assert.match(html,/No payment at inquiry/);
 assert.match(html,/Source materials/i);
 assert.match(html,/asset-rights review and client approval/i);
 assert.doesNotMatch(html,/guaranteed sale|guaranteed leads|100% ROI|We have delivered 100/);
});
test('working first-party lead submission remains present',()=>{
 assert.match(html,/api\/commercial-studio\/inquiry/);
 assert.match(html,/Send my commercial brief/);
 assert.match(html,/receipt\.received!==true/);
});


test('visible direct-email fallback is accessible before optional intake and never claims submission',()=>{
 const hero=html.slice(html.indexOf('<section class="hero">'),html.indexOf('</section>',html.indexOf('<section class="hero">')));
 assert.match(hero,/id="studio-email-hero"/);
 assert.match(hero,/mailto:jessegaethle10@gmail\.com\?subject=Evercraft%20%2450%20commercial%20brief/);
 assert.match(hero,/Email my brief directly/);
 assert.match(hero,/A request is not booked until we reply with a written scope/);
 assert.match(html,/The secure form could not confirm delivery/);
 assert.match(html,/Your details have NOT been confirmed received/);
 assert.match(html,/No payment at inquiry/);
});


test('verified $50 merchant link stays scoped and no public pay-now shortcut is advertised',()=>{
 assert.doesNotMatch(html,/4gM5kEd6K40d7ju86w4AU0e/);
 const linkedData=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(linkedData);
 const offer=JSON.parse(linkedData).offers;
 assert.equal(offer.price,'50.00');
 assert.equal(offer.url,'https://jgaethle10.github.io/forge-operator/commercial-studio/#inquire');
 assert.match(html,/Already approved a project\? Request payment instructions/);
 assert.match(html,/Email for verified payment instructions/);
 assert.match(html,/existing \$50 founding-commercial payment link has been verified as active in Evercraft LLC's live Stripe account/);
 assert.match(html,/We provide payment instructions only after confirming your approved project scope and schedule/);
 assert.doesNotMatch(html,/temporarily held pending verification against our payment account/);
 assert.doesNotMatch(html,/https:\/\/buy\.stripe\.com\/aFafZa4Yu5XE0ifdJX0Jq08/,'customer-facing checkout still requires individualized scope and approval');
 assert.match(html,/No payment or booking happens on this page/);
 assert.match(html,/Do not pay through a forwarded or unverified checkout URL/);
});
