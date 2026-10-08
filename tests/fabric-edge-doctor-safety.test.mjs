import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/fabric-edge-doctor.sh',import.meta.url));
const source=readFileSync(script,'utf8');

test('doctor shell syntax remains valid',()=>{
 const check=spawnSync('bash',['-n',script],{encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
});

test('router map refresh is never invoked by the default diagnostic path',()=>{
 const guardedBlock=source.match(/if \[\[ "\$REPAIR" == "true" && -x \/usr\/local\/sbin\/evercraft-refresh-router-map \]\]; then\n([\s\S]*?)\nfi/);
 assert.ok(guardedBlock,'explicit --repair guard around router-map mutation is required');
 assert.match(guardedBlock[1],/runuser -u "\$RUN_USER" -- \/usr\/local\/sbin\/evercraft-refresh-router-map/);
 assert.equal((source.match(/runuser -u "\$RUN_USER" -- \/usr\/local\/sbin\/evercraft-refresh-router-map/g)||[]).length,1);
 assert.match(source,/"router_refresh_requested":\$\(json_bool "\$REPAIR"\)/);
});

test('doctor defaults do not imply owner consent to route changes',()=>{
 assert.match(source,/REPAIR=false/);
 assert.match(source,/TRIGGER_CANARY=false/);
 assert.match(source,/--repair\) REPAIR=true/);
 assert.match(source,/--trigger-canary\) TRIGGER_CANARY=true/);
});
