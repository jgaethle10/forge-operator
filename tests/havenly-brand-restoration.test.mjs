import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/havenly/index.html',import.meta.url),'utf8');
test('restoration keeps customer-owned branding and honest inquiry handling',()=>{
 for(const marker of ['id="story"','Meet Nikki.','id="faqs"','class="mobile-menu"','id="frequency"','id="homeSize"','id="preferences"','Frequency: ','Home size: ','Preferences: ','sms:+15095605190','mailto:havenlycleaning@gmail.com','Nothing is automatically submitted or booked'])assert.ok(html.includes(marker), 'Missing: '+marker);
 assert.match(html,/Come home to <em>a haven/);
 assert.doesNotMatch(html,/base44\.app|base44Client|@base44|September Reset/);
});

test('cleaning builder retains client-controlled, no-price quote handoff',()=>{
 for(const s of ['id="plan"','id="planService"','id="planBedrooms"','id="planBathrooms"','id="planSize"','id="planFrequency"','name="planAddon"','id="planQuote"','id="planSummary"','No instant price or booking','--- Cleaning brief ---','@media(max-width:480px)'])assert.ok(html.includes(s),'Missing: '+s);
 assert.match(html,/plan\.addEventListener\('change',updatePlanSummary\)/);
 assert.match(html,/Nothing is automatically submitted or booked/);
});
