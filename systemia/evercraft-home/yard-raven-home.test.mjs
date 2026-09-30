import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(here,"public","index.html"),"utf8");
const server=fs.readFileSync(path.join(here,"server.mjs"),"utf8");

test("Home exposes first-class Yard and Raven executive surfaces",()=>{
  for(const required of [
    "Operating portfolio",
    "Deployment portfolio.",
    "Intelligence estate.",
    "yard-deployments",
    "raven-providers",
    "/api/raven/overview",
  ]){
    assert.ok(html.includes(required)||server.includes(required),"missing Yard/Raven surface contract: "+required);
  }
});

test("Yard portfolio does not promote missing persisted state into empty production",()=>{
  assert.ok(html.includes("This is an evidence hold, not an empty-production claim."));
  assert.ok(html.includes("Lease tokens, private endpoints, credentials, and hidden authority material are excluded"));
});

test("Raven surface refuses to invent a private runtime",()=>{
  for(const required of [
    "no standalone private human runtime is evidenced",
    "legacy-provider route",
    "Registry evidence is not a claim of a live private Raven human runtime.",
  ]){
    assert.ok(html.includes(required),"missing Raven evidence boundary: "+required);
  }
});

test("Raven overview stays a read surface and does not add execution endpoints",()=>{
  assert.ok(server.includes('url.pathname === "/api/raven/overview"'));
  assert.equal(server.includes('"/api/raven/execute"'),false);
  assert.equal(server.includes('"/api/raven/dispatch"'),false);
});


test("Home inline application JavaScript remains syntactically valid",()=>{
  const match=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match,"inline script missing");
  assert.doesNotThrow(()=>new Function(match[1]));
});
