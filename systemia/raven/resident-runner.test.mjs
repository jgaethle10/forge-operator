import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadControlToken, startRavenResident } from "./resident-runner.mjs";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "raven-resident-"));
}

test("resident runner requires private token-file permissions", () => {
  const root = tempRoot();
  try {
    const file = path.join(root, "token");
    fs.writeFileSync(file, "012345678901234567890123456789012345", { mode: 0o644 });
    assert.throws(() => loadControlToken(file), /permissions_too_open/);
    fs.chmodSync(file, 0o600);
    assert.equal(loadControlToken(file), "012345678901234567890123456789012345");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resident runner starts Raven loopback-only without exposing control token", async () => {
  const root = tempRoot();
  const token = "resident-proof-token-01234567890123456789";
  const tokenFile = path.join(root, "control-token");
  const stateDir = path.join(root, "state");
  const receiptFile = path.join(root, "deployment.json");
  fs.writeFileSync(tokenFile, token, { mode: 0o600 });
  fs.writeFileSync(receiptFile, JSON.stringify({ receipt_ref: "receipt:raven-resident-proof" }), { mode: 0o600 });

  let runtime;
  try {
    runtime = await startRavenResident({
      stateDir,
      controlTokenFile: tokenFile,
      trustedSubjectRef: "user:raven-resident-proof",
      deploymentReceiptFile: receiptFile,
      repoRoot: path.resolve("."),
    });
    const health = runtime.health();
    assert.equal(health.ok, true);
    assert.equal(health.loopback_only, true);
    assert.equal(health.base44_required, false);
    assert.equal(health.execution_authority_granted, false);
    assert.equal(health.deployment_receipt_bound, true);
    assert.equal(health.deployment_receipt_ref, "receipt:raven-resident-proof");
    assert.equal(JSON.stringify(health).includes(token), false);

    const response = await fetch(runtime.url + "/health").then((r) => r.json());
    assert.equal(response.loopback_only, true);
    assert.equal(JSON.stringify(response).includes(token), false);
  } finally {
    if (runtime) await runtime.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resident service wiring keeps Raven optional and private", () => {
  const resident = JSON.parse(fs.readFileSync("systemia/core/resident-services.json", "utf8"));
  const manifest = JSON.parse(fs.readFileSync("systemia/organism/raven-private-runtime.workflow.json", "utf8"));
  const service = resident.services.find((row) => row.service_key === "raven-private-runtime");
  assert.ok(service);
  assert.equal(service.mode, "resident");
  assert.equal(service.optional_when_unconfigured, true);
  assert.equal(service.env_args["--state-dir"], "RAVEN_PRIVATE_STATE_DIR");
  assert.equal(service.env_args["--control-token-file"], "RAVEN_PRIVATE_CONTROL_TOKEN_FILE");
  assert.equal(manifest.network.bind, "127.0.0.1");
  assert.equal(manifest.network.public_bind_allowed, false);
  assert.equal(manifest.network.public_fabric_required, false);
  assert.equal(manifest.network.base44_required, false);
  assert.equal(manifest.secret_boundary.raw_token_in_cli_args, false);
});
