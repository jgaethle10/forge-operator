import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function requiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

function unique(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

export function loadOsAppSources(root = repoRoot) {
  return {
    publicProducts: readJson(path.join(root, "registry", "public-products.json")),
    contracts: readJson(path.join(root, "systemia", "capability-mesh", "contracts.json"))
  };
}

export function contractCompleteness(contract) {
  if (!contract) return { complete: false, gaps: ["product_contract_missing"] };

  const gaps = [];
  const requiredLanes = [
    "authority",
    "context",
    "meter",
    "intake",
    "execution",
    "relationship",
    "receipt_reconciliation"
  ];

  for (const lane of requiredLanes) {
    const value = contract[lane];
    if (!value || !["declared", "not_required"].includes(value.state)) {
      gaps.push(lane + "_contract_missing_or_invalid");
      continue;
    }
    if (value.state === "not_required" && !String(value.reason || "").trim()) {
      gaps.push(lane + "_not_required_reason_missing");
    }
  }

  if (!String(contract.rollback?.policy || "").trim()) gaps.push("rollback_policy_missing");
  if (!Array.isArray(contract.compatibility?.intended_product_classes) ||
      contract.compatibility.intended_product_classes.length === 0) {
    gaps.push("compatibility_product_classes_missing");
  }

  return { complete: gaps.length === 0, gaps };
}

export function compileEvercraftOsApp(productKey, { root = repoRoot } = {}) {
  const key = requiredText(productKey, "product_key");
  const { publicProducts, contracts } = loadOsAppSources(root);

  if (publicProducts.schema !== "evercraft.saban.public-product-index.v1") {
    throw new Error("public_product_index_schema_invalid");
  }
  if (contracts.schema !== "evercraft.capability-mesh.contracts.v1") {
    throw new Error("capability_mesh_contract_schema_invalid");
  }

  const product = (publicProducts.products || []).find((row) => row.product_key === key);
  if (!product) throw new Error("public_product_not_found:" + key);

  const contract = (contracts.contracts || []).find((row) => row.product_key === key) || null;
  const completeness = contractCompleteness(contract);
  const sharedRuntimeReady =
    completeness.complete &&
    contract?.adoption_stage === "shared_runtime";

  const authorityScopes = contract?.authority?.state === "declared"
    ? unique(contract.authority.scopes)
    : [];
  const executionActions = contract?.execution?.state === "declared"
    ? (contract.execution.actions || []).map((action) => ({
        scope: String(action.scope || "").trim() || null,
        meter_metric: action.meter_metric || null,
        meter_quantity: action.meter_quantity ?? null,
        meter_unit: action.meter_unit || null
      }))
    : [];

  return {
    schema: "evercraft.os.app-package.v1",
    product_key: key,
    display_name: product.name,
    product_class: product.class,
    package_state: sharedRuntimeReady ? "contract_ready" : "not_contract_ready",
    installability: sharedRuntimeReady ? "eligible_for_os_install_flow" : "held",
    hold_reasons: sharedRuntimeReady
      ? []
      : [
          ...completeness.gaps,
          ...(contract && contract.adoption_stage !== "shared_runtime"
            ? ["adoption_stage_not_shared_runtime:" + contract.adoption_stage]
            : [])
        ],
    adoption_stage: contract?.adoption_stage || "missing",
    contract_version: contract?.contract_version || null,
    specialist_slug: contract?.specialist_slug || null,

    os_services: {
      identity: {
        service: "evercraft_identity",
        inherited: true,
        authentication_granted_by_package: false
      },
      authorization: {
        service: "passport",
        inherited: true,
        passport_product: contract?.authority?.passport_product || null,
        requested_scopes: authorityScopes,
        scopes_granted_by_package: false
      },
      context: {
        service: "context_fabric",
        inherited: true,
        namespace: contract?.context?.state === "declared" ? contract.context.namespace : null,
        read_scope: contract?.context?.state === "declared" ? contract.context.read_scope : null,
        write_scope: contract?.context?.state === "declared" ? contract.context.write_scope : null,
        context_access_granted_by_package: false
      },
      execution: {
        service: "systemia_execution_gate",
        inherited: true,
        gate_required: contract?.execution?.gate_required === true,
        actions: executionActions,
        execution_authority_granted_by_package: false
      },
      capacity: {
        service: "yard_evercraft_compute_saban",
        inherited: true,
        compute_lease_granted_by_package: false,
        ungranted_compute_allowed: false
      },
      network: {
        service: "evercraft_network",
        inherited: true,
        transport_authority_granted_by_package: false
      },
      meter: {
        service: "evercraft_meter",
        inherited: true,
        state: contract?.meter?.state || "missing",
        product: contract?.meter?.state === "declared" ? contract.meter.product : null,
        metrics: contract?.meter?.state === "declared" ? contract.meter.metrics || [] : [],
        usage_entitlement_granted_by_package: false
      },
      payments: {
        service: "evercraft_payments",
        inherited: true,
        canonical_commerce_layer_available: true,
        product_payment_contract_declared: Boolean(contract?.commerce),
        payment_authority_granted_by_package: false,
        settlement_provider_selected_by_package: false
      },
      receipts: {
        service: "context_receipt_reconciliation",
        inherited: true,
        namespace:
          contract?.receipt_reconciliation?.state === "declared"
            ? contract.receipt_reconciliation.namespace
            : null,
        runtime_verified_by_package: false
      },
      notifications: {
        service: "notification_fabric",
        inherited: true,
        delivery_permission_granted_by_package: false
      }
    },

    device_capabilities: {
      requested: [],
      reason:
        "No device capability is inferred from product class. Camera, microphone, location, telephony, secure-element, filesystem, Bluetooth, and other device access require explicit future package declarations plus Passport/runtime authorization."
    },

    authority: {
      identity_granted: false,
      passport_scopes_granted: false,
      execution_granted: false,
      compute_lease_granted: false,
      payment_authority_granted: false,
      device_capability_granted: false
    },

    truth_boundary: {
      package_contract_is_installation: false,
      package_contract_is_runtime_verification: false,
      requested_scope_is_granted_scope: false,
      inherited_service_is_unrestricted_access: false,
      public_product_is_installable_without_contract: false
    }
  };
}

export function buildEvercraftOsAppCatalog({ root = repoRoot } = {}) {
  const { publicProducts } = loadOsAppSources(root);
  const apps = (publicProducts.products || []).map((product) =>
    compileEvercraftOsApp(product.product_key, { root })
  );

  return {
    schema: "evercraft.os.app-catalog.v1",
    product_count: apps.length,
    contract_ready_count: apps.filter((app) => app.package_state === "contract_ready").length,
    held_count: apps.filter((app) => app.package_state === "not_contract_ready").length,
    apps,
    authority_granted_by_catalog: false,
    install_performed_by_catalog: false
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const requested = process.argv[2];
  const output = requested
    ? compileEvercraftOsApp(requested)
    : buildEvercraftOsAppCatalog();
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}
