import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const landing=read("public/fallen-studios/index.html");
const existing=read("public/commercial-studio/index.html");
test("Fallen Studios has a dedicated original customer front door",()=>{
 assert.match(landing,/<title>Fallen Studios \| Original commercials by Evercraft<\/title>/);
 assert.match(landing,/<h1>Your story deserves/);
 assert.match(landing,/Fallen Studios is Evercraft's owned creative production lane/);
 assert.match(landing,/id="commission"/);
 assert.match(landing,/canonical" href="https:\/\/jgaethle10.github.io\/forge-operator\/fallen-studios\/"/);
});
test("customer inquiry routes to the already owned commercial studio intake, no duplicate endpoint",()=>{
 assert.match(landing,/href="\.\.\/commercial-studio\/#inquire"/);
 assert.match(existing,/id="studio-request"/);
 assert.match(existing,/https:\/\/fabric.systemiacommandcenters.com\/api\/commercial-studio\/inquiry/);
 assert.doesNotMatch(landing,/<form\b|fetch\(/);
 assert.match(landing,/after the brief, capacity and delivery terms are accepted/);
});
test("Fallen front door never invents hosted video, checkout, client testimonials or auto-delivery",()=>{
 assert.match(landing,/A playable public video will appear only after the master and distribution rights pass review/);
 assert.match(landing,/not an automatic purchase or guaranteed production slot/i);
 assert.match(landing,/checkout, if offered, follows written approval/i);
 assert.doesNotMatch(landing,/buy\.stripe\.com|<video[^>]+src=|verified client results|thousands of clients|auto[- ]deliver/i);
 assert.match(landing,/Evercraft Research/);
 assert.doesNotMatch(landing,/base44|metricool/i);
});
test("accessible mobile layout, OG metadata, source honesty",()=>{
 assert.match(landing,/@media\(max-width:440px\)/);
 assert.match(landing,/prefers-reduced-motion/);
 assert.match(landing,/aria-label="Fallen Studios home"/);
 assert.match(landing,/role="img" aria-label="Dark and gold editorial title card/);
 const match=landing.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
 assert.ok(match);
 const schema=JSON.parse(match[1]);
 assert.equal(schema.name,"Fallen Studios by Evercraft");
 assert.equal(schema.parentOrganization.name,"Evercraft LLC");
});

test("Fallen showcase uses the studio dark-and-gold palette, not a competing blue Research promotional panel",()=>{
 assert.match(landing,/\.poster\{[^}]*linear-gradient\(145deg,#27221c,#11151b/);
 assert.match(landing,/CUT 02 UNDER REVIEW/);
 assert.match(landing,/FALLEN STUDIOS \/ FILM STUDY 001/);
 assert.doesNotMatch(landing,/#102c38,#1b5b62|#307a80|#d5fffb25/);
 assert.match(landing,/This dark editorial study is not the commercial itself/);
});


test("iPhone-sized layout uses intrinsically shrinkable grid tracks and a bounded poster",()=>{
 assert.match(landing,/\.two\{[^}]*grid-template-columns:minmax\(0,1\.05fr\) minmax\(0,\.95fr\)/);
 assert.match(landing,/\.two>\*\{min-width:0;max-width:100%\}/);
 assert.match(landing,/\.poster\{[^}]*width:100%;max-width:100%;min-width:0/);
 assert.match(landing,/@media\(max-width:800px\)\{[^}]*\.two\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(landing,/\.poster\{aspect-ratio:auto;min-height:285px\}/);
 assert.match(landing,/\.poster strong\{[^}]*overflow-wrap:break-word/);
 assert.match(landing,/\.poster span,\.poster small\{overflow-wrap:anywhere/);
 assert.doesNotMatch(landing,/overflow-x:hidden|overflow-x:clip/); // fix actual sizing, never mask it
});
