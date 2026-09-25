import fs from 'node:fs';

const stylesheet = '<link rel="stylesheet" href="/rivet/brand.css"><link rel="alternate" type="application/json" href="/rivet/brand.json">';
const targets = [
  'public/chum/capabilities/rivet-site-underwriting-v1/index.html',
  'public/chum/intents/rivet-site-underwriting-v1/index.html'
];

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('/rivet/brand.css')) continue;

  const marker = '</head>';
  if (!html.includes(marker)) throw new Error('RIVET_BRAND_PATCH_FAIL: head marker missing in ' + file);
  html = html.replace(marker, stylesheet + '\n' + marker);
  fs.writeFileSync(file, html);
}

console.log('RIVET_GENERATED_SURFACES_BRANDED');
