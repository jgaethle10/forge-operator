import fs from 'node:fs';
import {
  RIVET_PUBLIC_ID,
  RIVET_COMMERCE_TARGET_ID,
  RIVET_REPORT_OFFER_KEYS
} from '../systemia/rivet/commerce-bridge.mjs';

const fail = (message) => { throw new Error('RIVET_COMMERCE_BRIDGE_FAIL: ' + message); };
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const catalog = readJson('public/.well-known/evercraft-machine-catalog.json');
const target = (catalog.offers || []).find((offer) => offer.public_id === RIVET_COMMERCE_TARGET_ID);
if (!target) fail('verified commerce target missing');
if (target.commercial_state !== 'sell_now') fail('verified commerce target is not sell_now');
for (const key of RIVET_REPORT_OFFER_KEYS) {
  if (!(target.offers || []).some((offer) => offer.offer_key === key)) fail('target missing report offer ' + key);
}

if (RIVET_COMMERCE_TARGET_ID !== RIVET_PUBLIC_ID) {
  fail('RIVET must be its own verified commerce target');
}

for (const file of [
  'public/rivet/start/index.html',
  'public/rivet/start/llms.txt',
  'public/rivet/start/offer.json'
]) {
  if (!fs.existsSync(file)) fail('generated start surface missing: ' + file);
  const value = fs.readFileSync(file, 'utf8');
  if (/AliEV|aliev\.base44\.app/i.test(value)) fail('backend identity leaked into RIVET start surface: ' + file);
}

const offer = readJson('public/rivet/start/offer.json');
if (offer.name !== 'RIVET') fail('start manifest lost RIVET identity');
if (offer.commercial_state !== 'sell_now') fail('start manifest did not inherit current sell_now state');
if (offer.start_url !== '/api/chum/go/rivet-site-underwriting-v1?surface=rivet_start') {
  fail('start manifest route drifted');
}
for (const key of RIVET_REPORT_OFFER_KEYS) {
  const projected = (offer.offers || []).find((row) => row.offer_key === key);
  const source = (target.offers || []).find((row) => row.offer_key === key);
  if (!projected) fail('projected offer missing: ' + key);
  if (projected.price !== source.price) fail('projected price drift: ' + key);
  if (!/^RIVET\b/.test(projected.name)) fail('projected offer is not RIVET branded: ' + key);
}

const server = fs.readFileSync('server.ts', 'utf8');
if (server.includes('resolveRivetCommercePublicId')) fail('temporary RIVET alias shim leaked into runtime');
if (server.includes("ec_alias")) fail('temporary RIVET alias attribution leaked into runtime');

const sitemap = fs.readFileSync('public/sitemap.xml', 'utf8');
for (const route of ['/rivet/start/','/rivet/start/offer.json','/rivet/start/llms.txt']) {
  if (!sitemap.includes(route)) fail('sitemap missing ' + route);
}

console.log('RIVET_COMMERCE_BRIDGE_PASS', JSON.stringify({
  target: RIVET_COMMERCE_TARGET_ID,
  alias: RIVET_PUBLIC_ID,
  offers: offer.offers.map((row) => ({ offer_key: row.offer_key, price: row.price }))
}));
