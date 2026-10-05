import fs from 'node:fs';

const files = [
  'scripts/portfolio-sentinel-commercial-canary.mjs',
  'systemia/organism/portfolio-sentinel-runner.mjs',
  '.github/workflows/systemia-portfolio-sentinel.yml',
  '.github/workflows/evercraft-mcp-canary.yml',
  'server.ts',
  '.github/workflows/eps-social-yard-canary.yml',
  '.github/workflows/clip-native-facebook-page-publisher.yml',
  '.github/workflows/evercraft-journal-pages.yml',
  '.github/workflows/evercraft-journal-owned.yml',
  '.github/workflows/revenue-autonomy-heartbeat.yml',
  'systemia/compute/eps-social-yard-canary.mjs',
  'systemia/organism/eps-social-continuity.mjs',
  'systemia/chum/start-corridor.mjs',
  'systemia/chum/sync-public-discovery.mjs',
  'systemia/chum/build-public-mirror.mjs',
  'systemia/chum/build-capability-mirror.mjs',
  'systemia/chum/build-commercial-discovery-mesh.mjs',
  'systemia/clip/social-publisher-runtime.mjs',
  'systemia/clip/facebook-page-publisher.mjs',
  'systemia/newsroom/journal-publisher.mjs',
  'systemia/autonomy/github-revenue-heartbeat.mjs',
  'distribution/direct-plugin-specs.json',
  'public/.well-known/evercraft-products.json',
  'registry/catalog.json',
  'public/.well-known/evercraft-machine-catalog.json',
  'public/.well-known/evercraft-direct-doors.json',
  'public/.well-known/evercraft-discovery.json',
  'public/ai-discovery.json',
  '.github/workflows/chum-watershed.yml'
];

const runtimeFiles = new Set([
  'scripts/portfolio-sentinel-commercial-canary.mjs',
  'systemia/organism/portfolio-sentinel-runner.mjs',
  'server.ts',
  'systemia/compute/eps-social-yard-canary.mjs',
  'systemia/organism/eps-social-continuity.mjs',
  'systemia/chum/start-corridor.mjs',
  'systemia/chum/sync-public-discovery.mjs',
  'systemia/chum/build-public-mirror.mjs',
  'systemia/chum/build-capability-mirror.mjs',
  'systemia/chum/build-commercial-discovery-mesh.mjs',
  'systemia/clip/social-publisher-runtime.mjs',
  'systemia/clip/facebook-page-publisher.mjs',
  'systemia/newsroom/journal-publisher.mjs',
  'systemia/autonomy/github-revenue-heartbeat.mjs'
]);

const legacyUrl = /https?:\/\/[^\s"'\x60<>]*base44\.app[^\s"'\x60<>]*/ig;
const base44EntityAccess = /\bentities\.[A-Za-z_$][A-Za-z0-9_$]*\s*\.\s*(filter|list|get|create|update|delete|bulkCreate|bulkUpdate)\b/gm;
const base44FunctionInvoke = /\bfunctions\s*\.\s*invoke\s*\(/gm;
const failures = [];

for (const file of files) {
  if (!fs.existsSync(file)) {
    failures.push(file + ': missing');
    continue;
  }

  const content = fs.readFileSync(file, 'utf8');
  const urls = [...content.matchAll(legacyUrl)].map((m) => m[0]);
  if (urls.length) {
    failures.push(file + ': legacy URL ' + urls.slice(0, 5).join(', '));
  }

  if (runtimeFiles.has(file)) {
    const entityMatches = [...content.matchAll(base44EntityAccess)].map((m) => m[0]);
    const invokeMatches = [...content.matchAll(base44FunctionInvoke)].map((m) => m[0]);

    if (entityMatches.length) {
      failures.push(file + ': Base44 entity access ' + entityMatches.slice(0, 5).join(', '));
    }
    if (invokeMatches.length) {
      failures.push(file + ': Base44 functions.invoke usage ' + invokeMatches.slice(0, 5).join(', '));
    }
  }
}

if (failures.length) {
  console.error('NO_BASE44_HOTPATH_FAIL');
  for (const failure of failures) console.error('-', failure);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'NO_BASE44_HOTPATH_PASS',
  checked_files: files.length,
  checked_runtime_files: runtimeFiles.size,
  policy: 'active runtime, public routing, publishing and scheduled revenue execution must not target or invoke the retired provider'
}));
