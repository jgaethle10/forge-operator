import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY_FILE = path.join(MODULE_DIR, 'host-boundary-capabilities.json');

function cleanCapabilityId(value) {
  const id = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/i.test(id)) {
    throw new Error('host_boundary_capability_id_invalid');
  }
  return id;
}

function normalizeCapability(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('host_boundary_capability_invalid');
  }
  const capabilityId = cleanCapabilityId(raw.capability_id);
  const operation = String(raw.operation || '').trim().toLowerCase();
  if (!['read', 'write', 'action'].includes(operation)) {
    throw new Error('host_boundary_capability_operation_invalid');
  }

  const scope = raw.scope && typeof raw.scope === 'object' && !Array.isArray(raw.scope)
    ? structuredClone(raw.scope)
    : {};
  const freshness = Number(raw.freshness_seconds);

  return {
    capability_id: capabilityId,
    host_os: String(raw.host_os || '').trim().toLowerCase(),
    surface: String(raw.surface || '').trim(),
    operation,
    scope,
    evidence_schema: raw.evidence_schema ? String(raw.evidence_schema) : null,
    request_schema: raw.request_schema ? String(raw.request_schema) : null,
    requires_explicit_pairing: raw.requires_explicit_pairing === true,
    requires_authorized_node: raw.requires_authorized_node === true,
    arbitrary_desktop_control: raw.arbitrary_desktop_control === true,
    mutation_authority: raw.mutation_authority === true,
    screenshots_collected: raw.screenshots_collected === true,
    raw_accessibility_tree_persisted: raw.raw_accessibility_tree_persisted === true,
    freshness_seconds: Number.isFinite(freshness)
      ? Math.max(1, Math.min(86_400, Math.floor(freshness)))
      : null,
    notes: raw.notes ? String(raw.notes).slice(0, 1000) : null,
  };
}

export function loadHostBoundaryCapabilityRegistry({
  file = DEFAULT_REGISTRY_FILE,
} = {}) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error('host_boundary_capability_registry_unreadable');
  }

  if (parsed?.schema !== 'evercraft.host-boundary-capability-registry.v1') {
    throw new Error('host_boundary_capability_registry_schema_invalid');
  }
  if (!Array.isArray(parsed.capabilities)) {
    throw new Error('host_boundary_capability_registry_capabilities_invalid');
  }

  const capabilities = parsed.capabilities.map(normalizeCapability);
  const ids = new Set();
  for (const capability of capabilities) {
    if (ids.has(capability.capability_id)) {
      throw new Error('host_boundary_capability_registry_duplicate_id');
    }
    ids.add(capability.capability_id);

    if (capability.arbitrary_desktop_control) {
      throw new Error('host_boundary_capability_registry_arbitrary_desktop_control_denied');
    }
    if (
      capability.operation === 'read' &&
      capability.mutation_authority
    ) {
      throw new Error('host_boundary_capability_registry_read_mutation_contradiction');
    }
  }

  return {
    schema: parsed.schema,
    version: String(parsed.version || '0.0.0'),
    capabilities,
  };
}

export function hostBoundaryCapabilityStatus({
  registryFile = DEFAULT_REGISTRY_FILE,
} = {}) {
  const registry = loadHostBoundaryCapabilityRegistry({ file: registryFile });
  return {
    ok: true,
    schema: 'evercraft.host-boundary-capability-status.v1',
    registry_schema: registry.schema,
    registry_version: registry.version,
    capability_count: registry.capabilities.length,
    capabilities: registry.capabilities.map((capability) => ({
      capability_id: capability.capability_id,
      host_os: capability.host_os,
      operation: capability.operation,
      surface: capability.surface,
      scope: capability.scope,
      requires_explicit_pairing: capability.requires_explicit_pairing,
      requires_authorized_node: capability.requires_authorized_node,
      mutation_authority: capability.mutation_authority,
      arbitrary_desktop_control: capability.arbitrary_desktop_control,
      screenshots_collected: capability.screenshots_collected,
      raw_accessibility_tree_persisted: capability.raw_accessibility_tree_persisted,
      freshness_seconds: capability.freshness_seconds,
    })),
  };
}

export function getHostBoundaryCapability(
  capabilityId,
  { registryFile = DEFAULT_REGISTRY_FILE } = {},
) {
  const id = cleanCapabilityId(capabilityId);
  const registry = loadHostBoundaryCapabilityRegistry({ file: registryFile });
  const capability = registry.capabilities.find((row) => row.capability_id === id);
  if (!capability) throw new Error('host_boundary_capability_not_registered');
  return capability;
}
