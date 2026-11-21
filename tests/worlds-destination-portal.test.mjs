import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {validateDestinationRegistry,portalHref,filterDestinations} from '../public/worlds/world-portal.mjs';
const root=path.resolve(import.meta.dirname,'..');
const registry=JSON.parse(fs.readFileSync(path.join(root,'public/worlds/destinations.v1.json'),'utf8'));
test('Portal validates actual canonical destinations',()=>{
 const destinations=validateDestinationRegistry(registry);
 assert.equal(destinations.length,6);
 for(const item of destinations)assert.equal(portalHref(item.path),item.path);
});
test('Portal route guard refuses offsite and malformed routes',()=>{
 for(const route of ['https://example.com/','//evil.com','/worlds/../admin','javascript:alert(1)','/worlds/%2e%2e/','/worlds/?redirect=x']){
  assert.throws(()=>portalHref(route),route);
 }
});
test('Portal can search and filter registry without changing source data',()=>{
 const worlds=validateDestinationRegistry(registry);
 assert.ok(filterDestinations(worlds,'seattle').some(w=>w.id==='seattle-sky'));
 assert.ok(filterDestinations(worlds,'flight','flight').length>=2);
 assert.equal(filterDestinations(worlds,'underground','flight').length,0);
 assert.equal(worlds.length,6);
});
test('Gateway owns a fallback when its registry cannot load',()=>{
 const html=fs.readFileSync(path.join(root,'public/worlds/gateway/index.html'),'utf8');
 const script=fs.readFileSync(path.join(root,'public/worlds/gateway/portal.mjs'),'utf8');
 assert.match(html,/id="portalList"/);
 assert.match(html,/id="portalSearch"/);
 assert.match(html,/id="portalCategory"/);
 assert.match(html,/src="\.\/portal\.mjs"/);
 assert.match(script,/destinations\.v1\.json/);
 assert.match(script,/catch\(error\)/);
});
