#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EvercraftPassport } from "../passport/passport.mjs";
import { startEvercraftHomeServer } from "../evercraft-home/server.mjs";
import { buildBootEnvelope } from "./runtime.mjs";
import { buildDeviceProfile } from "./device-profile.mjs";
import { buildEvercraftOsAppCatalog } from "./app-package.mjs";
import { EvercraftOsInstallLedger } from "./install-ledger.mjs";
import { EvercraftOsCapabilityCapsules } from "./runtime-capsule.mjs";

function requiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(temp, file);
}

function sha256(value) {
  return "sha256:" + createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

function safeNodeId() {
  return "evercraft-" + os.hostname().replace(/[^a-zA-Z0-9._-]/g, "-");
}

export class EvercraftOsHostSupervisor {
  constructor({
    stateDir,
    nodeId = safeNodeId(),
    deviceClass = "laptop",
    installLedger,
    capsules = null,
    homeStarter = startEvercraftHomeServer,
    homeHost = "127.0.0.1",
    homePort = 0,
    homeAuth = "local",
    reconcileEveryMs = 15_000
  } = {}) {
    if (!stateDir) throw new Error("evercraft_os_host_state_dir_required");
    if (!installLedger) throw new Error("evercraft_os_host_install_ledger_required");
    if (homeHost !== "127.0.0.1" && homeHost !== "::1" && homeHost !== "localhost") {
      throw new Error("evercraft_os_host_home_must_be_loopback");
    }
    if (homeAuth !== "local") {
      throw new Error("evercraft_os_host_phase1_supports_local_home_auth_only");
    }

    this.stateDir = path.resolve(stateDir);
    this.nodeId = requiredText(nodeId, "node_id");
    this.deviceClass = requiredText(deviceClass, "device_class");
    this.installLedger = installLedger;
    this.capsules = capsules || new EvercraftOsCapabilityCapsules({
      rootDir: path.join(this.stateDir, "capsules"),
      installLedger
    });
    this.homeStarter = homeStarter;
    this.homeHost = homeHost;
    this.homePort = Number(homePort || 0);
    this.homeAuth = homeAuth;
    this.reconcileEveryMs = Math.max(5_000, Number(reconcileEveryMs || 15_000));
    this.statusFile = path.join(this.stateDir, "host-status.json");
    this.reconcileFile = path.join(this.stateDir, "reconcile-latest.json");
    this.home = null;
    this.timer = null;
    this.startedAt = null;
    this.lastReconcile = null;
  }

  reconcile() {
    const catalog = buildEvercraftOsAppCatalog();
    const ready = catalog.apps.filter((app) => app.package_state === "contract_ready");
    const outcomes = [];

    for (const app of ready) {
      const installState = this.installLedger.currentState(app.product_key, this.nodeId);
      let capsuleResult;
      try {
        capsuleResult = this.capsules.reconcile(app.product_key, this.nodeId);
      } catch (error) {
        capsuleResult = {
          state: "reconcile_failed",
          mutation_performed: false,
          error: String(error?.message || error)
        };
      }

      outcomes.push({
        product_key: app.product_key,
        installed: installState.installed,
        install_event_id: installState.last_event_id,
        install_receipt_hash: installState.last_receipt_hash,
        capsule_state: capsuleResult.state,
        capsule_materialized:
          capsuleResult?.capsule?.materialized === true ||
          capsuleResult?.materialized === true,
        mutation_performed: capsuleResult.mutation_performed === true,
        error: capsuleResult.error || null
      });
    }

    const body = {
      schema: "evercraft.os.host-reconcile.v1",
      node_id: this.nodeId,
      contract_ready_apps: ready.length,
      installed_apps: outcomes.filter((row) => row.installed).length,
      materialized_capsules: outcomes.filter((row) => row.capsule_materialized).length,
      failures: outcomes.filter((row) => row.error).length,
      outcomes,
      reconciled_at: new Date().toISOString(),
      app_launch_performed: false,
      execution_authority_granted: false
    };
    const receipt = { ...body, receipt_hash: sha256(body) };
    atomicJson(this.reconcileFile, receipt);
    this.lastReconcile = receipt;
    return receipt;
  }

  status() {
    const boot = buildBootEnvelope({ deviceClass: this.deviceClass, mode: "persistent_user_host" });
    const device = buildDeviceProfile({
      deviceClassHint: this.deviceClass,
      nodeId: this.nodeId
    });

    const body = {
      schema: "evercraft.os.host-status.v1",
      state: this.startedAt ? "running" : "stopped",
      node_id: this.nodeId,
      device_class: this.deviceClass,
      started_at: this.startedAt,
      observed_at: new Date().toISOString(),
      boot: {
        source_preflight: boot.source_preflight,
        runtime_health_claimed: boot.runtime_health_claimed,
        execution_authority_granted: boot.execution_authority_granted
      },
      device: {
        node_identity_established: device.node_identity.established,
        candidate_roles: device.candidate_roles,
        device_capabilities: device.capability_claims
      },
      home: {
        running: Boolean(this.home),
        url: this.home?.url || null,
        auth_mode: this.homeAuth,
        loopback_only: true
      },
      reconcile: this.lastReconcile
        ? {
            receipt_hash: this.lastReconcile.receipt_hash,
            installed_apps: this.lastReconcile.installed_apps,
            materialized_capsules: this.lastReconcile.materialized_capsules,
            failures: this.lastReconcile.failures,
            reconciled_at: this.lastReconcile.reconciled_at
          }
        : null,
      boundaries: {
        root_privileges_required: false,
        kernel_replacement_required: false,
        app_launch_performed_by_supervisor: false,
        install_authority_granted_by_supervisor: false,
        device_permissions_granted_by_supervisor: false
      }
    };

    const receipt = { ...body, receipt_hash: sha256(body) };
    atomicJson(this.statusFile, receipt);
    return receipt;
  }

  async start() {
    if (this.home) return this.status();
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });

    this.startedAt = new Date().toISOString();
    try {
      this.reconcile();

      this.home = await this.homeStarter({
        host: this.homeHost,
        port: this.homePort,
        authMode: this.homeAuth,
        operator: "Evercraft OS"
      });

      this.timer = setInterval(() => {
        try {
          this.reconcile();
          this.status();
        } catch {}
      }, this.reconcileEveryMs);
      this.timer.unref?.();

      return this.status();
    } catch (error) {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      if (this.home) {
        try { await this.home.close(); } catch {}
        this.home = null;
      }
      this.startedAt = null;
      this.status();
      throw error;
    }
  }

  async close() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.home) {
      await this.home.close();
      this.home = null;
    }
    this.startedAt = null;
    return this.status();
  }
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

export async function startEvercraftOsUserHost({
  stateDir,
  passportStateDir,
  installStateDir = "",
  nodeId = safeNodeId(),
  deviceClass = "laptop",
  homePort = 4310
} = {}) {
  const state = path.resolve(requiredText(stateDir, "state_dir"));
  const passportRoot = path.resolve(requiredText(passportStateDir, "passport_state_dir"));
  const installRoot = installStateDir
    ? path.resolve(installStateDir)
    : path.join(state, "install-ledger");

  const passport = new EvercraftPassport({ stateDir: passportRoot });
  const installLedger = new EvercraftOsInstallLedger({
    stateDir: installRoot,
    passport
  });
  const capsules = new EvercraftOsCapabilityCapsules({
    rootDir: path.join(state, "capsules"),
    installLedger
  });

  const supervisor = new EvercraftOsHostSupervisor({
    stateDir: state,
    nodeId,
    deviceClass,
    installLedger,
    capsules,
    homePort,
    homeAuth: "local"
  });
  await supervisor.start();
  return supervisor;
}

async function main() {
  const stateDir = arg("--root", process.env.EVERCRAFT_OS_STATE_ROOT || "");
  const passportStateDir = arg(
    "--passport-state",
    process.env.EVERCRAFT_OS_PASSPORT_STATE_DIR || ""
  );
  const installStateDir = arg(
    "--install-state",
    process.env.EVERCRAFT_OS_INSTALL_STATE_DIR || ""
  );
  const nodeId = arg("--node-id", process.env.EVERCRAFT_NODE_ID || safeNodeId());
  const deviceClass = arg(
    "--device-class",
    process.env.EVERCRAFT_OS_DEVICE_CLASS || "laptop"
  );
  const homePort = Number(arg(
    "--home-port",
    process.env.EVERCRAFT_HOME_PORT || "4310"
  ));

  const supervisor = await startEvercraftOsUserHost({
    stateDir,
    passportStateDir,
    installStateDir,
    nodeId,
    deviceClass,
    homePort
  });

  const shutdown = async () => {
    await supervisor.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  process.stdout.write(JSON.stringify(supervisor.status(), null, 2) + "\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
