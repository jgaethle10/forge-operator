import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const s=fs.readFileSync(new URL('../scripts/install-node002-persistent-outbound-worker.sh',import.meta.url),'utf8');
test('user-only installer pins immutable source and avoids root/foreign worker mutation',()=>{
  for(const t of ['((EUID==0))','--expected-ref','rev-parse HEAD','status --porcelain',
    'systemctl --user','--preflight','pgrep -u','enable --now',
    'NoNewPrivileges=true','Restart=always','UMask=0077',
    'previous four-minute Node002 agent still running',
    'Windows/WSL shutdown']) assert.ok(s.includes(t),t);
  assert.equal(s.includes('systemctl --system'),false);
  assert.equal(s.includes('sudo '),false);
});
