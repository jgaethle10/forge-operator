import fs from 'node:fs';
import path from 'node:path';

const fail = (message) => { throw new Error('RIVET_BRAND_FAIL: ' + message); };
const read = (p) => fs.readFileSync(p, 'utf8');

const manifest = JSON.parse(read('public/rivet/brand.json'));
const expectedPalette = {
  midnight: '#0B1424',
  neon: '#62D134',
  deep_cobalt: '#1F4AAB',
  bone: '#F5F2EA',
  slate: '#64748B'
};

for (const [key, value] of Object.entries(expectedPalette)) {
  if (manifest.palette?.[key] !== value) fail('palette drift: ' + key);
}
if (manifest.canonical_name !== 'RIVET') fail('canonical name must be RIVET');
if (manifest.theme?.default !== 'light') fail('light/Bone must remain default');
if (manifest.theme?.dark_mode !== 'Midnight') fail('Midnight dark mode contract missing');
if (manifest.typography?.headings !== 'Open Sauce, Medium or bolder') fail('heading type drift');
if (manifest.typography?.body !== 'Public Sans') fail('body type drift');

const css = read('public/rivet/brand.css');
for (const value of Object.values(expectedPalette)) {
  if (!css.includes(value)) fail('CSS missing canonical color ' + value);
}
for (const token of ['Open Sauce', 'Public Sans', '[data-theme="dark"]']) {
  if (!css.includes(token)) fail('CSS missing brand token: ' + token);
}

const html = read('public/rivet/index.html');
if (!html.includes('<title>RIVET | EV infrastructure intelligence by address</title>')) fail('title is not canonical RIVET');
if (!html.includes('./brand.css') || !html.includes('./brand.json')) fail('brand assets not wired');
if (!html.includes('Locate. Assess. Decide.')) fail('brand process line missing');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const publicFiles = walk('public/rivet')
  .filter((p) => ['.html','.txt','.json','.jsonld','.css','.md'].includes(path.extname(p)));

for (const file of publicFiles) {
  const value = read(file);
  if (/\bLuma\b/i.test(value)) fail('retired Luma identity found in ' + file);
  if (/RIVET\s*\/\s*AliEV/i.test(value)) fail('joined identity found in public RIVET surface ' + file);
  if (/\bAliEV\b/i.test(value)) fail('backend identity found in public RIVET surface ' + file);
  if (/aliev\.base44\.app/i.test(value)) fail('legacy runtime found in public RIVET surface ' + file);
}

for (const file of [
  'public/chum/capabilities/rivet-site-underwriting-v1/index.html',
  'public/chum/intents/rivet-site-underwriting-v1/index.html'
]) {
  const value = read(file);
  if (!value.includes('/rivet/brand.css')) fail('generated RIVET surface not branded: ' + file);
  if (/\bLuma\b/i.test(value)) fail('retired Luma identity found in ' + file);
}

const discovery = JSON.parse(read('public/rivet/discovery.json'));
if (discovery.name !== 'RIVET') fail('machine discovery canonical name drift');
if ((discovery.aliases || []).some((x) => /AliEV/i.test(x))) fail('backend identity leaked into RIVET aliases');
if (JSON.stringify(discovery.process) !== JSON.stringify(['locate','assess','decide'])) fail('process drift');

const mesh = JSON.parse(read('public/rivet/mesh/index.json'));
if (mesh.schema !== 'evercraft.rivet.semantic-mesh.v2') fail('mesh schema drift');
if (mesh.canonical_service !== 'RIVET EV Infrastructure Intelligence') fail('mesh canonical service drift');

console.log('RIVET_BRAND_PASS', JSON.stringify({
  canonical: manifest.canonical_name,
  theme: manifest.theme.default,
  dark_mode: manifest.theme.dark_mode,
  palette: manifest.palette,
  scanned_files: publicFiles.length
}));
