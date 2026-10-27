import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {missingLddNames,maskedErrorLines,classifyChromiumFailure} from '../scripts/nextgen-browser-diagnose.mjs';

test('only missing library names are emitted, never dynamic-loader filesystem paths',()=>{
  const libs=missingLddNames([
    'libnss3.so => not found',
    'libatk-1.0.so.0 => not found',
    'libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007fc)',
    'libnss3.so => not found'
  ].join('\n'));
  assert.deepEqual(libs,['libnss3.so','libatk-1.0.so.0']);
});
test('launch fault classifier prefers deterministic missing-library and GLIBC causes',()=>{
  assert.equal(classifyChromiumFailure({missing:['libnss3.so'],log:'browser closed'}),'missing_system_shared_libraries');
  assert.equal(classifyChromiumFailure({log:'undefined symbol: _X'}),'binary_or_glibc_incompatibility');
  assert.equal(classifyChromiumFailure({log:'No usable sandbox!'}),'sandbox_or_user_namespace_denied');
  assert.equal(classifyChromiumFailure({log:'SIGTRAP'}),'browser_process_crashed');
  assert.equal(classifyChromiumFailure({log:'Target page, context or browser has been closed'}),'browser_closed_reason_unresolved');
  assert.equal(classifyChromiumFailure({timedOut:true}),'browser_launch_timeout');
});
test('local browser diagnostic strips home directory and token-like / URL evidence',()=>{
  const s=maskedErrorLines('error --user-data-dir=/tmp/private-user-dir https://example.com/account?key=123 Bearer ABCDEF01234567890');
  assert.equal(s.length,1);
  assert.ok(!s[0].includes('https://example.com'));
  assert.ok(!s[0].includes('ABCDEF01234567890'));
  assert.ok(!s[0].includes('/tmp/private-user-dir'));
});
test('non-HP CI diagnostic rejected, does not run Chromium on GitHub',()=>{
  const file=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/nextgen-browser-diagnose.mjs');
  const r=spawnSync(process.execPath,[file],{encoding:'utf8',timeout:5000});
  assert.equal(r.status,1);
  assert.match(r.stderr,/physical_nextgen_linux_required/);
});
test('diagnostic source cannot install packages, change services or visit public portals',()=>{
  const file=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/nextgen-browser-diagnose.mjs');
  const text=fs.readFileSync(file,'utf8');
  assert.match(text,/PLAYWRIGHT_BROWSERS_PATH/);
  assert.match(text,/chromium.launch\(\{headless:true,timeout:20000\}\)/);
  assert.doesNotMatch(text,/execSync\(/);
  assert.doesNotMatch(text,/spawnSync\(['\"](?:sudo|apt-get|apt|npm)['\"]/);
  assert.doesNotMatch(text,/page.goto|fs\.writeFileSync|\.listen\(/);
});
