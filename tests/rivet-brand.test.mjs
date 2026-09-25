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
for (const token of ['Open Sauce','Public Sans','[data-theme="dark"]']) {
  if (!css.includes(token)) fail('CSS missing brand token: ' + token);
}

const html = read('public/rivet/index.html');
if (!html.includes('<title>RIVET | EV infrastructure intelligence by address</title>')) fail('title is not canonical RIVET');
if (!html.includes('./brand.css') || !html.includes('./brand.json')) fail('brand assets not wired');
if (!html.includes('Locate. Assess. Decide.')) fail('brand process line missing');
if (html.includes('RIVET / AliEV')) fail('joined legacy identity visible on RIVET surface');
if (html.includes('aliev.base44.app')) fail('legacy AliEV runtime visible on RIVET surface');

const discovery = JSON.parse(read('public/rivet/discovery.json'));
if (discovery.name !== 'RIVET') fail('machine discovery canonical name drift');
if ((discovery.aliases || []).some((x) => /AliEV/i.test(x))) fail('AliEV leaked into RIVET public aliases');
if (JSON.stringify(discovery.process) !== JSON.stringify(['locate','assess','decide'])) fail('process drift');

const llms = read('public/rivet/llms.txt');
if (!llms.startsWith('# RIVET EV Infrastructure Intelligence')) fail('LLM guide heading drift');
if (/RIVET\s*\/\s*AliEV/i.test(llms)) fail('joined legacy identity leaked into RIVET LLM guide');

const scanRoots = [
  'public/rivet',
  'public/chum/capabilities/rivet-site-underwriting-v1',
  'public/chum/intents/rivet-site-underwriting-v1'
];
const allowedExt = new Set(['.html','.txt','.json','.jsonld','.css','.md']);
for (const root of scanRoots) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(root, entry.name);
    if (!allowedExt.has(path.extname(file))) continue;
    const content = read(file);
    if (/\bLuma\b/i.test(content)) fail('retired Luma identity found in ' + file);
  }
}

console.log('RIVET_BRAND_PASS', JSON.stringify({
  canonical: manifest.canonical_name,
  theme: manifest.theme.default,
  dark_mode: manifest.theme.dark_mode,
  palette: manifest.palette
}));
