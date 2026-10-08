/**
 * Resolve only the previously externally receipted, owned, read-only Fabric MCP.
 * This is discovery metadata, NOT a live-now health check or payment authority.
 */
export function verifiedReadonlyUniversalMcp(distribution) {
  const runtime = distribution?.live_runtime;
  if (!runtime ||
      runtime.state !== 'owned_fabric_public_https_mcp_verified' ||
      runtime.authority !== 'receipt_backed_owned_public_runtime' ||
      runtime.read_only !== true ||
      runtime.transactional !== false ||
      runtime.base44_runtime_supported !== false ||
      !String(runtime.evidence_ref || '').endsWith('evercraft-fabric-operator-edge.json') ||
      !Number.isFinite(Date.parse(runtime.last_verified_at || ''))) return null;
  const registry = (distribution.destinations || []).find(
    (row) => row.destination === 'Official MCP Registry'
  );
  if (!registry ||
      registry.state !== 'verified_published_owned_runtime' ||
      registry.is_latest !== true) return null;
  try {
    const endpoint = new URL(runtime.endpoint);
    if (endpoint.protocol !== 'https:' ||
        endpoint.hostname !== 'fabric.systemiacommandcenters.com' ||
        endpoint.pathname !== '/mcp' ||
        endpoint.search || endpoint.hash || endpoint.username || endpoint.password) return null;
    return endpoint.toString();
  } catch {
    return null;
  }
}
