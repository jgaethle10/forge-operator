import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {renderEvermapsMobileExplorer} from './mobile-explorer-shell.mjs';
const base=async()=>readFile(new URL('./research-viewer.html',import.meta.url),'utf8');
test('mobile explorer rejects an unverified legacy viewer',async()=>{
 const html=await base();
 assert.throws(()=>renderEvermapsMobileExplorer(html),/Verified preloaded/);
});
test('mobile explorer preserves bootstrap and provides new visible no-script app shell',()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1050"><path d="M1,2L4,5Z"/></svg>';
 const script="Object.assign(data,{resources:{features:[1]}});preview.hidden=true;document.body.classList.add('evermaps-live');";
 const input='<div id="mobile-static-preview">'+svg+'</div><script>'+script+'</script>';
 const html=renderEvermapsMobileExplorer(input);
 for(const marker of ['Explore the','Grant County','1,161','Geological classifications',
  'Map layers &amp; visibility','id="wrap"','id="map"','id="files"','id="toggles"',
  'id="mobile-static-preview"','id="zoomIn"','id="zoomOut"','id="fit"',
  '#layers-detail{display:none}','evermaps-live #layers-detail{display:block'])
  assert.ok(html.includes(marker),'Missing modern mobile element '+marker);
 assert.equal((html.match(/<script>/g)||[]).length,1);
 assert.equal((html.match(/<\/script>/g)||[]).length,1);
 const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 assert.doesNotThrow(()=>new Script(js));
 assert.ok(html.includes('Object.assign(data,'));
});
