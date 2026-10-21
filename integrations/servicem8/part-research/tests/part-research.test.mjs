import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handler,FINDMYPART_FREE_ENTRY,ACTION} from '../src/index.mjs';

const manifest=JSON.parse(readFileSync(new URL('../addon.jsonc',import.meta.url),'utf8'));

test('job card action exists on web and app with zero ServiceM8 scopes',()=>{
 assert.equal(manifest.slug,'evercraft-part-research-pilot');
 assert.equal(manifest.actions.length,2);
 assert.deepEqual(new Set(manifest.actions.map(x=>x.type)),new Set(['online','app']));
 assert(manifest.actions.every(x=>x.event===ACTION&&x.entity==='job'));
 assert.equal(Object.hasOwn(manifest,'oauth'),false);
 assert.equal(Object.hasOwn(manifest,'webhooks'),false);
 assert.equal(Object.hasOwn(manifest,'preferences'),false);
});
test('user-triggered action opens safe opt-in free browser handoff',async()=>{
 const r=await handler({eventName:ACTION});
 assert.match(r.eventResponse,/<a class="action" href="https:\/\/findmypart\.base44\.app\/free-part-check"/);
 assert.equal(FINDMYPART_FREE_ENTRY,'https://findmypart.base44.app/free-part-check');
 assert.match(r.eventResponse,/rel="noopener noreferrer"/);
 assert.match(r.eventResponse,/Paid research, if offered later, requires a separate explicit purchase/);
});
test('no job context or access tokens leak to user, even as malicious HTML',async()=>{
 const privateValue='<img src=x onerror=alert(1)>SECRET-JOB-2026';
 const r=await handler({eventName:ACTION,eventArgs:{jobUUID:privateValue,companyUUID:privateValue},auth:{accessToken:privateValue}});
 assert.doesNotMatch(r.eventResponse,/SECRET-JOB-2026|onerror=alert/);
 assert.doesNotMatch(r.eventResponse,/checkout\.stripe|\/api\/offers|fetch\(|authorization|token=/i);
});
test('unknown events fail closed, no accidental action dispatch',async()=>{
 const r=await handler({eventName:'unknown_event',eventArgs:{jobUUID:'secret'}});
 assert.match(r.eventResponse,/Action unavailable/);
 assert.doesNotMatch(r.eventResponse,/Open free part check/);
});
test('all actions are display-only and no write webhooks, purchase or data sync are configured',()=>{
 const source=readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\(|\bhttps\.request\(|\bPOST\b|publish_diary_items|read_jobs|write_jobs|manage_customers|sessionStorage|localStorage/);
 assert(!JSON.stringify(manifest).includes('billing'));
});


test('manifest is compatible with pinned local ServiceM8 Addon Kit package',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.private,true);
 assert.equal(pkg.devDependencies['@servicem8/addon-kit'],'1.3.1');
 assert.equal(manifest.$schema,'./node_modules/@servicem8/addon-kit/addon-schema.json');
 assert.equal(Object.hasOwn(manifest,'addonTargetAudience'),false,'Addon Kit 1.3.1 rejects this optional field');
});
