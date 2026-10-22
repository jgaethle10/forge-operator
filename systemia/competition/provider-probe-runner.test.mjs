import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("held provider probe never reports operational success", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-provider-held-"));
  const out = path.join(dir, "receipt.json");
  try {
    const run = spawnSync(process.execPath, [
      new URL("./provider-probe-runner.mjs", import.meta.url).pathname,
      "--out", out,
    ], {
      encoding: "utf8",
      timeout: 15000,
      // Deliberately exclude any ambient API credentials or vault bindings.
      env: { PATH: process.env.PATH || "", HOME: dir },
    });
    assert.equal(run.status, 0, run.stderr);
    const status = JSON.parse(run.stdout.trim());
    assert.equal(status.ok, false);
    assert.equal(status.state, "held");
    assert.equal(status.verified_count, 0);
    assert.equal(status.held_count, 2);
    assert.equal(status.failed_count, 0);
    const receipt = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.equal(receipt.summary.state, "held");
    assert.equal(receipt.secret_status.numerai_configured, false);
    assert.equal(receipt.providers.find(row => row.provider === "numerai").state, "held_missing_credentials");
    assert.equal(receipt.submission_authority_enabled, false);
    assert.equal(receipt.staking_authority_enabled, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
