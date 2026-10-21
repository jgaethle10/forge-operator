#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  evercraftOsReceiptHash,
  readEvercraftOsUserSessionBootReceipt
} from "./boot-receipt.mjs";

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function seal(body) {
  return { ...body, receipt_hash: evercraftOsReceiptHash(body) };
}

function isLoopbackUrl(value) {
  try {
    const url = new URL(value);
    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function observeEvercraftOsUserSupervisorHealth({
  root,
  fetchImpl = fetch,
  now = () => new Date().toISOString()
} = {}) {
  if (!root) throw new Error("evercraft_os_health_root_required");
  const stateRoot = path.resolve(root);
  const bootFile = path.join(stateRoot, "boot", "latest.json");
  const observedAt = now();

  let boot;
  try {
    boot = readEvercraftOsUserSessionBootReceipt(bootFile);
  } catch (error) {
    const body = {
      schema: "evercraft.os.user-session-health-receipt.v1",
      state: "held",
      reason: String(error?.message || error),
      observed_at: observedAt,
      boot_receipt_verified: false,
      home_probe_performed: false,
      home_reachable: null,
      restart_recommended: false,
      authority_granted: false
    };
    const receipt = seal(body);
    atomicJson(path.join(stateRoot, "health", "latest.json"), receipt);
    return receipt;
  }

  if (!isLoopbackUrl(boot.home?.url)) {
    const body = {
      schema: "evercraft.os.user-session-health-receipt.v1",
      state: "held",
      reason: "boot_receipt_home_url_not_loopback",
      observed_at: observedAt,
      boot_receipt_verified: true,
      boot_receipt_hash: boot.receipt_hash,
      home_probe_performed: false,
      home_reachable: null,
      restart_recommended: false,
      authority_granted: false
    };
    const receipt = seal(body);
    atomicJson(path.join(stateRoot, "health", "latest.json"), receipt);
    return receipt;
  }

  let response = null;
  let body = null;
  let error = null;
  try {
    response = await fetchImpl(new URL("/api/health", boot.home.url), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(3000)
    });
    body = await response.json().catch(() => null);
  } catch (caught) {
    error = String(caught?.message || caught);
  }

  const reachable =
    response?.ok === true &&
    body?.ok === true &&
    body?.listen_scope === "loopback";

  const result = {
    schema: "evercraft.os.user-session-health-receipt.v1",
    state: reachable ? "healthy" : "home_unreachable",
    reason: reachable ? null : error || "home_health_probe_failed",
    observed_at: observedAt,
    boot_receipt_verified: true,
    boot_receipt_hash: boot.receipt_hash,
    boot_state: boot.state,
    home_probe_performed: true,
    home_reachable: reachable,
    home_http_status: response?.status ?? null,
    home_instance_id: body?.instance_id || null,
    restart_recommended: !reachable,
    authority_granted: false
  };
  const receipt = seal(result);
  atomicJson(path.join(stateRoot, "health", "latest.json"), receipt);
  return receipt;
}

function cliArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const root = cliArg("--root", process.env.EVERCRAFT_OS_STATE_ROOT || "");
  const receipt = await observeEvercraftOsUserSupervisorHealth({ root });
  process.stdout.write(JSON.stringify(receipt) + "\n");
  if (receipt.restart_recommended) process.exitCode = 10;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 2;
  });
}
