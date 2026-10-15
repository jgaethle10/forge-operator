#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { EvercraftPassport } from "../passport/passport.mjs";
import { startEvercraftHomeServer } from "../evercraft-home/server.mjs";
import { buildBootEnvelope } from "./runtime.mjs";
import { buildDeviceProfile } from "./device-profile.mjs";
import { EvercraftOsInstallLedger } from "./install-ledger.mjs";
import { EvercraftOsCapabilityCapsules } from "./runtime-capsule.mjs";
import { sealEvercraftOsUserSessionBootReceipt } from "./boot-receipt.mjs";

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.appendFileSync(file, JSON.stringify(value) + "\n", { mode: 0o600 });
}

function safeNodeId(value) {
  const text = String(value || "").trim();
  if (!text) throw new Error("evercraft_os_node_id_required");
  if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(text)) throw new Error("evercraft_os_node_id_invalid");
  return text;
}

function defaultNodeId() {
  const digest = createHash("sha256").update(os.hostname()).digest("hex").slice(0, 16);
  return "evercraft-user-" + digest;
}

function loopbackHost(value) {
  const host = String(value || "").trim();
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("evercraft_os_supervisor_loopback_required");
  }
  return host;
}

function ledgerPairs(ledger, nodeId) {
  const seen = new Map();
  for (const event of ledger.events()) {
    if (String(event?.node_id || "") !== nodeId) continue;
    const product = String(event?.product_key || "").trim();
    if (!product) continue;
    seen.set(product, { product_key: product, node_id: nodeId });
  }
  return [...seen.values()].sort((a, b) => a.product_key.localeCompare(b.product_key));
}

function capsuleDirectoryEntries(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

export function reconcileEvercraftOsCapsules({ ledger, capsules, nodeId } = {}) {
  if (!ledger || !capsules) throw new Error("evercraft_os_reconciler_dependencies_required");
  const node = safeNodeId(nodeId);
  const pairs = ledgerPairs(ledger, node);
  const results = [];
  const holds = [];
  const expectedPaths = new Set();

  for (const pair of pairs) {
    const target = capsules.capsulePath(pair.product_key, node);
    expectedPaths.add(path.resolve(target));
    try {
      const state = ledger.currentState(pair.product_key, node);
      const result = capsules.reconcile(pair.product_key, node);
      results.push({
        product_key: pair.product_key,
        ledger_installed: state.installed,
        reconciliation_state: result.state,
        mutation_performed: result.mutation_performed === true,
        materialized: result.capsule?.materialized === true || result.materialized === true
      });
    } catch (error) {
      holds.push({
        product_key: pair.product_key,
        node_id: node,
        reason: String(error?.message || error)
      });
    }
  }

  const capsuleRoot = capsules.rootDir;
  for (const entry of capsuleDirectoryEntries(capsuleRoot)) {
    const resolved = path.resolve(capsuleRoot, entry);
    if (!expectedPaths.has(resolved)) {
      holds.push({
        product_key: null,
        node_id: node,
        reason: "capsule_without_install_ledger",
        capsule_entry: entry
      });
    }
  }

  return {
    schema: "evercraft.os.capsule-reconciliation.v1",
    node_id: node,
    ledger_product_count: pairs.length,
    reconciled_count: results.length,
    hold_count: holds.length,
    results,
    holds,
    execution_authority_granted: false,
    runtime_started_by_reconciliation: false
  };
}

export async function startEvercraftOsUserSupervisor({
  root,
  nodeId = process.env.EVERCRAFT_NODE_ID || defaultNodeId(),
  deviceClass = process.env.EVERCRAFT_OS_DEVICE_CLASS || "desktop",
  homeHost = process.env.EVERCRAFT_HOME_HOST || "127.0.0.1",
  homePort = Number(process.env.EVERCRAFT_HOME_PORT || 4310),
  homeAuthMode = process.env.EVERCRAFT_HOME_AUTH || "local",
  homeOperator = process.env.EVERCRAFT_HOME_OPERATOR || "Operator",
  homeOptions = {},
  sourceReleaseRef = process.env.EVERCRAFT_RELEASE_REF || ""
} = {}) {
  if (!root) throw new Error("evercraft_os_supervisor_root_required");
  const stateRoot = path.resolve(root);
  const node = safeNodeId(nodeId);
  const host = loopbackHost(homeHost);
  const bootEnvelope = buildBootEnvelope({ deviceClass, mode: "linux_user_session" });
  if (bootEnvelope.source_preflight !== "pass") {
    throw new Error("evercraft_os_source_preflight_hold:" + bootEnvelope.missing_required_components.join(","));
  }

  fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  const passportStateDir = path.join(stateRoot, "passport");
  const installStateDir = path.join(stateRoot, "install-ledger");
  const capsuleRoot = path.join(stateRoot, "capsules");
  const bootRoot = path.join(stateRoot, "boot");
  const passport = new EvercraftPassport({ stateDir: passportStateDir });
  const ledger = new EvercraftOsInstallLedger({ stateDir: installStateDir, passport });
  const capsules = new EvercraftOsCapabilityCapsules({ rootDir: capsuleRoot, installLedger: ledger });

  const reconciliation = reconcileEvercraftOsCapsules({
    ledger,
    capsules,
    nodeId: node
  });

  const device = buildDeviceProfile({
    deviceClassHint: deviceClass,
    nodeId: node
  });

  const bootReceiptFile = path.join(bootRoot, "latest.json");
  const serviceOrigins = {
    ...process.env,
    ...(homeOptions.serviceOrigins || {}),
    EVERCRAFT_OS_DEVICE_CLASS: deviceClass,
    EVERCRAFT_NODE_ID: node,
    EVERCRAFT_OS_BOOT_RECEIPT_FILE: bootReceiptFile
  };
  const home = await startEvercraftHomeServer({
    ...homeOptions,
    host,
    port: homePort,
    authMode: homeAuthMode,
    operator: homeOperator,
    passportStateDir,
    sourceReleaseRef,
    cookieSecure: homeOptions.cookieSecure ?? false,
    serviceOrigins
  });

  try {
    const homeHealth = await home.health();
    if (!homeHealth.ok || homeHealth.listen_scope !== "loopback") {
      throw new Error("evercraft_os_home_health_hold");
    }

    const ready = reconciliation.hold_count === 0;
    const body = {
      schema: "evercraft.os.user-session-boot-receipt.v1",
      boot_id: "os_boot_" + randomUUID(),
      state: ready ? "ready" : "held",
      booted_at: new Date().toISOString(),
      node_id: node,
      device_class: device.device_class,
      device_profile_evidence: device.device_class_evidence,
      source_release_ref: sourceReleaseRef || null,
      source_preflight: bootEnvelope.source_preflight,
      missing_required_components: bootEnvelope.missing_required_components,
      capsule_reconciliation: reconciliation,
      home: {
        service: homeHealth.service,
        instance_id: homeHealth.instance_id,
        auth_mode: homeHealth.auth_mode,
        listen_scope: homeHealth.listen_scope,
        url: home.url,
        health_observed: homeHealth.ok === true
      },
      authority: {
        mission: "systemia",
        authorization: "passport",
        device_identity: "nodeseed",
        execution_granted_by_supervisor: false,
        install_granted_by_supervisor: false,
        payment_authority_granted_by_supervisor: false
      },
      privilege_boundary: {
        root_required: false,
        kernel_replacement_required: false,
        public_ingress_created: false,
        arbitrary_process_launch_added: false
      },
      truth_boundary: {
        home_health_is_full_os_health: false,
        source_presence_is_runtime_health: false,
        capsule_materialized_is_capability_executed: false,
        boot_receipt_is_execution_authority: false
      }
    };
    const receipt = sealEvercraftOsUserSessionBootReceipt(body);
    atomicJson(bootReceiptFile, receipt);
    appendJsonl(path.join(bootRoot, "events.jsonl"), receipt);
    home.setDeploymentReceipt(receipt.receipt_hash);

    let closed = false;
    return {
      schema: "evercraft.os.user-session-runtime.v1",
      state: receipt.state,
      node_id: node,
      root: stateRoot,
      home_url: home.url,
      receipt,
      reconciliation,
      passport,
      ledger,
      capsules,
      home,
      close: async () => {
        if (closed) return;
        closed = true;
        await home.close();
      }
    };
  } catch (error) {
    await home.close().catch(() => {});
    throw error;
  }
}

function cliArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const root = cliArg("--root", process.env.EVERCRAFT_OS_STATE_ROOT || "");
  const runtime = await startEvercraftOsUserSupervisor({
    root,
    nodeId: cliArg("--node-id", process.env.EVERCRAFT_NODE_ID || undefined),
    deviceClass: cliArg("--device-class", process.env.EVERCRAFT_OS_DEVICE_CLASS || "desktop")
  });

  process.stdout.write(JSON.stringify({
    schema: runtime.schema,
    state: runtime.state,
    node_id: runtime.node_id,
    home_url: runtime.home_url,
    boot_receipt_hash: runtime.receipt.receipt_hash,
    capsule_hold_count: runtime.reconciliation.hold_count
  }) + "\n");

  const shutdown = async () => {
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
