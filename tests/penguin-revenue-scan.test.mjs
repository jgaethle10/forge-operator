import test from 'node:test';
import assert from 'node:assert/strict';
import {scanTarget,scanTargets,observeHomepage,validateTarget} from '../scripts/penguin-revenue-scan.mjs';
const target={company:'Sample Business',site:'https://example.org/'};
const response=(html,status=200)=>({ok:status===200,status,headers:{get:()=> 'text/html; charset=utf-8'},text:async()=>html});
const lookup=async()=>[{address:'8.8.8.8',family:4}];
test('rejects non-homepages and private or malformed targets',()=>{
 assert.throws(()=>validateTarget({company:'X',site:'http://example.org/'}));
 assert.throws(()=>validateTarget({company:'X',site:'https://127.0.0.1/'}));
 assert.throws(()=>validateTarget({company:'X',site:'https://example.org/admin'}));
});
test('does not invent an issue when contact link exists',()=>{
 assert.deepEqual(observeHomepage('<a href="/about">About</a><a href="/contact">Contact</a>',target.site,'2026-11-18'),[]);
});
test('produces review-only evidence from observable HTML',async()=>{
 const r=await scanTarget(target,{lookup,fetcher:async()=>response('<a href="/about">About</a><a href="/services">Services</a>'),now:new Date('2026-11-18T20:00:00Z')});
 assert.equal(r.state,'observed');
 assert.match(r.entry.observations[0].evidence,/not proof/);
 const batch=await scanTargets([target],{lookup,fetcher:async()=>response('<a href="/about">About</a><a href="/services">Services</a>'),now:new Date('2026-11-18T20:00:00Z')});
 assert.equal(batch.desk.qualified.length,1);
 assert.equal(batch.desk.qualified[0].draft.send_authorized,false);
});
test('blocks private DNS response and redirect',async()=>{
 let called=false;
 const blocked=await scanTarget(target,{lookup:async()=>[{address:'192.168.1.2',family:4}],fetcher:async()=>{called=true}});
 assert.equal(blocked.state,'held');assert.equal(called,false);
 const redirect=await scanTarget(target,{lookup,fetcher:async()=>response('',302)});
 assert.equal(redirect.state,'held');
});
