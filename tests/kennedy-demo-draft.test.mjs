import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('public/kennedy-space-station/studio/index.html','utf8');
const start=html.indexOf('/* Evercraft Kennedy Drawing Studio: source-bound');
const end=html.indexOf('</script>',start);
if(start<0||end<0)throw Error('DRAFT_SCRIPT_MISSING');
const draftSource=html.slice(start,end);

function fixture(){
 const fields=new Map(Object.entries({
  siteName:'DEMONSTRATION RETAIL SITE',address:'Fictional property · location not assigned',
  rev:'CONCEPT 01 · EVERCRAFT',sourceText:'No real-world imagery supplied'
 }).map(([key,value])=>[key,{value,addEventListener(){}}]));
 for(const key of ['draftSave','draftLoad','messages','sourceReadiness']){
  fields.set(key,{value:'',textContent:'',classList:{add(){},toggle(){}},addEventListener(){}});
 }
 for(const slot of ['site','context']){
  for(const field of ['Provider','Reference','Captured','Rights']){
   const key=slot+field;
   fields.set(key,{value:field==='Rights'?'unknown':'',addEventListener(){}});
  }
 }
 const state={siteImage:'',contextImage:'',siteSource:'',contextSource:'',
              siteHash:'',contextHash:'',marks:[{type:'charger',x:333,y:355,angle:0}],
              calibration:null,calibrationPending:null,pending:null};
 const window={};
 let drawings=0;
 const $=id=>{if(!fields.has(id))throw Error('UNEXPECTED_DOM_ID '+id);return fields.get(id)};
 const sandbox={state,window,$,draw:()=>{drawings++},dl:()=>{},
                calibrateFromPoints:()=>null,Blob,FileReader:class {},Date};
 vm.runInNewContext(draftSource,sandbox,{timeout:300});
 return {api:window.__evercraftDraft,state,fields,$,getDrawings:()=>drawings};
}
const plain=v=>JSON.parse(JSON.stringify(v));

test('fictional demo can be saved as editable JSON without any uploaded images',()=>{
 const f=fixture(),draft=plain(f.api.makeDraft());
 assert.equal(draft.schema,'evercraft.site-planner.draft.v1');
 assert.equal(draft.source_mode,'synthetic_demonstration');
 assert.equal(draft.source_binding.demo_fixture,'evercraft.kennedy.synthetic-demo-v1');
 assert.equal(draft.source_binding.site_sha256,null);
 assert.equal(draft.image_names.site,'');
 assert.equal(draft.calibration,null);
 assert.equal(draft.engineering_approved,false);
 assert.equal(draft.payment_verified,false);
 f.state.marks=[];
 const count=f.api.restoreDraft(draft);
 assert.equal(count,1);
 assert.deepEqual(plain(f.state.marks),[{type:'charger',x:333,y:355,angle:0}]);
 assert.equal(f.getDrawings(),1);
});

test('synthetic drafts cannot be loaded as real-image drafts or smuggle calibration',()=>{
 const f=fixture();
 const demo=plain(f.api.makeDraft());
 const tampered=plain(demo);
 tampered.calibration={a:{x:40,y:75},b:{x:90,y:100},knownFeet:10,sourceName:''};
 assert.throws(()=>f.api.restoreDraft(tampered),/Synthetic demo source binding invalid/);
 for(const mutate of [
  d=>{d.source_binding.demo_fixture='another-fixture'},
  d=>{d.source_binding.source_kind='operator_supplied_image_unverified'},
  d=>{d.source_mode='operator_supplied_image_unverified'},
  d=>{delete d.source_binding.source_kind}
 ]){
  const bad=plain(demo);
  mutate(bad);
  assert.throws(()=>f.api.restoreDraft(bad),/Synthetic demo source binding invalid/);
 }
 f.state.siteImage='data:image/png;base64,AAAA';
 f.state.siteHash='a'.repeat(64);
 f.state.siteSource='licensed-user-image.png';
 assert.throws(()=>f.api.restoreDraft(demo),/Source fingerprint mismatch/);
});

test('real-image source SHA-256 remains mandatory and exact on restore',()=>{
 const f=fixture();
 f.state.siteImage='data:image/png;base64,AAAA';
 f.state.siteSource='source.png';
 assert.throws(()=>f.api.makeDraft(),/Wait for site image SHA-256/);
 f.state.siteHash='a'.repeat(64);
 const d=plain(f.api.makeDraft());
 assert.equal(d.source_mode,'operator_supplied_image_unverified');
 assert.equal(d.source_binding.site_sha256,'a'.repeat(64));
 assert.equal(d.source_binding.demo_fixture,undefined);
 f.state.siteHash='b'.repeat(64);
 assert.throws(()=>f.api.restoreDraft(d),/Source fingerprint mismatch/);
 f.state.siteHash='a'.repeat(64);
 assert.equal(f.api.restoreDraft(d),1);
 const legacy=plain(d);
 delete legacy.source_mode;
 delete legacy.source_binding.source_kind;
 assert.equal(f.api.restoreDraft(legacy),1,'historical real-source drafts remain compatible');
 const invalid=plain(d);
 invalid.source_binding.demo_fixture='synthetic';
 assert.throws(()=>f.api.restoreDraft(invalid),/Real source classification mismatch/);
});

test('draft shape and placement validation rejects broken external JSON before mutation',()=>{
 const f=fixture();
 const draft=plain(f.api.makeDraft());
 const original=plain(f.state.marks);
 draft.marks=[{type:'charger',x:Infinity,y:100}];
 assert.throws(()=>f.api.restoreDraft(draft),/Invalid drawing placement/);
 assert.deepEqual(plain(f.state.marks),original);
 const swapped=plain(f.api.makeDraft());
 swapped.project.address=123;
 assert.throws(()=>f.api.restoreDraft(swapped),/Invalid project details/);
 assert.deepEqual(plain(f.state.marks),original);
});
