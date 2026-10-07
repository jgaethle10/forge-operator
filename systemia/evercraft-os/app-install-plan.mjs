import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileEvercraftOsApp } from "./app-package.mjs";
import { buildDeviceProfile } from "./device-profile.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function requiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

export function planEvercraftOsAppInstall({
  productKey,
  subjectRef,
  targetDeviceClass = "unknown",
  nodeId = null
} = {}) {
  const product = requiredText(productKey, "product_key");
  const subject = requiredText(subjectRef, "subject_ref");
  const app = compileEvercraftOsApp(product);
  const device = buildDeviceProfile({
    deviceClassHint: targetDeviceClass,
    nodeId
  });

  if (app.package_state !== "contract_ready") {
    return {
      schema: "evercraft.os.app-install-plan.v1",
      state: "held",
      product_key: product,
      subject_ref: subject,
      target_device: device,
      hold_reasons: app.hold_reasons,
      install_performed: false,
      grants_issued: false,
      execution_authority_granted: false,
      payment_authority_granted: false,
      device_capabilities_granted: false
    };
  }

  return {
    schema: "evercraft.os.app-install-plan.v1",
    state: "plan_ready",
    product_key: product,
    subject_ref: subject,
    target_device: device,
    package: {
      product_key: app.product_key,
      display_name: app.display_name,
      product_class: app.product_class,
      specialist_slug: app.specialist_slug
    },
    required_os_services: [
      "evercraft_identity",
      "passport",
      "context_fabric",
      "systemia_execution_gate",
      "yard_evercraft_compute_saban",
      "evercraft_network",
      "evercraft_meter",
      "evercraft_payments",
      "notification_fabric",
      "context_receipt_reconciliation"
    ],
    requested_authorization: {
      passport_product: app.os_services.authorization.passport_product,
      scopes: app.os_services.authorization.requested_scopes,
      grant_issued: false
    },
    context_binding: {
      namespace: app.os_services.context.namespace,
      read_scope: app.os_services.context.read_scope,
      write_scope: app.os_services.context.write_scope,
      access_granted: false
    },
    execution_binding: {
      gate_required: app.os_services.execution.gate_required,
      actions: app.os_services.execution.actions,
      authority_granted: false
    },
    meter_binding: {
      state: app.os_services.meter.state,
      product: app.os_services.meter.product,
      metrics: app.os_services.meter.metrics,
      entitlement_granted: false
    },
    commerce_binding: {
      service: "evercraft_payments",
      canonical_commerce_layer_available: true,
      payment_authority_granted: false,
      settlement_provider_selected: false
    },
    device_capability_binding: {
      requested: app.device_capabilities.requested,
      granted: [],
      implicit_grants_allowed: false
    },
    capacity_binding: {
      node_identity_established: device.node_identity.established,
      candidate_compute_role: device.candidate_roles.compute_capacity,
      compute_lease_granted: false,
      ungranted_compute_allowed: false
    },
    install_performed: false,
    grants_issued: false,
    runtime_started: false,
    execution_authority_granted: false,
    payment_authority_granted: false,
    truth_boundary: {
      plan_is_installation: false,
      plan_is_authorization: false,
      plan_is_entitlement: false,
      plan_is_runtime_health: false
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const productKey = process.argv[2];
  const subjectRef = process.argv[3] || "cli:operator";
  process.stdout.write(JSON.stringify(planEvercraftOsAppInstall({ productKey, subjectRef }), null, 2) + "\n");
}
