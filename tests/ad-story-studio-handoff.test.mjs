import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {composeAdStoryCommercialIdea} from '../public/audience-sites/creative-studio/commission-handoff.mjs';
import {storeFallenIdea,takeFallenIdea} from '../public/studio-brief-handoff.mjs';

const input={
 brand:'A real local business',audience:'families preparing for the holidays',
 offer:'a seasonal promotion with approved imagery',cta:'visit our store',
 format:'Vertical 9:16, 15 seconds'
};
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function session(){
 const m=new Map();
 return {setItem:(k,v)=>m.set(k,String(v)),getItem:k=>m.has(k)?m.get(k):null,removeItem:k=>m.delete(k)};
}

test('an actual buyer can carry a bounded storyboard into the existing private inquiry exactly once',()=>{
 const result=composeAdStoryCommercialIdea(input);
 assert.equal(result.ok,true);
 assert.match(result.idea,/Business or campaign: A real local business/);
 assert.match(result.idea,/Audience: families preparing/);
 assert.match(result.idea,/30-second Fallen Studios commercial/);
 assert.match(result.idea,/Source footage, brand rights, actual claims, timing and delivery are for written review/);
 assert.doesNotMatch(result.idea,/payment confirmed|project accepted|video rendered/i);
 assert.ok(result.idea.length<=1800);
 const storage=session(),now=1800000000000;
 assert.deepEqual(storeFallenIdea(storage,result.idea,now),{ok:true});
 assert.equal(takeFallenIdea(storage,now+5000),result.idea);
 assert.equal(takeFallenIdea(storage,now+5001),null);
});

test('a buyer must supply meaningful details; malformed, large and unknown formats cannot transfer',()=>{
 assert.equal(composeAdStoryCommercialIdea(null).ok,false);
 for(const key of ['brand','audience','offer','cta']){
   assert.equal(composeAdStoryCommercialIdea({...input,[key]:''}).ok,false,key);
 }
 assert.equal(composeAdStoryCommercialIdea({...input,brand:'x'.repeat(121)}).ok,false);
 assert.equal(composeAdStoryCommercialIdea({...input,format:'Unknown 3D recording'}).ok,false);
 assert.equal(composeAdStoryCommercialIdea({...input,offer:null}).ok,false);
});

test('the planning tool offers only an explicit same-tab handoff, never a checkout or buyer POST',()=>{
 const page=read('public/audience-sites/creative-studio/index.html');
 const code=read('public/audience-sites/creative-studio/commission-handoff.mjs');
 const studio=read('public/commercial-studio/index.html');
 assert.match(page,/id="commission" hidden/);
 assert.match(page,/commission-status/);
 assert.match(page,/src="\.\/commission-handoff\.mjs"/);
 assert.match(code,/storeFallenIdea\(window\.sessionStorage,candidate\.idea\)/);
 assert.match(code,/window\.location\.assign\('\.\.\/\.\.\/commercial-studio\/#inquire'\)/);
 assert.match(code,/get\('run'\)|get\('run'\),status/);
 assert.doesNotMatch(code,/fetch\s*\(|localStorage|\.submit\(|buy\.stripe\.com|PaymentIntent/);
 assert.match(studio,/href="\.\.\/audience-sites\/creative-studio\/"/);
 assert.match(studio,/takeFallenIdea\(window\.sessionStorage\)/);
 assert.match(studio,/name="consent"[^>]*required/);
 assert.match(page,/No checkout, automatic submission or payment is available on this page/);
 assert.match(studio,/No payment or booking happens on this page/);
});

test('the cross-page target is on the same first-party Pages origin',()=>{
 const from='https://jgaethle10.github.io/forge-operator/audience-sites/creative-studio/';
 const target=new URL('../../commercial-studio/#inquire',from);
 assert.equal(target.href,'https://jgaethle10.github.io/forge-operator/commercial-studio/#inquire');
});
