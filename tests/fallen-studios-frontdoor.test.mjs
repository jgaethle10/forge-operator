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
 assert.match(landing,/A publicly hosted video preview is not yet part of this page/);
 assert.match(landing,/no automatic purchase or guaranteed production slot/i);
 assert.match(landing,/checkout, if offered, follows written approval/i);
 assert.doesNotMatch(landing,/buy\.stripe\.com|<video[^>]+src=|verified client results|thousands of clients|auto[- ]deliver/i);
 assert.match(landing,/Evercraft Research/);
 assert.doesNotMatch(landing,/base44|metricool/i);
});
test("accessible mobile layout, OG metadata, source honesty",()=>{
 assert.match(landing,/@media\(max-width:440px\)/);
 assert.match(landing,/prefers-reduced-motion/);
 assert.match(landing,/aria-label="Fallen Studios home"/);
 assert.match(landing,/role="img" aria-label="Original typographic preview artwork/);
 const match=landing.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
 assert.ok(match);
 const schema=JSON.parse(match[1]);
 assert.equal(schema.name,"Fallen Studios by Evercraft");
 assert.equal(schema.parentOrganization.name,"Evercraft LLC");
});
