import fs from "node:fs";
import { createHash } from "node:crypto";
import { buildBootEnvelope } from "../evercraft-os/runtime.mjs";
import { buildDeviceProfile } from "../evercraft-os/device-profile.mjs";
import { buildEvercraftOsAppCatalog, compileEvercraftOsApp } from "../evercraft-os/app-package.mjs";
import { planEvercraftOsAppInstall } from "../evercraft-os/app-install-plan.mjs";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function sha256(value) {
  return "sha256:" + createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(canonical(value)))
    .digest("hex");
}

function readUserSessionBootReceipt(file) {
  const configured = String(file || "").trim();
  if (!configured) {
    return {
      configured: false,
      present: false,
      integrity: "not_configured",
      state: null
    };
  }
  if (!fs.existsSync(configured)) {
    return {
      configured: true,
      present: false,
      integrity: "not_present",
      state: null
    };
  }

  try {
    const stat = fs.statSync(configured);
    if (!stat.isFile() || stat.size > 512 * 1024) throw new Error("boot_receipt_file_invalid");
    const receipt = JSON.parse(fs.readFileSync(configured, "utf8"));
    if (receipt?.schema !== "evercraft.os.user-session-boot-receipt.v1") {
      throw new Error("boot_receipt_schema_invalid");
    }
    const { receipt_hash, ...body } = receipt;
    if (receipt_hash !== sha256(body)) throw new Error("boot_receipt_integrity_mismatch");
    return {
      configured: true,
      present: true,
      integrity: "verified",
      state: receipt.state,
      node_id: receipt.node_id,
      device_class: receipt.device_class,
      receipt_hash,
      booted_at: receipt.booted_at,
      capsule_hold_count: receipt.capsule_reconciliation?.hold_count ?? null,
      home_listen_scope: receipt.home?.listen_scope || null,
      execution_authority_granted_by_supervisor:
        receipt.authority?.execution_granted_by_supervisor === true
    };
  } catch (error) {
    return {
      configured: true,
      present: true,
      integrity: "hold",
      state: "held",
      reason: String(error?.message || error)
    };
  }
}


export function readEvercraftOsStatus({
  deviceClassHint = process.env.EVERCRAFT_OS_DEVICE_CLASS || "unknown",
  nodeId = process.env.EVERCRAFT_NODE_ID || null,
  bootReceiptFile = process.env.EVERCRAFT_OS_BOOT_RECEIPT_FILE || ""
} = {}) {
  const boot = buildBootEnvelope({ deviceClass: deviceClassHint });
  const device = buildDeviceProfile({ deviceClassHint, nodeId });
  const userSessionBoot = readUserSessionBootReceipt(bootReceiptFile);

  return {
    schema: "evercraft.home.os-status.v1",
    product: "Evercraft OS",
    boot,
    device,
    user_session_boot: userSessionBoot,
    authority: {
      mission: "systemia",
      authorization: "passport",
      device_identity: "nodeseed",
      execution_granted_by_status_surface: false
    },
    truth_boundary: {
      source_presence_is_runtime_health: false,
      user_session_boot_receipt_is_verified_when_present: userSessionBoot.integrity === "verified",
      device_profile_is_compute_lease: false,
      status_surface_is_execution_authority: false
    }
  };
}


export function readEvercraftOsApps({ productKey = null } = {}) {
  if (productKey) {
    return {
      schema: "evercraft.home.os-app.v1",
      app: compileEvercraftOsApp(productKey),
      installation_performed: false,
      authority_granted: false
    };
  }

  const catalog = buildEvercraftOsAppCatalog();
  return {
    ...catalog,
    schema: "evercraft.home.os-app-catalog.v1",
    catalog_schema: catalog.schema,
    installation_performed: false,
    authority_granted: false
  };
}


export function planEvercraftHomeOsAppInstall({
  productKey,
  subjectRef,
  targetDeviceClass = process.env.EVERCRAFT_OS_DEVICE_CLASS || "unknown",
  nodeId = process.env.EVERCRAFT_NODE_ID || null
} = {}) {
  return planEvercraftOsAppInstall({
    productKey,
    subjectRef,
    targetDeviceClass,
    nodeId
  });
}
