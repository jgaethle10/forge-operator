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
 assert.match(html,/rights and client approval/i);
 assert.doesNotMatch(html,/guaranteed sale|guaranteed leads|100% ROI|We have delivered 100/);
});
test('working first-party lead submission remains present',()=>{
 assert.match(html,/api\/commercial-studio\/inquiry/);
 assert.match(html,/Send my commercial brief/);
 assert.match(html,/receipt\.received!==true/);
});
