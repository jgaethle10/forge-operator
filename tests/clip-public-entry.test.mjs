import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const page = readFileSync(new URL('../public/clip/index.html', import.meta.url),'utf8');
const app = readFileSync(new URL('../public/clip/app.mjs', import.meta.url),'utf8');
const status = JSON.parse(readFileSync(new URL('../public/clip/status.json', import.meta.url),'utf8'));
const alias = readFileSync(new URL('../public/evercraft-clip/index.html', import.meta.url),'utf8');

test('the previously missing Clip homepage and legacy alias have usable destinations', () => {
  assert.match(page, /<title>Evercraft Clip \| Publishing desk<\/title>/);
  assert.match(page, /id="compose"/);
  assert.match(page, /src="\.\/app\.mjs"/);
  assert.match(page, /href="\.\/status\.json"/);
  assert.match(alias, /content="0;url=\.\.\/clip\/"/);
  assert.ok(existsSync(new URL('../public/clip/app.mjs', import.meta.url)));
});
test('browser-only features actually have controls and the JS syntax is valid', () => {
  for (const id of ['channel','caption','media','copy','handoff','share','previews','message']) {
    assert.match(page, new RegExp('id="'+id+'"'));
  }
  for (const op of ['navigator.clipboard.writeText','navigator.share','URL.createObjectURL','JSON.stringify(record']) {
    assert.ok(app.includes(op), 'missing workbench action '+op);
  }
  execFileSync(process.execPath,['--check',new URL('../public/clip/app.mjs', import.meta.url).pathname]);
});
test('public page remains strictly fail closed and discloses absence of live publishing', () => {
  assert.equal(status.automatic_social_publication_verified,false);
  assert.equal(status.provider_account_permissions_verified,false);
  assert.equal(status.hosted_upload_enabled,false);
  assert.equal(status.platform_receipts_available_here,false);
  assert.match(status.truth_boundary, /does not publish posts/);
  assert.match(page,/Automatic publishing requires/);
  assert.ok(page.includes('a prepared post is <strong>not</strong> a published post'));
  assert.ok(app.includes("publication_authority:false"));
  assert.ok(app.includes("provider_status:'not_submitted'"));
  assert.ok(app.includes("authorization:{approved:false"));
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest\s*\(|sendBeacon\s*\(/.test(app));
});
test('retired independent publisher directories are not promoted in public Clip entry', () => {
  assert.doesNotMatch(page, /audience-sites|publisher-lab|partscout|site-rescue|adult/i);
  assert.doesNotMatch(alias,/audience-sites|publisher-lab|partscout/i);
  assert.doesNotMatch(page,/base44|metricool|tinyfish/i);
});
