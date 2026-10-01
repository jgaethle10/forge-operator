import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

const criticalFiles=[
  'systemia/yard/public-edge-controller.mjs',
  'systemia/mcp/specialist-handoff-runtime.mjs',
  'systemia/app-fabric/client.mjs',
  'systemia/app-fabric/gateway.mjs',
  'systemia/app-fabric/identity-adapter.mjs',
  'systemia/identity/identity.mjs',
  'systemia/identity/challenge-broker.mjs',
  'systemia/object-store/object-store.mjs',
  'systemia/secret-store/secret-store.mjs',
  'systemia/realtime-bus/realtime-bus.mjs',
  'systemia/object-store/delivery-gateway.mjs',
  'systemia/connector-gateway/adapters/polar.mjs',
  'systemia/commerce-boundary/polar-adapter.mjs',
  'systemia/commerce-boundary/stripe-provider.mjs',
  'systemia/commerce-boundary/stripe-adapter.mjs',
  'systemia/workforce/commerce-runtime.mjs',
  'systemia/audit-center/commerce-runtime.mjs',
  'systemia/audit-center/export-runtime.mjs',
  'systemia/remote-ops/voice-runtime.mjs',
  'systemia/operations/auto-clock-out.mjs',
  'systemia/internal-ops/snapshot.mjs',
  'systemia/internal-ops/snapshot-ingress.mjs',
  'systemia/internal-ops/intake.mjs',
  'systemia/internal-ops/systemia-sync.mjs',
];

const forbidden=[
  /https?:\/\/[^\s"'\x60]*\.base44\.app\b/i,
  /https?:\/\/base44\.app\b/i,
  /https?:\/\/media\.base44\.[^\s"'\x60]*/i,
];

const failures=[];
for(const relative of criticalFiles){
  const file=path.join(root,relative);
  if(!fs.existsSync(file)){
    failures.push({file:relative,reason:'critical_owned_runtime_file_missing'});
    continue;
  }
  const source=fs.readFileSync(file,'utf8');
  for(const pattern of forbidden){
    if(pattern.test(source)){
      failures.push({
        file:relative,
        reason:'hardcoded_base44_network_route_forbidden',
        pattern:String(pattern)
      });
    }
  }
}

if(failures.length){
  console.error(JSON.stringify({
    status:'BASE44_OWNED_RUNTIME_FIREWALL_FAIL',
    failures
  },null,2));
  process.exit(1);
}

console.log(JSON.stringify({
  status:'BASE44_OWNED_RUNTIME_FIREWALL_PASS',
  critical_files_checked:criticalFiles.length,
  hardcoded_base44_network_routes:0,
  compatibility_naming_allowed:true,
  migration_extraction_code_outside_firewall:true
}));
