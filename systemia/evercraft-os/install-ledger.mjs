import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { compileEvercraftOsApp } from "./app-package.mjs";

function requiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

function sha256(value) {
  return "sha256:" + createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(canonical(value)))
    .digest("hex");
}

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.appendFileSync(file, JSON.stringify(value) + "\n", { mode: 0o600 });
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse);
}

function stableReceipt(body) {
  return { ...body, receipt_hash: sha256(body) };
}

export function appResourceRef(productKey, nodeId) {
  return "os-app:" + requiredText(productKey, "product_key") +
    ":node:" + requiredText(nodeId, "node_id");
}

export function packageFingerprint(productKey) {
  const app = compileEvercraftOsApp(productKey);
  if (app.package_state !== "contract_ready") {
    throw new Error("app_not_contract_ready:" + productKey);
  }
  return {
    app,
    package_fingerprint: sha256(app)
  };
}

export function buildAppInstallRequest({
  productKey,
  subjectRef,
  nodeId
} = {}) {
  const product = requiredText(productKey, "product_key");
  const subject = requiredText(subjectRef, "subject_ref");
  const node = requiredText(nodeId, "node_id");
  const { app, package_fingerprint } = packageFingerprint(product);

  const request = {
    schema: "evercraft.os.app-install-request.v1",
    operation: "install",
    product_key: product,
    subject_ref: subject,
    node_id: node,
    resource_ref: appResourceRef(product, node),
    package_fingerprint,
    contract_version: app.contract_version || null
  };

  return {
    ...request,
    request_fingerprint: sha256(request)
  };
}

export function buildAppUninstallRequest({
  productKey,
  subjectRef,
  nodeId,
  installedPackageFingerprint
} = {}) {
  const product = requiredText(productKey, "product_key");
  const subject = requiredText(subjectRef, "subject_ref");
  const node = requiredText(nodeId, "node_id");
  const installed = requiredText(installedPackageFingerprint, "installed_package_fingerprint");

  const request = {
    schema: "evercraft.os.app-uninstall-request.v1",
    operation: "uninstall",
    product_key: product,
    subject_ref: subject,
    node_id: node,
    resource_ref: appResourceRef(product, node),
    installed_package_fingerprint: installed
  };

  return {
    ...request,
    request_fingerprint: sha256(request)
  };
}

export class EvercraftOsInstallLedger {
  constructor({ stateDir, passport } = {}) {
    if (!stateDir) throw new Error("install_ledger_state_dir_required");
    if (!passport) throw new Error("install_ledger_passport_required");
    this.stateDir = path.resolve(stateDir);
    this.eventsFile = path.join(this.stateDir, "app-install-events.jsonl");
    this.passport = passport;
  }

  events() {
    return readJsonl(this.eventsFile);
  }

  currentState(productKey, nodeId) {
    const product = requiredText(productKey, "product_key");
    const node = requiredText(nodeId, "node_id");
    const events = this.events().filter(
      (event) => event.product_key === product && event.node_id === node
    );
    const last = events.at(-1) || null;

    return {
      schema: "evercraft.os.app-install-state.v1",
      product_key: product,
      node_id: node,
      installed: last?.operation === "install",
      package_fingerprint:
        last?.operation === "install" ? last.package_fingerprint : null,
      last_event_id: last?.event_id || null,
      last_receipt_hash: last?.receipt_hash || null,
      history_length: events.length,
      runtime_started: false,
      package_materialized: false
    };
  }

  #assertPermit({ permitId, actorRef, productKey, nodeId, scope, requestFingerprint }) {
    const state = this.passport.getActionPermitState(permitId);
    const expectedResource = appResourceRef(productKey, nodeId);

    if (!state.active) throw new Error("os_install_permit_not_active");
    if (state.actor_ref !== actorRef) throw new Error("os_install_permit_actor_mismatch");
    if (state.product !== "evercraft-os") throw new Error("os_install_permit_product_mismatch");
    if (state.scope !== scope) throw new Error("os_install_permit_scope_mismatch");
    if (state.resource_ref !== expectedResource) throw new Error("os_install_permit_resource_mismatch");
    if (state.request_fingerprint !== requestFingerprint) {
      throw new Error("os_install_permit_request_mismatch");
    }
  }

  install({ request, permitId, actorRef } = {}) {
    const actor = requiredText(actorRef, "actor_ref");
    const permit = requiredText(permitId, "permit_id");
    if (request?.schema !== "evercraft.os.app-install-request.v1") {
      throw new Error("install_request_schema_invalid");
    }

    const current = this.currentState(request.product_key, request.node_id);
    if (
      current.installed &&
      current.package_fingerprint === request.package_fingerprint
    ) {
      const event = this.events().find((row) => row.event_id === current.last_event_id);
      if (event?.permit_id === permit && event?.actor_ref === actor) {
        return {
          state: "duplicate",
          installed: true,
          event,
          permit_consumed: true,
          mutation_performed: false
        };
      }
    }

    const rebuilt = buildAppInstallRequest({
      productKey: request.product_key,
      subjectRef: request.subject_ref,
      nodeId: request.node_id
    });
    if (rebuilt.request_fingerprint !== request.request_fingerprint) {
      throw new Error("install_request_integrity_mismatch");
    }
    if (rebuilt.package_fingerprint !== request.package_fingerprint) {
      throw new Error("install_package_integrity_mismatch");
    }
    if (actor !== request.subject_ref) throw new Error("install_actor_subject_mismatch");

    this.#assertPermit({
      permitId: permit,
      actorRef: actor,
      productKey: request.product_key,
      nodeId: request.node_id,
      scope: "app.install",
      requestFingerprint: request.request_fingerprint
    });

    const consumption = this.passport.consumeActionPermit({
      idempotency_key: "os-install:" + request.request_fingerprint,
      permit_id: permit,
      actor_ref: actor,
      request_fingerprint: request.request_fingerprint,
      evidence_ref: request.package_fingerprint
    });

    const event = stableReceipt({
      schema: "evercraft.os.app-install-event.v1",
      event_id: "os_install_" + randomUUID(),
      operation: "install",
      product_key: request.product_key,
      subject_ref: request.subject_ref,
      node_id: request.node_id,
      resource_ref: request.resource_ref,
      package_fingerprint: request.package_fingerprint,
      contract_version: request.contract_version,
      request_fingerprint: request.request_fingerprint,
      permit_id: permit,
      permit_consumption_receipt: consumption.receipt.receipt_hash,
      actor_ref: actor,
      installed_at: new Date().toISOString(),
      runtime_started: false,
      package_materialized: false
    });
    appendJsonl(this.eventsFile, event);

    return {
      state: "installed_recorded",
      installed: true,
      event,
      permit_consumed: true,
      runtime_started: false,
      package_materialized: false
    };
  }

  uninstall({ request, permitId, actorRef } = {}) {
    const actor = requiredText(actorRef, "actor_ref");
    const permit = requiredText(permitId, "permit_id");
    if (request?.schema !== "evercraft.os.app-uninstall-request.v1") {
      throw new Error("uninstall_request_schema_invalid");
    }

    const current = this.currentState(request.product_key, request.node_id);
    if (!current.installed) throw new Error("app_not_installed");
    if (current.package_fingerprint !== request.installed_package_fingerprint) {
      throw new Error("uninstall_package_fingerprint_mismatch");
    }
    if (actor !== request.subject_ref) throw new Error("uninstall_actor_subject_mismatch");

    const rebuilt = buildAppUninstallRequest({
      productKey: request.product_key,
      subjectRef: request.subject_ref,
      nodeId: request.node_id,
      installedPackageFingerprint: request.installed_package_fingerprint
    });
    if (rebuilt.request_fingerprint !== request.request_fingerprint) {
      throw new Error("uninstall_request_integrity_mismatch");
    }

    this.#assertPermit({
      permitId: permit,
      actorRef: actor,
      productKey: request.product_key,
      nodeId: request.node_id,
      scope: "app.uninstall",
      requestFingerprint: request.request_fingerprint
    });

    const consumption = this.passport.consumeActionPermit({
      idempotency_key: "os-uninstall:" + request.request_fingerprint,
      permit_id: permit,
      actor_ref: actor,
      request_fingerprint: request.request_fingerprint,
      evidence_ref: current.last_receipt_hash
    });

    const event = stableReceipt({
      schema: "evercraft.os.app-install-event.v1",
      event_id: "os_uninstall_" + randomUUID(),
      operation: "uninstall",
      product_key: request.product_key,
      subject_ref: request.subject_ref,
      node_id: request.node_id,
      resource_ref: request.resource_ref,
      prior_package_fingerprint: current.package_fingerprint,
      prior_install_event_id: current.last_event_id,
      request_fingerprint: request.request_fingerprint,
      permit_id: permit,
      permit_consumption_receipt: consumption.receipt.receipt_hash,
      actor_ref: actor,
      uninstalled_at: new Date().toISOString(),
      runtime_stopped_claimed: false,
      package_removed_claimed: false
    });
    appendJsonl(this.eventsFile, event);

    return {
      state: "uninstalled_recorded",
      installed: false,
      event,
      permit_consumed: true,
      runtime_stopped_claimed: false,
      package_removed_claimed: false,
      rollback_pointer: {
        prior_install_event_id: current.last_event_id,
        prior_package_fingerprint: current.package_fingerprint
      }
    };
  }
}
