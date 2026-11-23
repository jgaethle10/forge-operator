import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=fs.readFileSync('scripts/install-notification-relay-loopback.sh','utf8');
const runtime=fs.readFileSync('systemia/notification-fabric/resident-loopback.mjs','utf8');

test('Relay installation requires explicit operator apply and preserves existing configuration',()=>{
 assert.match(source,/MODE=check/);
 assert.match(source,/--apply/);
 assert.match(source,/existing Relay configuration or unit requires review; refusing overwrite/);
 assert.match(source,/if \[\[ -e "\$ENV_FILE" \|\| -e "\$UNIT_FILE" \]\]/);
 assert.match(source,/HOLD: --apply requires root/);
 assert.match(source,/READ_ONLY=YES/);
});
test('Relay stores credentials in root-only file and does not touch running Fabric or notifications',()=>{
 assert.match(source,/fs\.openSync\(file,'wx',0o600\)/);
 assert.match(source,/crypto\.randomBytes\(32\)/);
 assert.match(source,/chmodSync\(file,0o600\)/);
 assert.match(source,/EnvironmentFile=\$ENV_FILE/);
 assert.doesNotMatch(source,/systemctl restart evercraft-fabric/);
 assert.doesNotMatch(source,/systemctl start evercraft-fabric/);
 assert.doesNotMatch(source,/curl -X POST/);
 assert.match(source,/STUDIO_DISPATCH=NOT_WIRED/);
});
test('private Relay is never publicly bound and reuses original API',()=>{
 assert.match(runtime,/const HOST='127\.0\.0\.1'/);
 assert.match(runtime,/registerNotificationFabricRoutes\(app,/);
 assert.match(runtime,/RELAY_INGEST_CREDENTIAL_MISSING_OR_WEAK/);
 assert.match(runtime,/RELAY_PRIVATE_STORE_SAFETY_HOLD/);
 assert.doesNotMatch(runtime,/listen\(.*'0\.0\.0\.0'/);
});


test('bootstrap uses a private, pinned Express install outside canonical Forge',()=>{
 assert.match(source,/DEPS="\/var\/lib\/evercraft\/notification-relay-deps"/);
 assert.match(source,/runuser -u "\$OWNER" -- "\$NPM" install/);
 assert.match(source,/--prefix "\$DEPS" --no-save --package-lock=true --ignore-scripts/);
 assert.match(source,/express@4\.21\.2/);
 assert.match(source,/EVERCRAFT_NOTIFICATION_EXPRESS_ROOT/);
 assert.match(source,/PRIVATE_EXPRESS_DEPENDENCY_PRESENT=/);
 assert.doesNotMatch(source,/npm install --prefix "\$REPO"/);
});


test('systemd Type=simple startup uses bounded health polling, no forced restarts or secret logs',()=>{
 assert.match(source,/for \(\(attempt=1; attempt<=24; attempt\+\+\)\); do/);
 assert.match(source,/systemctl is-active --quiet evercraft-notification-fabric\.service/);
 assert.match(source,/curl -fsS --max-time 2 -o \/dev\/null/);
 assert.match(source,/sleep 0\.5/);
 assert.match(source,/RELAY_READY=true/);
 assert.match(source,/health did not become ready after bounded retries/);
 assert.doesNotMatch(source,/systemctl restart evercraft-notification-fabric\.service/);
});
