import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
test('Kaidance standalone owned assets are complete, public-only and mirrored from canonical source',()=>{
 const html=read('../public/kaidance/index.html');
 const js=read('../public/kaidance/app.mjs');
 assert.match(html,/href="\.\/mark\.svg"/);
 assert.match(js,/from '\.\/work-source\.mjs'/);
 assert.match(html,/href="\.\/experience\.css"/);
 assert.match(html,/src="\.\/visual\.mjs"/);
 assert.doesNotMatch(html,/\.\.\/headquarters\//);
 assert.doesNotMatch(js,/\.\.\/live\//);
 assert.equal(read('../public/kaidance/work-source.mjs'),read('../public/live/work-source.mjs'),'Source copies must be reconciled at each LIVE change');
 assert.equal(read('../public/kaidance/mark.svg'),read('../public/headquarters/mark.svg'),'Use the same Evercraft official public mark');
 assert.doesNotMatch(read('../public/kaidance/work-source.mjs'),/Authorization:\s*Bearer|PRIVATE_KEY|process\.env/);
});
test('owned Caddy route is staged, narrowly allowlisted, and never exposes private mission paths',()=>{
 const route=read('../infra/evercraft-edge/kaidance/Caddyfile.route.example');
 assert.match(route,/STAGED ONLY/);
 assert.match(route,/route \/kaidance\/\*/);
 for(const suffix of ['index.html','app.mjs','style.css','experience.css','visual.mjs','pulse-source.mjs','work-source.mjs','mark.svg','pulse.json'])
   assert.ok(route.includes('/kaidance/'+suffix),suffix);
 assert.match(route,/Cache-Control "no-store/);
 assert.match(route,/respond 404/);
 assert.doesNotMatch(route,/reverse_proxy|0\.0\.0\.0:|:443\s*\{|tls\s+internal/);
 assert.doesNotMatch(route, /\/private\/|\/yard\/|\/secrets\//i);
});
test('there is no public pulse or operator approval committed with the static site',()=>{
 for(const name of ['pulse.json','approval.json','private-state.json','runtime-health.json']){
   assert.equal(fs.existsSync(new URL('../public/kaidance/'+name,import.meta.url)),false,name+' must not be in repo');
 }
});
