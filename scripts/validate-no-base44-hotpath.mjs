import fs from 'node:fs';

const files = [
  '.github/workflows/eps-social-yard-canary.yml',
  'systemia/compute/eps-social-yard-canary.mjs',
  'systemia/organism/eps-social-continuity.mjs',
  'systemia/chum/start-corridor.mjs',
  'systemia/chum/sync-public-discovery.mjs',
  'systemia/chum/build-public-mirror.mjs',
  'systemia/chum/build-capability-mirror.mjs',
  'systemia/chum/build-commercial-discovery-mesh.mjs',
  'distribution/direct-plugin-specs.json',
  'public/.well-known/evercraft-products.json',
  'registry/catalog.json',
  'public/.well-known/evercraft-machine-catalog.json',
  'public/.well-known/evercraft-direct-doors.json',
  'public/.well-known/evercraft-discovery.json',
  'public/ai-discovery.json',
  '.github/workflows/chum-watershed.yml'
];

const legacyUrl = /https?:\/\/[^\s"'\x60<>]*base44\.app[^\s"'\x60<>]*/ig;
const failures = [];

for (const file of files) {
  if (!fs.existsSync(file)) {
    failures.push(file + ': missing');
    continue;
  }
  const content = fs.readFileSync(file, 'utf8');
  const matches = [...content.matchAll(legacyUrl)].map((m) => m[0]);
  if (matches.length) failures.push(file + ': ' + matches.slice(0, 5).join(', '));
}

if (failures.length) {
  console.error('NO_BASE44_HOTPATH_FAIL');
  for (const failure of failures) console.error('-', failure);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'NO_BASE44_HOTPATH_PASS',
  checked_files: files.length,
  policy: 'active runtime, public routing and social publishing must not target the retired provider'
}));
