import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("server.ts", "utf8");

test("owned server has no Base44 URL fallback", () => {
  const legacyUrls = [...source.matchAll(/https?:\\/\\/[^\\s"'\\x60<>]*base44\\.app[^\\s"'\\x60<>]*/ig)];
  assert.equal(legacyUrls.length, 0);
  assert.match(source, /EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL/);
  assert.match(source, /EVERCRAFT_MACHINE_COMMERCE_MCP_URL/);
  assert.match(source, /EVERCRAFT_BUYER_FRONTAGE_ORIGIN/);
  assert.match(source, /EVERCRAFT_MACHINE_COMMERCE_ACQUISITION_EXPORT_URL/);
});

test("missing owned commerce route holds instead of falling back", () => {
  assert.match(source, /state: 'held_no_owned_public_origin'/);
  assert.match(source, /No verified Evercraft-owned buyer or review route is configured/);
  assert.match(source, /Evercraft-owned buyer route is not verified yet/);
  assert.match(source, /universal_mcp: CENTRAL_MACHINE_COMMERCE_MCP \\|\\| null/);
});

test("ForensiScope public handoff no longer advertises retired provider MCP", () => {
  assert.match(source, /canonicalUrl: 'https:\\/\\/raw\\.githubusercontent\\.com\\/jgaethle10\\/forge-operator\\/main\\/public\\/chum\\/products\\/forensiscope\\/index\\.html'/);
  assert.match(source, /mcp: null/);
  assert.match(source, /publicRouteState: 'owned_runtime_route_pending'/);
});

test("server rejects Base44 hosts even when supplied through configuration", () => {
  assert.match(source, /host === 'base44\\.app'/);
  assert.match(source, /host\\.endsWith\\('\.base44\\.app'\\)/);
});
