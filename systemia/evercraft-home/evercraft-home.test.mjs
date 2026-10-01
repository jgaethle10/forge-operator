import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const services = JSON.parse(fs.readFileSync(path.join(root, "services.json"), "utf8"));

test("Evercraft is root authority", () => {
  assert.equal(services.policy.root_authority, "evercraft");
  assert.equal(services.policy.external_provider_required, false);
  assert.equal(services.policy.legacy_provider_required, false);
  assert.equal(services.policy.direct_mode_default, true);
});

test("owned services never require optional providers", () => {
  const owned = services.services.filter((service) => service.ownership === "evercraft-owned");
  assert.deepEqual(owned.map((service) => service.id), ["systemia", "week-in-motion", "raven", "yard", "network", "sovereign-ai"]);
});

test("runtime has no legacy builder or external AI SDK dependency", () => {
  const server = fs.readFileSync(path.join(root, "server.mjs"), "utf8").toLowerCase();
  const home = fs.readFileSync(path.join(root, "public", "index.html"), "utf8").toLowerCase();
  const forbiddenRuntimeImports = [
    'from "@base44',
    "from '@base44",
    'require("@base44',
    "require('@base44",
    'from "base44',
    "from 'base44",
    'from "@openai',
    "from '@openai",
    'require("@openai',
    "require('@openai",
  ];
  for (const needle of forbiddenRuntimeImports) {
    assert.equal(server.includes(needle), false, "forbidden runtime dependency: " + needle);
  }
  assert.equal(home.includes("base44-sdk"), false);
});
