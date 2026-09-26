import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  evaluateArchitecturalInvariants,
  loadRepairRecipeRegistry,
  resolveRepairRecipe
} from './architectural-invariants.mjs';

const live = evaluateArchitecturalInvariants({ rootDir: process.cwd() });
assert.equal(live.ok, true, JSON.stringify(live.violations, null, 2));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-invariants-'));
const write = (relative, content) => {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};

write('server.ts', "import { x } from './systemia/mcp/example.js';\n");
write('Dockerfile', [
  'FROM node:22-alpine AS build',
  'WORKDIR /app',
  'COPY . .',
  'FROM node:22-alpine AS runtime',
  'WORKDIR /app',
  'COPY --from=build /app/server.ts ./server.ts'
].join('\n') + '\n');

const dockerRegistry = {
  version: 'test',
  invariants: [{
    invariant_id: 'docker-test',
    severity: 'critical',
    type: 'docker_runtime_import_coverage',
    entrypoint: 'server.ts',
    dockerfile: 'Dockerfile',
    import_prefix: './systemia/',
    repair_recipe_id: 'docker-runtime-import-coverage'
  }]
};

let result = evaluateArchitecturalInvariants({ rootDir: root, registry: dockerRegistry });
assert.equal(result.ok, false);
assert.equal(result.violations[0]?.invariant_id, 'docker-test');
assert.ok(result.violations[0]?.metadata?.uncovered_imports?.includes('systemia/mcp/example.js'));

write('Dockerfile', [
  'FROM node:22-alpine AS build',
  'WORKDIR /app',
  'COPY . .',
  'FROM node:22-alpine AS runtime',
  'WORKDIR /app',
  'COPY --from=build /app/server.ts ./server.ts',
  'COPY --from=build /app/systemia/mcp ./systemia/mcp'
].join('\n') + '\n');
result = evaluateArchitecturalInvariants({ rootDir: root, registry: dockerRegistry });
assert.equal(result.ok, true);

write('catalog.json', JSON.stringify({
  offers: [{
    public_id: 'broken-sell-now',
    name: 'Broken',
    problem: 'test',
    commercial_state: 'sell_now',
    machine_state: 'payment_ready',
    pricing: '$1'
  }]
}));
const catalogRegistry = {
  version: 'test',
  invariants: [{
    invariant_id: 'catalog-test',
    severity: 'high',
    type: 'sell_now_catalog_contract',
    file: 'catalog.json',
    required_fields: ['public_id','name','problem','commercial_state','machine_state','pricing','public_url','payment_authority','confirmation'],
    require_nonempty_offers: true,
    repair_recipe_id: 'sell-now-continuation-contract'
  }]
};
result = evaluateArchitecturalInvariants({ rootDir: root, registry: catalogRegistry });
assert.equal(result.ok, false);
assert.ok(result.violations[0]?.metadata?.missing_fields?.includes('public_url'));
assert.ok(result.violations[0]?.metadata?.missing_fields?.includes('offers[]'));

const recipes = loadRepairRecipeRegistry(process.cwd());
assert.equal(recipes.ok, true);
const recipe = resolveRepairRecipe({
  code: 'architectural_invariant_violation',
  metadata: { invariant_id: 'forge-runtime-imports-covered-by-docker' }
}, recipes.registry);
assert.equal(recipe?.recipe_id, 'docker-runtime-import-coverage');

fs.rmSync(root, { recursive: true, force: true });
console.log('Sentinel architectural invariant engine: PASS');
