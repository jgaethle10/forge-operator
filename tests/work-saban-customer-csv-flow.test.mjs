import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import * as engine from '../public/work-saban/report/engine.mjs';

const root=new URL('../public/work-saban/',import.meta.url);
const sample=fs.readFileSync(new URL('example-sales.csv',root),'utf8');
const source=fs.readFileSync(new URL('report/report.js',root),'utf8');
const importStatement="import {analyzeSalesCsv,checkSalesReport,formatUsd,salesMarkdown,MAX_CSV_BYTES} from './engine.mjs';";
assert.ok(source.startsWith(importStatement),'Unexpected browser module import; update the test harness.');

function element(){
  const handlers=new Map();
  return {
    children:[],files:[],hidden:false,disabled:false,checked:false,value:'',textContent:'',
    addEventListener(event,fn){handlers.set(event,fn);},
    fire(event){return handlers.get(event)?.();},
    replaceChildren(...children){this.children=children;},
    append(...children){this.children.push(...children);},
    remove(){this.removed=true;},
    click(){this.clicked=true;},
    focus(){this.focused=true;},
    select(){this.selected=true;},
    scrollIntoView(){this.scrolled=true;}
  };
}
function preview(csv=sample,{clipboardBlocked=false}={}){
  const ids=['csv-file','consent','run','result','failure','status','fallback','total',
    'change','monthly','proof','download','copy','copy-text'];
  const nodes=Object.fromEntries(ids.map(id=>[id,element()]));
  nodes.run.disabled=true;
  nodes.result.hidden=true;
  nodes.failure.hidden=true;
  const body=element(),downloads=[],copied=[];
  let reads=0;
  const file={
    name:'monthly-sales.csv',size:Buffer.byteLength(csv),
    async text(){reads++;return csv;}
  };
  const document={
    body,
    getElementById:id=>nodes[id]||(()=>{throw Error('unknown_id_'+id);})(),
    createElement:()=>element()
  };
  const context={
    __engine:engine,document,crypto:webcrypto,TextEncoder,Blob,
    requestAnimationFrame:fn=>fn(),
    matchMedia:()=>({matches:true}),
    setTimeout:()=>{},
    navigator:{clipboard:{writeText:async text=>{
      if(clipboardBlocked)throw Error('blocked_clipboard');
      copied.push(text);
    }}},
    URL:{
      createObjectURL(blob){downloads.push(blob);return 'blob:local-test';},
      revokeObjectURL(){}
    }
    // No fetch, XMLHttpRequest, storage, WebSocket or access to a network.
  };
  const executable=source.replace(importStatement,
    'const {analyzeSalesCsv,checkSalesReport,formatUsd,salesMarkdown,MAX_CSV_BYTES}=globalThis.__engine;');
  vm.runInNewContext(executable,context,{filename:'report.js',timeout:3000});
  const choose=()=>{
    nodes['csv-file'].files=[file];
    nodes['csv-file'].fire('change');
  };
  const authorize=()=>{
    nodes.consent.checked=true;
    nodes.consent.fire('change');
  };
  return {nodes,file,choose,authorize,downloads,copied,reads:()=>reads};
}

test('a real selected CSV stays unread until explicit authorization and click',async()=>{
  const a=preview();
  assert.equal(a.reads(),0);
  a.choose();
  assert.equal(a.nodes.run.disabled,true);
  await a.nodes.run.fire('click');
  assert.equal(a.reads(),0,'button event cannot bypass consent');
  a.authorize();
  assert.equal(a.nodes.run.disabled,false);
  assert.equal(a.reads(),0);
  await a.nodes.run.fire('click');
  assert.equal(a.reads(),1);
  assert.equal(a.nodes.result.hidden,false);
  assert.equal(a.nodes.total.textContent,'$36,301.00');
  assert.equal(a.nodes.monthly.children.length,3);
  assert.match(a.nodes.proof.textContent,/Customer file transmitted: NO/);
  assert.equal(a.nodes.result.scrolled,true);
  assert.equal(a.nodes['csv-file'].value,'');
  assert.equal(a.nodes.consent.checked,false);
  assert.equal(a.nodes.run.disabled,true);
  assert.equal(a.downloads.length,0,'no automatic download or persistence');
});

test('a user-triggered save and copy produce the checked finished report',async()=>{
  const a=preview();
  a.choose();a.authorize();
  await a.nodes.run.fire('click');
  a.nodes.download.fire('click');
  assert.equal(a.downloads.length,1);
  const content=await a.downloads[0].text();
  assert.match(content,/Total sales:\*\* \$36,301.00/);
  assert.match(content,/Source digest: sha256:[0-9a-f]{64}/);
  assert.match(a.nodes.status.textContent,/Download requested/);
  await a.nodes.copy.fire('click');
  assert.deepEqual(a.copied,[content]);
  assert.match(a.nodes.status.textContent,/Report copied/);
});

test('bad customer CSV cannot produce a download, and errors are visible',async()=>{
  const a=preview('month,revenue\n2026-07,500.00\n2026-08,error');
  a.choose();a.authorize();
  await a.nodes.run.fire('click');
  assert.equal(a.nodes.result.hidden,true);
  assert.equal(a.nodes.failure.hidden,false);
  assert.match(a.nodes.failure.textContent,/Invalid revenue/);
  a.nodes.download.fire('click');
  assert.equal(a.downloads.length,0);
});

test('iPhone clipboard-denied path keeps selectable work in the tab',async()=>{
  const a=preview(sample,{clipboardBlocked:true});
  a.choose();a.authorize();await a.nodes.run.fire('click');
  await a.nodes.copy.fire('click');
  assert.equal(a.nodes.fallback.hidden,false);
  assert.equal(a.nodes['copy-text'].selected,true);
  assert.match(a.nodes['copy-text'].value,/Monthly sales report/);
  assert.match(a.nodes.status.textContent,/Clipboard access blocked/);
});
