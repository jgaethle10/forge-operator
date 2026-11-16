import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDesignContract, DESIGN_PROFILES } from './design-contract.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function withSourceCopy(run) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-design-contract-'));
  try {
    const files = new Set(DESIGN_PROFILES.flatMap(profile => [profile.html, profile.styles].filter(Boolean)));
    for (const relative of files) {
      const target = path.join(temp, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(ROOT, relative), target);
    }
    run(temp);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

test('existing owned HQ and Work Saban visual sources pass static contract', () => {
  const result = checkDesignContract({ rootDir: ROOT });
  assert.equal(result.status, 'source_pass', JSON.stringify(result.failures));
  assert.equal(result.summary.profiles, 2);
  assert.equal(result.rendered_browser_verified, false);
  assert.equal(result.deployed_site_verified, false);
  assert.equal(result.release_authority, false);
});

test('a changed brand token is not silently accepted', () => {
  withSourceCopy(rootDir => {
    const file = path.join(rootDir, 'public/headquarters/tower.css');
    const original = fs.readFileSync(file, 'utf8');
    assert.ok(original.includes('--gold:#b79a56'), 'fixture must include the observed brand declaration');
    fs.writeFileSync(file, original.replace('--gold:#b79a56', '--gold:#ff00ff'));
    const result = checkDesignContract({ rootDir });
    assert.equal(result.status, 'source_fail');
    assert.ok(result.failures.some(x => x.id === 'evercraft-headquarters' && x.rule === 'brand_token_gold'));
  });
});

test('missing keyboard focus styling fails instead of claiming accessibility', () => {
  withSourceCopy(rootDir => {
    const file = path.join(rootDir, 'public/headquarters/tower.css');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll(':focus-visible', ':focus-missing'));
    const result = checkDesignContract({ rootDir });
    assert.equal(result.status, 'source_fail');
    assert.ok(result.failures.some(x => x.rule === 'keyboard_focus'));
  });
});

test('unavailable sources fail closed', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-design-missing-'));
  try {
    const result = checkDesignContract({ rootDir });
    assert.equal(result.status, 'source_fail');
    assert.ok(result.failures.some(x => x.rule === 'source_available'));
    assert.equal(result.rendered_browser_verified, false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
