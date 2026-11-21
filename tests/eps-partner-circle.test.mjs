import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPlan,ALLOWED_DAYS,WINDOWS,CIRCLES} from '../public/eps-partners/schedule.mjs';
const load=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('EPS local interest page is distinct, non-indexed and honestly framed',()=>{
 const page=load('public/eps-partners/index.html');
 assert.match(page,/EPS Partner Circle/);
 assert.match(page,/name="robots" content="noindex,nofollow"/);
 assert.match(page,/Not an active job offer/);
 assert.match(page,/No fee to express interest/);
 assert.match(page,/Nobody gets paid to recruit/);
 assert.match(page,/Worker classification/i);
 assert.match(page,/EVERCPS747OH/);
 assert.match(page,/https:\/\/secure\.lni\.wa\.gov\/verify\//);
 assert.match(page,/content="width=device-width,initial-scale=1"/);
 assert.match(page,/type="module" src="\.\/schedule\.mjs"/);
 assert.doesNotMatch(page,/guaranteed (?:income|earnings)|commission-only job|apply and start earning/i);
});

test('EPS application reuses founding Partners secure intake, not an independent payout or job form',()=>{
 const page=load('public/eps-partners/index.html');
 const partners=load('public/partners/index.html');
 const app=load('public/partners/app.mjs');
 assert.match(page,/\.\.\/partners\/\?focus=eps#apply/);
 assert.match(partners,/Local homeowners & property managers \(EPS\)/);
 assert.match(partners,/\.\.\/eps-partners\//);
 assert.match(app,/get\('focus'\)/);
 assert.match(app,/eps:'Local homeowners & property managers \(EPS\)'/);
 assert.match(app,/api\/partners/);
 assert.doesNotMatch(page,/<form[^>]*action=/);
});

test('weekly planner uses local selections only and stable allowed day order',()=>{
 assert.equal(ALLOWED_DAYS.length,7);
 assert.equal(Object.keys(WINDOWS).length,3);
 assert.equal(Object.keys(CIRCLES).length,4);
 const plan=buildPlan({days:['Friday','Monday','Monday'],timeWindow:'midday',circleType:'property'});
 assert.match(plan,/Monday: 12–2 PM/);
 assert.match(plan,/Friday: 12–2 PM/);
 assert.ok(plan.indexOf('Monday:')<plan.indexOf('Friday:'));
 assert.equal((plan.match(/Monday: /g)||[]).length,1);
 assert.match(plan,/EPS handles quotes, service contracts, payments and job scheduling/);
 assert.match(plan,/No activity is assigned, recorded, submitted or compensated/);
});

test('unselected or hostile plan values do not turn into instructions or network actions',()=>{
 assert.match(buildPlan({days:[]}),/Choose at least one day/);
 assert.throws(()=>buildPlan({days:['Tuesday'],timeWindow:'<script>'}),/unsupported_plan_choice/);
 assert.throws(()=>buildPlan({days:['Tuesday'],circleType:'unknown'}),/unsupported_plan_choice/);
 const script=load('public/eps-partners/schedule.mjs');
 assert.doesNotMatch(script,/\b(fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|sendBeacon)\s*\(/);
 assert.doesNotMatch(script,/navigator\.geolocation|document\.cookie/);
 assert.match(script,/navigator\.clipboard\.writeText/);
});

test('existing EPS quote intake retains separate customer referral value without a payout claim',()=>{
 const code=load('systemia/eps/public-quote-intake.mjs');
 assert.match(code,/referral_code:text\(payload\.referral_code,80\)/);
 assert.match(code,/execution_authority_granted:false/);
 assert.match(code,/payment_created:false/);
});

test('operator alliance preserves independent business identity and reuses existing Partners',()=>{
 const page=load('public/eps-partners/operators/index.html');
 const epsPage=load('public/eps-partners/index.html');
 const partners=load('public/partners/index.html');
 const app=load('public/partners/app.mjs');
 assert.match(page,/Your crew\. Your gear/);
 assert.match(page,/noindex,nofollow/);
 assert.match(page,/not.*guaranteed access to customers/i);
 assert.match(page,/who contracts with the customer/);
 assert.match(page,/separately registered eligible operator/);
 assert.match(page,/software design partner/i);
 assert.match(page,/Workflow X-Ray/);
 assert.match(page,/\$250 one-time/);
 assert.match(page,/Contractor beta/);
 assert.match(page,/No public self-service subscription/);
 assert.match(page,/Expressing alliance interest is free/);
 assert.match(page,/franchise, licensing, branding/i);
 assert.match(page,/\.\.\/\.\.\/partners\/\?focus=eps_operator#apply/);
 assert.match(epsPage,/href="\.\/operators\/"/);
 assert.match(partners,/Independent field-service operator \(EPS\)/);
 assert.match(partners,/\.\.\/eps-partners\/operators\//);
 assert.match(app,/eps_operator:'Independent field-service operator \(EPS\)'/);
 assert.doesNotMatch(page,/join fee|exclusive region|monthly royalty|start earning now/i);
});
