import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {FALLEN_IDEA_KEY,FALLEN_IDEA_MAX_LENGTH,storeFallenIdea,takeFallenIdea} from "../public/studio-brief-handoff.mjs";

function tabStorage() {
  const values=new Map();
  return {
    setItem:(k,v)=>values.set(k,String(v)),
    getItem:k=>values.has(k)?values.get(k):null,
    removeItem:k=>values.delete(k)
  };
}

const idea="Make a warm 30-second social commercial introducing our neighborhood roofing company.";
test("one-prompt handoff preserves the visitor's creative idea once and only within the tab",()=>{
  const tab=tabStorage(),now=1730000000000;
  assert.deepEqual(storeFallenIdea(tab,"  "+idea+"  ",now),{ok:true});
  assert.equal(takeFallenIdea(tab,now+1000),idea);
  assert.equal(tab.getItem(FALLEN_IDEA_KEY),null);
  assert.equal(takeFallenIdea(tab,now+1001),null);
});
test("invalid, oversized, stale, corrupt, or future-dated prompts never prefill an inquiry",()=>{
  const tab=tabStorage(),now=1730000000000;
  assert.equal(storeFallenIdea(tab,"hello",now).ok,false);
  assert.equal(storeFallenIdea(tab,"x".repeat(FALLEN_IDEA_MAX_LENGTH+1),now).ok,false);
  assert.equal(tab.getItem(FALLEN_IDEA_KEY),null);
  storeFallenIdea(tab,idea,now);
  assert.equal(takeFallenIdea(tab,now+31*60*1000),null);
  tab.setItem(FALLEN_IDEA_KEY,"not json");
  assert.equal(takeFallenIdea(tab,now),null);
  tab.setItem(FALLEN_IDEA_KEY,JSON.stringify({idea,createdAt:now+1}));
  assert.equal(takeFallenIdea(tab,now),null);
});
test("front door transfers a brief to existing consented intake, without checkout or an auto-render claim",()=>{
  const front=readFileSync(new URL("../public/fallen-studios/index.html",import.meta.url),"utf8");
  const intake=readFileSync(new URL("../public/commercial-studio/index.html",import.meta.url),"utf8");
  assert.match(front,/id="fallen-idea"/);
  assert.match(front,/id="fallen-start"/);
  assert.match(front,/storeFallenIdea/);
  assert.match(front,/sessionStorage/);
  assert.match(front,/\.\.\/commercial-studio\/#inquire/);
  assert.match(intake,/takeFallenIdea/);
  assert.match(intake,/id="fallen-transfer-status"/);
  assert.match(intake,/goal\.value=idea/);
  assert.match(intake,/name="consent"[^>]+required/);
  assert.doesNotMatch(front,/<form\b|fetch\(|localStorage|buy\.stripe\.com|paymentIntent/);
  assert.doesNotMatch(front,/automatically (render|deliver)|your video is ready/i);
});
