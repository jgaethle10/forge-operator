import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {normalizePublicActivity, publicUrl, titleSafe, API} from '../public/live/work-source.mjs';
import {Script} from 'node:vm';

const base=new URL('../public/live/',import.meta.url);
const html=await readFile(new URL('index.html',base),'utf8');
const css=await readFile(new URL('workroom.css',base),'utf8');
const client=await readFile(new URL('workroom.mjs',base),'utf8');
const now=Date.parse('2026-10-23T21:33:00Z');
const origin='https://github.com/jgaethle10/forge-operator/';
const sample={
  pulls:[
    {number:1593,title:'Restore owned Clip video publishing adapters for Meta Pages and Instagram',html_url:origin+'pull/1593',updated_at:'2026-10-23T21:30:17Z',state:'open',draft:true,merged_at:null},
    {number:1596,title:'Fabric parity P0: preserve truthful failure receipts',html_url:origin+'pull/1596',updated_at:'2026-10-23T21:31:00Z',state:'open',draft:false,merged_at:null},
    {number:1111,title:'Credentials exposure in example project',html_url:origin+'pull/1111',updated_at:'2026-10-23T21:00:00Z',state:'open',draft:false,merged_at:null}
  ],
  runs:[{id:40027726591,run_number:2,name:'Rockies Wheel Lab isolated proof',html_url:origin+'actions/runs/40027726591',created_at:'2026-10-23T21:30:00Z',status:'completed',conclusion:'success',head_branch:'prototype/rockies-wheel-lab-rc01-20261016'}],
  commits:[{sha:'a'.repeat(40),html_url:origin+'commit/'+ 'a'.repeat(40),commit:{message:'CHUM public discovery mirrors updated',committer:{date:'2026-10-23T21:28:00Z'}}}]
};
test('public wall uses genuine GitHub endpoints, separate files and no simulator default',async()=>{
 assert.match(html,/Evercraft LIVE \| Actual Workroom/);
 assert.match(html,/type="module" src="\.\/workroom\.mjs"/);
 assert.match(html,/PUBLIC ENGINEERING RECEIPTS/);
 assert.doesNotMatch(html,/<iframe|id="yard"|SIMULATED EQUIPMENT/);
 assert.match(client,/fetch\(API\+path/);
 assert.match(client,/state\.healthy/);
 assert.ok((await stat(new URL('workroom.css',base))).size>1500);
 assert.ok((await stat(new URL('workroom.mjs',base))).size>1500);
 assert.ok((await stat(new URL('work-source.mjs',base))).size>1500);
 assert.match(API,/api\.github\.com\/repos\/jgaethle10\/forge-operator/);
 assert.doesNotThrow(()=>new Script(client.replace(/^import[^\n]*\n/,'').replace(/\bconst \$=/,'const $=')));
});
test('real source fixtures preserve distinct verified event types, dates and draft holds',()=>{
 const d=normalizePublicActivity(sample,now);
 assert.equal(d.items.length,3);
 const draft=d.items.find(x=>x.id==='pr-1593');
 assert.equal(draft.state,'DRAFT REVIEW');
 assert.equal(draft.url,origin+'pull/1593');
 assert.ok(d.items.some(x=>x.kind==='CODE COMMIT'));
 assert.ok(d.items.some(x=>x.state==='PASSED'));
 assert.equal(d.items.some(x=>x.id==='pr-1111'),false);
});
test('privacy guard rejects untrusted destination, secrets, old and future-dated events',()=>{
 assert.equal(titleSafe('Customer credentials were copied'),'');
 assert.equal(publicUrl('https://evil.invalid/jgaethle10/forge-operator/pull/1'),'');
 assert.equal(publicUrl('https://github.com/jgaethle10/another-repo/pull/1'),'');
 assert.equal(publicUrl(origin+'pull/111?q=sneaky'),'');
 const input={pulls:[{...sample.pulls[0],updated_at:'2025-01-01T10:00:00Z'}],runs:[{...sample.runs[0],created_at:'2026-10-25T01:00:00Z'}]};
 assert.equal(normalizePublicActivity(input,now).items.length,0);
});
test('repeat automation commits are de-duplicated rather than fabricating more work',()=>{
 const m={commits:[sample.commits[0],{...sample.commits[0],sha:'b'.repeat(40),html_url:origin+'commit/'+ 'b'.repeat(40)}]};
 assert.equal(normalizePublicActivity(m,now).stats.commit,1);
});
test('recording, source hold and responsive mobile contracts',()=>{
 for(const id of ['id="filmExit"','id="portrait"','id="refresh"','id="hold"','id="receipt"','id="checkedAt"','id="held"'])assert.ok(html.includes(id),id);
 assert.match(client,/showHeld\(/);
 assert.match(client,/source.*unavailable|SOURCE UNAVAILABLE/i);
 assert.match(client,/partial/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(css,/#app\.film/);
 assert.match(html,/connect-src https:\/\/api\.github\.com/);
 assert.doesNotMatch(html,/drive\.google\.com|base44\.app|<script>(?![\s\S]*<\/script>)/i);
});
