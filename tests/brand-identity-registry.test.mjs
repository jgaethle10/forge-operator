import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docPath = path.join(root, 'docs/brand/identity-source-register.v1.json');
const registry = JSON.parse(fs.readFileSync(docPath, 'utf8'));
const brands = registry.brands ?? [];

test('brand registry cannot trigger publication by presence alone', () => {
  assert.equal(registry.publishing.auto_publish, false);
  assert.equal(registry.publishing.default_included, false);
  assert.equal(registry.publishing.require_explicit_public_approval, true);
  assert.ok(brands.length >= 6);
  for (const b of brands) assert.equal(b.publication_approved, false, b.key);
});

test('brand identities are unique, and no unrelated logo is reused', () => {
  const keys = brands.map(b => b.key);
  assert.equal(new Set(keys).size, keys.length);
  const sources = brands.filter(b => b.asset.source).map(b => b.asset.source);
  assert.equal(new Set(sources).size, sources.length);
});

test('verified marks have genuine owned SVG source files', () => {
  for (const b of brands) {
    if (b.asset.status !== 'verified_existing_mark') continue;
    assert.ok(b.asset.source?.startsWith('public/'), b.key);
    assert.ok(b.asset.source.endsWith('.svg'), b.key);
    const file = path.join(root, b.asset.source);
    assert.ok(fs.existsSync(file), b.key + ' source absent: ' + file);
    const svg = fs.readFileSync(file, 'utf8');
    assert.match(svg, /<svg\b/i, b.key);
  }
});

test('unverified logos may not claim approved custom artwork', () => {
  for (const b of brands) {
    if (b.asset.status === 'unique_logo_not_verified') {
      assert.equal(b.asset.source, null, b.key);
    }
  }
});
