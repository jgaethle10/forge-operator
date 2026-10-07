import { buildBootEnvelope } from "../evercraft-os/runtime.mjs";
import { buildDeviceProfile } from "../evercraft-os/device-profile.mjs";
import { buildEvercraftOsAppCatalog, compileEvercraftOsApp } from "../evercraft-os/app-package.mjs";

export function readEvercraftOsStatus({
  deviceClassHint = process.env.EVERCRAFT_OS_DEVICE_CLASS || "unknown",
  nodeId = process.env.EVERCRAFT_NODE_ID || null
} = {}) {
  const boot = buildBootEnvelope({ deviceClass: deviceClassHint });
  const device = buildDeviceProfile({ deviceClassHint, nodeId });

  return {
    schema: "evercraft.home.os-status.v1",
    product: "Evercraft OS",
    boot,
    device,
    authority: {
      mission: "systemia",
      authorization: "passport",
      device_identity: "nodeseed",
      execution_granted_by_status_surface: false
    },
    truth_boundary: {
      source_presence_is_runtime_health: false,
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
    schema: "evercraft.home.os-app-catalog.v1",
    ...catalog,
    installation_performed: false,
    authority_granted: false
  };
}
