import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const html = readFileSync(new URL('./merchant-desk.html', import.meta.url),'utf8');
const inline = html.split('<script>')[1]?.split('</script>')[0];
const header='sku,name,finish,diameter,unit_price_usd';
const row='W-100,"Spoke, twin",Bronze,19,249.95';

function launch() {
  const elements=new Map();
  const created=[];
  for(const id of ['shop','inventoryFile','catalogNote','item','quantity','vehicle','service','message','selectedSku','unitPrice','selectedQty','subtotal','dataState','export','reset']){
    elements.set(id,{
      value: id==='quantity'?'4':id==='service'?'none':'',
      textContent:'', listeners:{}, children:[],
      addEventListener(type,cb){this.listeners[type]=cb},
      replaceChildren(){this.children=[];this.value='0'},
      append(child){this.children.push(child)},
    });
  }
  const sandbox={
    Intl,Date,Number,JSON,Blob,Error,
    window:{},
    URL:{createObjectURL(){return 'blob:local-only'},revokeObjectURL(){}},
    setTimeout(fn){fn()},
    document:{
      getElementById(id){assert.ok(elements.has(id),'unknown id '+id);return elements.get(id)},
      createElement(tag){
        const item={tag,value:'',textContent:'',clicked:false,click(){item.clicked=true}};
        created.push(item);return item;
      }
    }
  };
  new Script(inline).runInContext(createContext(sandbox),{timeout:1200});
  return {elements,sandbox,api:sandbox.window.__wheelLabMerchantDeskTest,created};
}

test('RC04 standalone merchant desk parses and is network-isolated',()=>{
  assert.ok(inline);
  assert.doesNotThrow(()=>new Script(inline));
  assert.doesNotMatch(html,/<script[^>]+src=/i);
  assert.doesNotMatch(html,/<iframe/i);
  assert.doesNotMatch(inline,/\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket)\s*\(/);
  assert.doesNotMatch(html,/<form\b/i);
  const {api}=launch();assert.equal(typeof api.parseCsv,'function');
});

test('CSV import accepts quoted commas and makes correct cent arithmetic',()=>{
  const {api}=launch();
  const rows=api.parseCsv(header+'\n'+row+'\n');
  assert.equal(rows.length,1);
  assert.equal(rows[0].name,'Spoke, twin');
  assert.equal(rows[0].sku,'W-100');
  assert.equal(rows[0].cents,24995);
});

test('CSV parser rejects formulas, invalid prices, duplicate SKUs and oversized catalogs',()=>{
  const {api}=launch();
  const bad=[
    header+'\nX-1,Spoke,Silver,19,=4*100',
    header+'\nX-1,Spoke,Silver,19,-99.99',
    header+'\nX-1,Spoke,Silver,19,100.999',
    header+'\nX-1,Spoke,Silver,19,0',
    header+'\nX-1,Spoke,Silver,19,99\nx-1,Another,Black,18,99',
    header+'\nX-1,Spoke,Silver,19,"99',
    'sku,finish,name,diameter,unit_price_usd\nX-1,Silver,Spoke,19,99',
    header+'\n'+('X-1,Spoke,Black,19,99\n'.repeat(201)),
  ];
  for(const value of bad)assert.throws(()=>api.parseCsv(value));
});

test('synthetic price preview cannot issue a real quote or imply fitment',()=>{
  const {api}=launch();
  const p=api.packet();
  assert.equal(p.inventory_source,'fictional_sample');
  assert.equal(p.merchandise_subtotal_cents,79600);
  assert.equal(p.quantity,4);
  assert.equal(p.unit_price_cents,19900);
  assert.equal(p.status,'INTERNAL_DRAFT_UNVERIFIED');
  for(const flag of ['inventory_verified','fitment_verified','price_verified','shop_contacted','checkout_created','payment_verified','customer_consent_verified']){
    assert.equal(p[flag],false,flag);
  }
  assert.equal(p.tax_included,false);
  assert.equal(p.labor_included,false);
  assert.equal(p.source_is_example,true);
});

test('merchant file import is local and never upgrades unverified status',async()=>{
  const {api,elements}=launch();
  const callback=elements.get('inventoryFile').listeners.change;
  assert.equal(typeof callback,'function');
  const file={name:'retailer-catalog.csv',size:99,async text(){return header+'\n'+row}};
  await callback({target:{files:[file],value:''}});
  const p=api.packet();
  assert.equal(p.inventory_source,'operator_uploaded_csv');
  assert.equal(p.inventory_file_label,file.name);
  assert.equal(p.unit_price_cents,24995);
  assert.equal(p.merchandise_subtotal_cents,99980);
  assert.equal(p.inventory_verified,false);
  assert.equal(p.price_verified,false);
  assert.equal(p.fitment_verified,false);
});

test('an invalid upload never replaces the last accepted inventory',async()=>{
  const {api,elements}=launch();
  const callback=elements.get('inventoryFile').listeners.change;
  const file={name:'bad.csv',size:80,async text(){return header+'\nX1,Invalid,Silver,20,=500'}};
  await callback({target:{files:[file],value:''}});
  assert.equal(api.packet().inventory_source,'fictional_sample');
  assert.match(elements.get('message').textContent,/Import rejected/);
});
