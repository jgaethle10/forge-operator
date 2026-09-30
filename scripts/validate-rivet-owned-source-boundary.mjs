import fs from 'node:fs';

const files = [
  'systemia/aliev/source-runtime.mjs',
  'systemia/rivet/report-runtime.mjs',
  'systemia/rivet/http-gateway.mjs',
  'systemia/compute/runtime-node.mjs',
  'systemia/yard/rivet-owned-source-runtime.proof.mjs',
];

const fail = (message) => {
  console.error('RIVET_OWNED_SOURCE_BOUNDARY_FAIL: ' + message);
  process.exit(1);
};

for (const file of files) {
  const text = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  if (/https?:\/\/[^"'\s]*base44\.app/i.test(text)) {
    fail(file + ' contains a live Base44 URL');
  }
}

const source = fs.readFileSync(new URL('../systemia/aliev/source-runtime.mjs', import.meta.url), 'utf8');
const report = fs.readFileSync(new URL('../systemia/rivet/report-runtime.mjs', import.meta.url), 'utf8');
const compute = fs.readFileSync(new URL('../systemia/compute/runtime-node.mjs', import.meta.url), 'utf8');

for (const marker of [
  'systemia.aliev-source-runtime.v1',
  'legacy_provider_transport: false',
  'missing_is_never_zero',
]) {
  if (!source.includes(marker)) fail('owned AliEV source missing marker: ' + marker);
}

for (const marker of [
  'legacy_source_fallback:false',
  'legacy_base44_source_url_prohibited',
  "sourceUrl=process.env.ALIEV_YARD_SOURCE_URL || ''",
]) {
  if (!report.includes(marker)) fail('RIVET report runtime missing marker: ' + marker);
}

for (const marker of [
  "'systemia.aliev-source-runtime.v1'",
  'owned_source_embedded',
  'legacy_base44_source_url_prohibited',
]) {
  if (!compute.includes(marker)) fail('Evercraft Compute missing marker: ' + marker);
}

console.log(JSON.stringify({
  status: 'RIVET_OWNED_SOURCE_BOUNDARY_PASS',
  inspected_files: files.length,
  live_base44_urls: 0,
  embedded_owned_source: true,
  fail_closed_legacy_url: true,
}));
