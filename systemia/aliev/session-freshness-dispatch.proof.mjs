import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const contents=fs.readFileSync('.github/workflows/aliev-shadow-session-freshness.yml','utf8');

test('hourly shadow dispatch remains opt-in and requires mainline deployment',()=>{
  assert.match(contents,/cron:\s*['"]32 \* \* \* \*['"]/);
  assert.match(contents,/workflow_dispatch:/);
  assert.match(contents,/if:\s*\$\{\{ vars\.EVERCRAFT_ALIEV_SHADOW_SCHEDULE_ENABLED == '1' \}\}/);
  assert.doesNotMatch(contents,/^\s*pull_request:/m);
  assert.doesNotMatch(contents,/^\s*workflow_run:/m);
});
test('dispatch uses pinned endpoint and GitHub secret without exposing it',()=>{
  assert.match(contents,/ALIEV_SESSION_REFRESH_URL:\s*\$\{\{ vars\.ALIEV_SESSION_REFRESH_URL \}\}/);
  assert.match(contents,/ALIEV_SESSION_REFRESH_TRUSTED_ORIGIN:\s*\$\{\{ vars\.ALIEV_SESSION_REFRESH_TRUSTED_ORIGIN \}\}/);
  assert.match(contents,/SYSTEMIA_MACHINE_KEY:\s*\$\{\{ secrets\.SYSTEMIA_MACHINE_KEY \}\}/);
  assert.match(contents,/session-freshness-resident\.mjs --once/);
  assert.doesNotMatch(contents,/curl -|set -x|echo.*MACHINE_KEY/);
});
test('dispatch keeps bounded operation and private auditable receipt',()=>{
  assert.match(contents,/permissions:\n  contents: read/);
  assert.match(contents,/concurrency:/);
  assert.match(contents,/cancel-in-progress: false/);
  assert.match(contents,/timeout-minutes: 4/);
  assert.match(contents,/actions\/upload-artifact@v4/);
  assert.match(contents,/retention-days: 14/);
  assert.match(contents,/if-no-files-found: warn/);
});
