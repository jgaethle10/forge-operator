import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('./style.css',import.meta.url),'utf8');
const script=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'duplicate DOM ids');
for(const id of ['task','compose','demo','csv-file','csv-consent','csv-run','result','state',
  'roles','waves','gates','next','copy','demo-result','demo-steps','demo-label',
  'demo-report','demo-proof','save-report','office','office-scene','office-3d-toggle',
  'office-agent-name','office-agent-state','office-agent-proof','office-agent-evidence',
  'office-copy-receipt','office-events','office-back','office-next','office-replay',
  'office-trace-integrity','office-export-trace','office-details','csv-details','error']){
  assert.ok(ids.includes(id), 'existing app contract lost DOM ID: '+id);
}
const position=(fragment)=>html.indexOf(fragment);
assert.ok(position('id="task"')>0);
assert.ok(position('id="task"')<position('id="office"'),'task must precede office');
assert.ok(position('id="compose"')<position('id="csv-file"'),'primary action before local CSV');
assert.ok(position('id="result"')<position('id="office-details"'),'result before optional office');
assert.match(html,/<details id="office-details" class="customer-details">/);
assert.match(html,/<details id="csv-details" class="customer-details">/);
assert.doesNotMatch(html,/<details id="office-details"[^>]*\bopen\b/);
assert.doesNotMatch(html,/<details id="csv-details"[^>]*\bopen\b/);
assert.match(html, /Give your work <span>a team\.<\/span>/);
assert.match(html, /Planning does not start work/);
assert.match(html, /not separately running AI models/);
assert.match(html, /I authorize Work Saban to read this selected file for one local report/);
assert.match(html, /No account access or payments/);
assert.match(css, /color-scheme:light/);
assert.match(css, /#a4142f/i);
assert.match(css, /#fff/);
assert.match(css, /\[hidden\]\{display:none!important\}/);
assert.match(css, /@media\(max-width:700px\)/);
assert.match(script,/\$\('csv-consent'\)\.checked/);
assert.match(script,/\$\('csv-run'\)\.disabled/);
assert.match(script,/verify\(JSON\.parse\(line\)\)/);
assert.match(script,/source==='user'/);
assert.doesNotMatch(html, /<form\b|buy\.stripe\.com|<iframe\b|<script[^>]+src="https?:/i);
console.log(JSON.stringify({
  schema:'evercraft.work-saban.customer-first-ui-proof.v1',
  ok:true,main_action:'Plan my team',
  advanced_disclosures_closed_by_default:true,
  existing_runtime_dom_ids_retained:ids.length,
  current_mode:'local_preview_only',paid_checkout_added:false,
},null,2));
