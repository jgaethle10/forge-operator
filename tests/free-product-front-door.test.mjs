import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
const hub=read('public/try/index.html');
const source=read('public/try/llms.txt');
const mesh=read('public/mesh/index.html');
const readme=read('README.md');
const tools=[
 {name:'AI Boardroom',path:'public/mesh/ai-boardroom/compare/index.html',target:'../mesh/ai-boardroom/compare/'},
 {name:'Evercraft Research',path:'public/research/index.html',target:'../research/'},
 {name:'Work Saban',path:'public/work-saban/demo/index.html',target:'../work-saban/demo/'}
];
test('three real, existing free browser experiences have a public shared entrance',()=>{
 assert.equal((hub.match(/class="card"/g)||[]).length,3);
 assert.equal((hub.match(/class="action"/g)||[]).length,3);
 for(const item of tools){
  assert.equal(existsSync(item.path),true,item.path);
  assert.ok(hub.includes(item.target),item.target);
  assert.ok(source.includes(item.name),item.name);
 }
 assert.match(hub,/<title>Try Evercraft for free/);
 assert.match(hub,/<link rel="canonical" href="https:\/\/jgaethle10\.github\.io\/forge-operator\/try\/">/);
 assert.match(hub,/property="og:title"/);
 assert.match(hub,/No signup/);
 assert.match(hub,/No card required/);
});
test('free product claims stay truthful; payments are optional follow-up',()=>{
 assert.match(hub,/does not call remote AI models/i);
 assert.match(hub,/not a completed fact-checked report/i);
 assert.match(hub,/Sample data only/i);
 assert.doesNotMatch(hub,/Buy now|Guaranteed results|instant paid/i);
 assert.match(hub,/The checkout system is infrastructure, not the product/i);
 assert.match(source,/not a claim of live multi-agent/i);
 assert.match(source,/No unverified visitor or conversion counts/i);
});
test('existing public entry leads with usable free tools, not a paid request',()=>{
 assert.ok(mesh.includes('href="../try/"'));
 assert.ok(mesh.indexOf('Try three useful tools · Free')<mesh.indexOf('Explore paid services'));
 assert.ok(readme.includes('## Start with something free'));
 assert.ok(readme.indexOf('## Start with something free')<readme.indexOf('## Evercraft Research'));
});
