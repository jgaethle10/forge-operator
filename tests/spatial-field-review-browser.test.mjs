import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const htmlPath=fileURLToPath(new URL('../public/worlds/perception-lab/field-review.html',import.meta.url));
const labPath=fileURLToPath(new URL('../public/worlds/perception-lab/index.html',import.meta.url));
const html=readFileSync(htmlPath,'utf8');

test('V6 review UI has local import, visible outcomes, and responsive graphs',()=>{
 for(const id of ['file','demo','message','dashboard','coverage','mae','rmse',
  'unresolved','scatter','outcomes','targets','filter','search','sort','detail',
  'warnings','provenance','reportTitle','classification','rowTotal']){
  assert.ok(html.includes('id="'+id+'"'),'missing control '+id);
 }
 assert.match(html,/@media\(max-width:830px\)/);
 assert.match(html,/Import field report JSON/);
 assert.match(html,/Explore synthetic fixture/);
 assert.match(html,/No uploads/);
 assert.match(html,/fieldAccuracyCertified:false/);
});

test('V6 module loads only local code; no external UI runtime or evidence transmission',()=>{
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script,'missing review script');
 const imports=[...script.matchAll(/^import .* from ['"]([^'"]+)['"];?$/gm)].map(m=>m[1]);
 assert.deepEqual(imports,['./field-review.mjs']);
 assert.ok(existsSync(resolve(dirname(htmlPath),imports[0])));
 assert.doesNotThrow(()=>new Function(script.replace(/^import .*;\n/gm,'')));
 assert.doesNotMatch(script,/\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b|\bWebSocket\b|\binnerHTML\s*=/);
 assert.match(script,/\.textContent=/);
 assert.match(script,/file\.size>10000000/);
});

test('existing spatial lab offers direct field-review entry',()=>{
 const index=readFileSync(labPath,'utf8');
 assert.match(index,/href="\.\/field-review\.html"/);
 assert.match(index,/Open field-review studio/);
});

test('V6 report review never calls the camera or uploads source imagery',()=>{
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.doesNotMatch(script,/getUserMedia|\.requestDevice|\bFileReader\s*\(|\.writeFile/);
 assert.match(script,/inspectFieldReport\(report\)/);
 assert.match(script,/filterFieldRows\(current/);
});
