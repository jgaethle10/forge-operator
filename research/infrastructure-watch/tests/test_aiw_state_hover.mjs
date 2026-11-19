#!/usr/bin/env node
// Offline regression: state hover figures match state selection and preserve input paths.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const dir=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(dir,'..','operator','aiw-state-first-private.html'),'utf8');
const match=html.match(/<script>\s*([\s\S]*?)<\/script>/);
assert.ok(match,'state-first inline script exists');
const js=match[1];
const start=js.indexOf('function snapshotFor(name)');
const end=js.indexOf('const supportsHover=',start);
assert.ok(start>=0&&end>start,'single shared snapshot resolver and tooltip builder');
const functions=js.slice(start,end);
assert.ok(js.includes("layer.bindTooltip(()=>hoverPreview(name)"),'hover shows figures without a click');
assert.ok(js.includes("if(supportsHover)layer.bindTooltip"),'hover requires real mouse/pointer');
assert.ok(js.includes("layer.on('click',()=>{layer.closeTooltip();choose(name,selectedName===name);});"),
  'click/tap still pins the state and opens deeper navigation');
assert.ok(!functions.includes('fetch('),'hover must read already loaded state data, not run a network request');

function createElement(tag){
  return {tag,children:[],textContent:'',className:'',append(...children){this.children.push(...children)}};
}
const ctx={
  document:{createElement},
  summaries:new Map([
    ['Washington',{bridges_2025:8480,poor_2025:402}],
    ['California',{bridges_2025:25975,poor_2025:1284}],
  ]),
  wa26:{scope:'WA_only_2026',records:8619,conditions:{P:403}},
  format:n=>Number(n).toLocaleString('en-US'),
};
vm.createContext(ctx);
vm.runInContext(functions+'\nthis.inspect={snapshotFor,hoverPreview};',ctx);
function flatten(element){
  return [element.textContent,...element.children.flatMap(flatten)].join(' | ');
}

const washington=ctx.inspect.snapshotFor('Washington');
assert.equal(washington.year,2026);
assert.equal(washington.total,8619);
assert.equal(washington.poor,403);
const waCard=flatten(ctx.inspect.hoverPreview('Washington'));
assert.match(waCard,/Washington/);
assert.match(waCard,/2026/);
assert.match(waCard,/8,619/);
assert.match(waCard,/403/);
assert.match(waCard,/not a danger alert/);

const cal=ctx.inspect.snapshotFor('California');
assert.equal(cal.year,2025);
assert.equal(cal.total,25975);
assert.equal(cal.poor,1284);
const caCard=flatten(ctx.inspect.hoverPreview('California'));
assert.match(caCard,/2025/);
assert.match(caCard,/25,975/);
assert.match(caCard,/1,284/);
assert.doesNotMatch(caCard,/8,619/);

assert.equal(ctx.inspect.snapshotFor('No matches'),null);
assert.doesNotMatch(flatten(ctx.inspect.hoverPreview('No matches')),/NaN|undefined/);

ctx.wa26=null;
const washingtonFallback=ctx.inspect.snapshotFor('Washington');
assert.equal(washingtonFallback.year,2025);
assert.equal(washingtonFallback.total,8480);
console.log('PASS: WA 2026 hover, other-state 2025 hover, missing data, click/tap preservation, no hover API calls');
