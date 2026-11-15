import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const file=path.resolve('public/client001-onthego-growth-preview/index.html');
const html=fs.readFileSync(file,'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length,1);
const js=scripts[0][1];
assert.doesNotMatch(html,/<script[^>]+src\s*=/i);
assert.doesNotMatch(js,/\bfetch\s*\(|\bXMLHttpRequest\b/);
assert.match(html,/Private prototype/);
function probe(query){
 const els=new Map();
 const events={};
 function element(id){if(!els.has(id))els.set(id,{textContent:'',href:'',attributes:{},setAttribute(k,v){this.attributes[k]=v},addEventListener(type,callback){events[id+':'+type]=callback}});return els.get(id)}
 const document={documentElement:{lang:'en'},getElementById:element,querySelectorAll(){return[]}};
 const crypto={getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=i+1;return bytes}};
 const context={document,crypto,URLSearchParams,location:{search:query}};
 vm.runInNewContext(js,context,{timeout:1500});
 const ref=element('beaconValue').textContent;
 assert.equal(ref,'EC-010203040506');
 assert.match(element('emailCta').href,/mailto:onthegomobileoilchange@outlook.com/);
 const en=decodeURIComponent(element('emailCta').href);
 assert.match(en,/Referral: EC-010203040506/);
 events['es:click']();
 assert.equal(document.documentElement.lang,'es');
 const es=decodeURIComponent(element('emailCta').href);
 assert.match(es,/Solicitud de servicio/);
 return {source:en.includes('EC-EN-001'),unknown:en.includes('EC-DIRECT-001'),es};
}
const source=probe('?ec_source=EC-EN-001');assert.ok(source.source);
const bad=probe('?ec_source=EVIL-PAYMENT-REF');assert.ok(bad.unknown);
const plain=probe('');assert.ok(plain.unknown);
console.log('BEACON_PASS: ephemeral source code; English/Spanish mail handoff; whitelist; no remote tracking');
