import { buildBootEnvelope } from "../evercraft-os/runtime.mjs";
import { buildDeviceProfile } from "../evercraft-os/device-profile.mjs";
import { buildEvercraftOsAppCatalog, compileEvercraftOsApp } from "../evercraft-os/app-package.mjs";
import { planEvercraftOsAppInstall } from "../evercraft-os/app-install-plan.mjs";
import { readEvercraftOsUserSessionBootReceipt } from "../evercraft-os/boot-receipt.mjs";

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

  try {
    const receipt = readEvercraftOsUserSessionBootReceipt(configured);
    return {
      configured: true,
      present: true,
      integrity: "verified",
      state: receipt.state,
      node_id: receipt.node_id,
      device_class: receipt.device_class,
      receipt_hash: receipt.receipt_hash,
      booted_at: receipt.booted_at,
      capsule_hold_count: receipt.capsule_reconciliation?.hold_count ?? null,
      home_listen_scope: receipt.home?.listen_scope || null,
      execution_authority_granted_by_supervisor:
        receipt.authority?.execution_granted_by_supervisor === true
    };
  } catch (error) {
    const missing = String(error?.code || "") === "ENOENT";
    return {
      configured: true,
      present: !missing,
      integrity: missing ? "not_present" : "hold",
      state: missing ? null : "held",
      ...(missing ? {} : { reason: String(error?.message || error) })
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
