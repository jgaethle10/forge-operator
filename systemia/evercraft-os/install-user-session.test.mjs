import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = fs.readFileSync(path.join(here, "install-user-session.sh"), "utf8");

test("Linux user-session installer preserves atomic release and rollback contract", () => {
  assert.match(script, /RELEASES_ROOT="\$INSTALL_BASE\/releases"/);
  assert.match(script, /CURRENT_LINK="\$INSTALL_BASE\/current"/);
  assert.match(script, /PREVIOUS_LINK="\$INSTALL_BASE\/previous"/);
  assert.match(script, /RELEASE_DIR="\$RELEASES_ROOT\/\$RELEASE_ID"/);
  assert.match(script, /cp -a "\$SOURCE_ROOT\/\." "\$STAGE_DIR\/"/);
  assert.match(script, /mv "\$STAGE_DIR" "\$RELEASE_DIR"/);
  assert.match(script, /mv -Tf "\$CURRENT_LINK\.new" "\$CURRENT_LINK"/);
  assert.match(script, /mv -Tf "\$PREVIOUS_LINK\.new" "\$PREVIOUS_LINK"/);
  assert.doesNotMatch(script, /rm -rf "\$\{?INSTALL_ROOT/);
});

test("Linux user-session installer preserves loopback and user-service hardening", () => {
  assert.match(script, /EVERCRAFT_HOME_HOST" "127\.0\.0\.1"/);
  assert.match(script, /NoNewPrivileges=true/);
  assert.match(script, /PrivateTmp=true/);
  assert.match(script, /ProtectSystem=strict/);
  assert.match(script, /ProtectHome=read-only/);
  assert.match(script, /LockPersonality=true/);
  assert.match(script, /RestrictSUIDSGID=true/);
  assert.match(script, /ReadWritePaths=\$STATE_ROOT/);
  assert.doesNotMatch(script, /\bsudo\b/);
  assert.doesNotMatch(script, /0\.0\.0\.0/);
});

test("health recovery is timer-bound and scoped to the Evercraft OS user service", () => {
  assert.match(script, /OnUnitActiveSec=60s/);
  assert.match(script, /OnFailure=evercraft-os-recover\.service/);
  assert.match(script, /user-supervisor-health\.mjs --root \$STATE_ROOT/);
  assert.match(script, /--user restart evercraft-os\.service/);
  assert.doesNotMatch(script, /restart evercraft-local-organism\.service/);
});

test("installer records immutable release identity in the private environment", () => {
  assert.match(script, /set_env_value "EVERCRAFT_RELEASE_REF" "\$RELEASE_ID"/);
  assert.match(script, /\^\[a-fA-F0-9\]\{40\}\$/);
});
