import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("server.ts", "utf8");

test("owned server has no Base44 URL fallback", () => {
  const legacyUrlLines = source
    .split("\n")
    .filter((line) => line.includes("://") && line.includes("base44.app"));
  assert.deepEqual(legacyUrlLines, []);
  assert.equal(source.includes("EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL"), true);
  assert.equal(source.includes("EVERCRAFT_MACHINE_COMMERCE_MCP_URL"), true);
  assert.equal(source.includes("EVERCRAFT_BUYER_FRONTAGE_ORIGIN"), true);
  assert.equal(source.includes("EVERCRAFT_MACHINE_COMMERCE_ACQUISITION_EXPORT_URL"), true);
});

test("missing owned commerce route holds instead of falling back", () => {
  assert.equal(source.includes("state: 'held_no_owned_public_origin'"), true);
  assert.equal(source.includes("No verified Evercraft-owned buyer or review route is configured."), true);
  assert.equal(source.includes("Evercraft-owned buyer route is not verified yet."), true);
  assert.equal(source.includes("universal_mcp: CENTRAL_MACHINE_COMMERCE_MCP || null"), true);
});

test("ForensiScope public handoff no longer advertises retired provider MCP", () => {
  assert.equal(
    source.includes("canonicalUrl: 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/products/forensiscope/index.html'"),
    true
  );
  assert.equal(source.includes("mcp: null"), true);
  assert.equal(source.includes("publicRouteState: 'owned_runtime_route_pending'"), true);
});

test("server rejects Base44 hosts even when supplied through configuration", () => {
  assert.equal(source.includes("host === 'base44.app'"), true);
  assert.equal(source.includes("host.endsWith('.base44.app')"), true);
});
