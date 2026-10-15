import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_EVENTS, DEMO_MISSION, STAGES, frameAt, validateEventStream } from "../../public/visuals/mission-observatory/scene.mjs";

const mutate=(fn)=>DEMO_EVENTS.map(e=>({...e,parent_ids:[...e.parent_ids]})).map(fn);

test("the demonstration never claims real operations",()=>{
  assert.equal(DEMO_MISSION.mode,"SYNTHETIC_REPLAY");
  assert.ok(/No real file transfer/.test(DEMO_MISSION.safety_note));
  assert.equal(validateEventStream(DEMO_EVENTS,{syntheticOnly:true}),true);
  assert.ok(DEMO_EVENTS.every(e=>e.evidence_state==="synthetic"));
  assert.equal(STAGES.length,6);
});
test("mission replay is ordered, deterministic, and connected",()=>{
  assert.equal(frameAt(0).visible.length,0);
  assert.equal(frameAt(28).visible.length,DEMO_EVENTS.length);
  assert.equal(frameAt(28).gates,3);
  assert.ok(frameAt(28).links>DEMO_EVENTS.length-2);
  assert.equal(frameAt(11).stage.id,"plan");
  assert.deepEqual(frameAt(9),frameAt(9));
  assert.equal(frameAt(-8).visible.length,0);
});
test("fails closed on duplicates, missing source and unsupported evidence",()=>{
  assert.throws(()=>validateEventStream(mutate((e,i)=>i===1?{...e,id:"ev-01"}:e)),/Duplicate event ID/);
  assert.throws(()=>validateEventStream(mutate((e,i)=>i===1?{...e,source_ref:""}:e)),/Missing source/);
  assert.throws(()=>validateEventStream(mutate((e,i)=>i===1?{...e,evidence_state:"verified"}:e)),/Unknown evidence state/);
  assert.throws(()=>validateEventStream(mutate((e,i)=>i===1?{...e,evidence_state:"observed"}:e),{syntheticOnly:true}),/Synthetic replay/);
  assert.throws(()=>validateEventStream(mutate((e,i)=>i===1?{...e,seconds:999}:e)),/Unsorted event time/);
  assert.throws(()=>validateEventStream(mutate((e,i)=>i===1?{...e,parent_ids:["ev-11"]}:e)),/Invalid parent order/);
});
test("receipted evidence requires cryptographic or HTTPS locator",()=>{
  assert.throws(()=>validateEventStream(mutate((e,i)=>i===1?{...e,evidence_state:"receipted"}:e)),/verifiable evidence reference/);
  const sample=mutate((e,i)=>i===1?{...e,evidence_state:"receipted",source_ref:"https://example.org/receipt/1"}:e);
  assert.equal(validateEventStream(sample),true);
});


test("HTML module parses and preserves visible demo disclosure",async()=>{
  const { readFileSync } = await import("node:fs");
  const markup=readFileSync(new URL("../../public/visuals/mission-observatory/index.html",import.meta.url),"utf8");
  assert.match(markup,/<canvas id="universe"/);
  assert.match(markup,/SYNTHETIC REPLAY/);
  assert.match(markup,/NO LIVE AGENTS, TRANSFERS OR PAYMENTS/);
  assert.match(markup,/aria-label="Mission replay position"/);
  const match=markup.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match,"inline module must exist");
  const script=match[1].split("\n").filter(line=>!line.trim().startsWith("import ")).join("\n");
  assert.doesNotThrow(()=>new Function(script),"browser script must parse");
});
