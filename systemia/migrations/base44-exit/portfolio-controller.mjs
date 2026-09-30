import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const inventoryPath = path.join(here, 'estate-live-2026-09-30.json');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));

const apps = Array.isArray(inventory.apps) ? inventory.apps : [];
const problems = [];
if (inventory.source !== 'Base44 authenticated estate listing') problems.push('inventory source is not the authenticated Base44 estate listing');
if (apps.length < 50) problems.push('observed estate unexpectedly contains fewer than 50 apps');
const refs = new Set();
for (const app of apps) {
  if (!app.legacy_ref || refs.has(app.legacy_ref)) problems.push('missing or duplicate legacy_ref');
  refs.add(app.legacy_ref);
  if (!Number.isInteger(app.wave)) problems.push(`${app.product}: missing wave`);
  if (!app.target || /base44/i.test(app.target)) problems.push(`${app.product}: invalid migration target`);
  if (!app.state) problems.push(`${app.product}: missing migration state`);
}
const untitled = apps.filter((app) => app.product === 'Untitled');
if (untitled.some((app) => app.wave !== 8 || app.state !== 'triage_required')) {
  problems.push('unnamed Base44 apps must remain explicit legacy triage until identified');
}
const critical = apps.filter((app) => app.wave <= 3);
const report = {
  schema: 'evercraft.systemia.base44-exit-report.v1',
  observed_at: inventory.observed_at,
  observed_count: apps.length,
  waves: Object.fromEntries([...new Set(apps.map((a) => a.wave))].sort((a,b)=>a-b).map((wave) => [wave, apps.filter((a)=>a.wave===wave).length])),
  critical_queue: critical.map(({legacy_ref,product,wave,lane,state,target}) => ({legacy_ref,product,wave,lane,state,target})),
  triage_count: untitled.length,
  destination: inventory.canonical_destination,
  problems
};
console.log(JSON.stringify(report, null, 2));
if (problems.length) process.exit(1);
