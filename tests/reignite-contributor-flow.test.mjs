import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext, createContext, runInContext } from 'node:vm';
import { setTimeout as sleep } from 'node:timers/promises';
import { createQuickSuggestion, IDEAS, PLACES } from '../public/reignite/layout/quick-idea.mjs';

const app=readFileSync(new URL('../public/reignite/layout/app.js',import.meta.url),'utf8');
const seed=JSON.parse(readFileSync(new URL('../public/reignite/layout/seed.json',import.meta.url),'utf8'));
const csrf='c'.repeat(43);
const grant='g'.repeat(43);
const clone=value=>JSON.parse(JSON.stringify(value));

function fakeElement(id){
 const listeners={};
 const classes=new Set();
 const el={
   id,value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,style:{},
   dataset:{},files:[],children:[],
   listeners,
   classList:{
     toggle(name,enabled){if(enabled===undefined? !classes.has(name):enabled)classes.add(name);else classes.delete(name)},
     contains(name){return classes.has(name)},
   },
   attributes:new Map(),
   addEventListener(name,fn){listeners[name]=fn},
   setAttribute(name,value){this.attributes.set(name,String(value))},
   getAttribute(name){return this.attributes.get(name)},
   append(child){this.children.push(child)},
   querySelectorAll(){return []},
   reset(){},
   click(){return this.listeners.click?.({preventDefault(){}})},
 };
 return el;
}
function harness({withInvite=true,withSession=false}={}){
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,fakeElement(id));return nodes.get(id)};
 const forms=['zoneForm','quickIdeaForm'];
 for(const id of forms){
  const form=node(id);
  const fields=id==='zoneForm'?
   ['name','category','map','stage','owner','source_ref','notes','capacity','x','y','w','h']:
   ['kind','name','place','description'];
  form.elements=Object.fromEntries(fields.map(name=>[name,fakeElement(name)]));
  form.querySelectorAll=()=>Object.values(form.elements);
 }
 const idea=node('quickIdeaForm');
 idea.elements.kind.value='art';
 idea.elements.name.value='Coastal photo gallery';
 idea.elements.place.value='unsure';
 idea.elements.description.value='An accessible local and international coastal photography exhibit.';
 const routeCalls=[];
 let mine=[];
 let proposalNumber=0;
 const respond=(data,status=200)=>({ok:status>=200&&status<300,status,
   json:async()=>clone(data)});
 const fetcher=async(url,options={})=>{
  routeCalls.push({url,options});
  if(url==='./seed.json')return respond(seed);
  if(url==='./api/invite/redeem'){
    assert.equal(options.method,'POST');
    assert.equal(JSON.parse(options.body).grant,grant);
    return respond({schema:'evercraft.reignite.invited-editor-session.v2',
      scope:'propose_and_read_own',session_mode:'cookie',csrf_token:csrf});
  }
  if(url==='./api/session'){
    return withSession?respond({authenticated:true,role:'editor',
      auth_mode:'cookie',csrf_token:csrf}):respond({error:'not_connected'},401);
  }
  if(url==='./api/plan')return respond({role:'editor',actor:'Guest photographer',plan:seed});
  if(url==='./api/mine')return respond({schema:'evercraft.reignite.contributor-status.v1',
    items:mine,revision:seed.revision,event_approved:false});
  if(url==='./api/proposals'){
    assert.equal(options.method,'POST');
    assert.equal(options.credentials,'same-origin');
    assert.equal(options.headers['x-reignite-csrf'],csrf);
    assert.equal(options.headers['x-reignite-key'],undefined,
      'one-tap contributor must not need or expose a manually entered bearer key');
    const input=JSON.parse(options.body);
    assert.equal(input.base_revision,seed.revision);
    assert(input.candidate.zones.length>seed.zones.length);
    assert(input.reason.length>=12);
    const proposal_id='p-00000000-0000-4000-a000-'+String(++proposalNumber).padStart(12,'0');
    mine=[{
      proposal_id,title:input.candidate.zones.at(-1).name,
      status:'pending',submitted_at:'2026-11-24T18:00:00.000Z',
      next_action:'Your suggestion is waiting for owner review. No action needed right now.'
    }];
    return respond({proposal_id,status:'pending',event_approved:false},201);
  }
  throw Error('Unexpected browser route '+url);
 };
 const win={location:{hash:withInvite?'#join='+grant:'',pathname:'/reignite/layout/',search:''},
  history:{replaceState(_a,_b,path){this.replacedWith=path}}};
 const doc={getElementById:node,body:fakeElement('body'),
  createElement:id=>fakeElement(id)};
 const original=app.replace(/^import \{ IDEAS, PLACES, createQuickSuggestion \} from '\.\/quick-idea\.mjs';\n/,'');
 assert.notEqual(original,app,'test must evaluate real browser code, not ignore import via fallback');
 const sandbox={document:doc,window:win,fetch:fetcher,IDEAS,PLACES,createQuickSuggestion,
   crypto:{randomUUID:()=> 'aabbccdd-0000-4000-8000-000000001234'},
   confirm:()=>true,console,URL,Blob,setTimeout};
 const ctx=createContext(sandbox);
 runInContext(original,ctx);
 return {node,ctx,routeCalls,win,submit:async()=>{
   const form=node('quickIdeaForm');
   await form.listeners.submit({preventDefault(){}});
 },get mine(){return mine}};
}
async function settled(h,predicate){
 for(let n=0;n<100;n++){
  if(predicate())return;
  await sleep(20);
 }
 throw Error('Browser client did not settle in regression test. Feedback: '+
   h.node('quickFeedback').textContent);
}

test('opening a one-tap link immediately enables idea submission, private status and no owner access',async()=>{
 const h=harness();
 await settled(h,()=>h.node('quickFeedback').textContent.includes('You are connected'));
 assert.equal(h.win.history.replacedWith,'/reignite/layout/');
 assert.equal(runInContext('state.token',h.ctx),null);
 assert.equal(runInContext('state.authMode',h.ctx),'cookie');
 assert.equal(runInContext('hasReviewAccess()',h.ctx),true);
 assert.equal(h.node('myIdeasPanel').hidden,false);
 assert.equal(h.node('ownerPanel').hidden,true);
 assert.equal(h.node('ownerReadinessPanel').hidden,true);
 await h.submit();
 assert.equal(h.routeCalls.filter(c=>c.url==='./api/proposals').length,1,
   'one-tap editors must actually submit rather than be forced to export JSON');
 assert.match(h.node('quickFeedback').textContent,/received for owner review/);
 assert.match(h.node('myIdeasList').innerHTML,/Coastal photo gallery/);
 assert.match(h.node('myIdeasList').innerHTML,/waiting for owner review/);
 assert.equal(h.node('quickExport').disabled,true);
 assert.equal(runInContext('state.quickPending',h.ctx),null);
});

test('returning to same one-tap session restores My Ideas and can submit again',async()=>{
 const h=harness({withInvite:false,withSession:true});
 await settled(h,()=>h.node('quickFeedback').textContent.includes('Welcome back'));
 assert.equal(runInContext('hasReviewAccess()',h.ctx),true);
 await h.submit();
 assert.equal(h.routeCalls.filter(c=>c.url==='./api/proposals').length,1);
 assert.match(h.node('myIdeasList').innerHTML,/Coastal photo gallery/);
 assert.equal(h.node('ownerReadinessPanel').hidden,true);
});

test('existing local preview can be submitted on a one-tap session without reopening advanced tools',async()=>{
 const h=harness();
 await settled(h,()=>h.node('quickFeedback').textContent.includes('You are connected'));
 const proposed=createQuickSuggestion(seed,{
  kind:'art',name:'Existing idea from this browser',
  place:'unsure',description:'A submission preserved after a contributor signs in.'
 },'zone-abcddcba12345678');
 runInContext('state.draft=preview.candidate; state.quickPending={id:preview.zone.id,reason:preview.reason}',Object.assign(h.ctx,{preview:proposed}));
 await h.submit();
 assert.equal(h.routeCalls.filter(c=>c.url==='./api/proposals').length,1);
 assert.match(h.node('myIdeasList').innerHTML,/Existing idea from this browser/);
});

test('without invitation, idea is a local preview, never silently submitted',async()=>{
 const h=harness({withInvite:false,withSession:false});
 await settled(h,()=>runInContext('state.base!==null',h.ctx));
 await h.submit();
 assert.equal(h.routeCalls.filter(c=>c.url==='./api/proposals').length,0);
 assert.equal(runInContext('hasReviewAccess()',h.ctx),false);
 assert.match(h.node('quickFeedback').textContent,/Nothing has been submitted yet/);
 assert.equal(h.node('quickExport').disabled,false);
 assert.equal(h.node('ownerPanel').hidden,true);
});

test('manual editor auth remains available and owner-only workflow stays protected',()=>{
 assert.match(app,/if\(state\.token\)headers\['x-reignite-key'\]/);
 assert.match(app,/if\(state\.authMode==='cookie'&&method!=='GET'\)headers\['x-reignite-csrf'\]/);
 assert.match(app,/if\(state\.role!=='owner'\)return/);
 assert.doesNotMatch(app,/if\(!state\.token\|\|!state\.role\)return/);
});
