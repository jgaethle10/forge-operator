import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('first-party independent branded partner entry exists with accurate discovery URLs',()=>{
 const page=load('public/partners/index.html');
 assert.match(page,/<title>Evercraft Partners/);
 assert.match(page,/https:\/\/jgaethle10\.github\.io\/forge-operator\/partners\//);
 assert.match(page,/public|Founding partner applications now open/);
 assert.match(page,/\.\/mark\.svg/);
 assert.ok(existsSync(new URL('../public/partners/social-card.svg',import.meta.url)));
 assert.match(load('public/partners/mark.svg'),/<svg/);
 assert.match(load('public/partners/llms.txt'),/Founding partner expressions of interest only/);
});
test('buyer-facing entry remains simple, mobile friendly and accessible',()=>{
 const page=load('public/partners/index.html');
 assert.match(page,/name="viewport"/);
 assert.match(page,/@media\(max-width:700px\)/);
 assert.match(page,/id="partner-application"/);
 assert.match(page,/required maxlength="120"/);
 assert.match(page,/type="email" autocomplete="email" required/);
 assert.match(page,/id="understand" required/);
 assert.match(page,/form\.reportValidity\(\)/);
 assert.match(page,/aria-live="polite"/);
 assert.match(page,/prefilled email/i);
 assert.match(page,/Nothing is submitted automatically/);
});
test('partner compensation and recruitment cannot be presented as active earnings',()=>{
 const page=load('public/partners/index.html');
 const terms=load('public/partners/terms.html');
 assert.match(page,/not partner acceptance, a promise of commission/);
 assert.match(page,/Clear written terms before any compensated activity/);
 assert.match(page,/No requirement to recruit other people/);
 assert.match(terms,/No commission amount, conversion rate, earnings, or payout schedule is currently guaranteed/);
 assert.match(terms,/Recruitment alone never earns compensation/);
 assert.doesNotMatch(page,/\d+% (?:commission|payout)/i);
 assert.doesNotMatch(page,/guaranteed earnings/i);
});
test('application explicitly requires human email send, not phantom server intake',()=>{
 const page=load('public/partners/index.html');
 assert.match(page,/window\.location\.href='mailto:jessegaethle10@gmail\.com/);
 assert.match(page,/event\.preventDefault\(\)/);
 assert.match(page,/Press Send in your email app/);
 assert.match(page,/mailto:jessegaethle10@gmail\.com/);
 assert.doesNotMatch(page,/<form[^>]+action="https?:\/\//);
});
test('third-party services are referenced only by their honest current inquiry pages',()=>{
 const page=load('public/partners/index.html');
 assert.match(page,/\.\.\/mesh\/ai-boardroom\//);
 assert.match(page,/\.\.\/research\//);
 assert.match(page,/\.\.\/forensiscope\//);
 assert.doesNotMatch(page,/base44|aliev|rivet/i);
});
