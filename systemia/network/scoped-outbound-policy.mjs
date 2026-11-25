// Pure policy evaluation; no transport, filesystem or process authority.
const HASH = 'systemia.content-hash.v1';
const CEMETERY = new Set(['systemia.evermaps-cemetery-restore.v1','systemia.evermaps-cemetery-ingest.v1']);
export function createScopedOutboundPolicy({policy='content-hash-only',workloads=[HASH]}={}) {
  if (!['content-hash-only','node002-cemetery-scoped'].includes(policy)) throw Error('unknown_command_policy');
  if (!Array.isArray(workloads) || !workloads.length || workloads.some(w=>w!==HASH && !(policy==='node002-cemetery-scoped' && CEMETERY.has(w)))) throw Error('invalid_workload_allowlist');
  const allowed = new Set(workloads);
  if ([...CEMETERY].filter(w=>allowed.has(w)).length>1) throw Error('restore_ingest_mutually_exclusive');
  return ({method='GET',route='',body}={})=>{
    method=String(method).toUpperCase();
    if(method==='GET') return ['/v1/health','/v1/capacity','/v1/operator/status'].includes(route);
    if(method!=='POST') return false;
    if(route==='/v1/attest') return true;
    if(route==='/v1/jobs') return allowed.has(body?.workload);
    // Lease admission must independently enforce workload authorization at the runtime.
    if(route==='/v1/leases') return allowed.has(body?.workload);
    return /^\/v1\/leases\/[A-Za-z0-9_-]{1,128}\/(?:renew|release)$/.test(route);
  };
}
