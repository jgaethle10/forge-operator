import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHouse,advanceHouse,removeFurniture,validateHouse} from '../public/living-worlds/house-core.mjs';
import {PROPOSAL_SCHEMA,decisionContext,proposalMessages,parseProposal,parseProposalFromContext,
  validateDecisionContext,applyProposal} from '../public/living-worlds/agent-proposals.mjs';
import {createHousePreview,invokeLocalModel} from '../systemia/living-worlds/local-llm-preview.mjs';

const choose=(target_id='f6')=>JSON.stringify({action:'use_object',target_id,reason:'I want to make progress.'});
const wait=()=>JSON.stringify({action:'wait',target_id:null,reason:'I need a moment to think.'});

test('model context excludes free-form memories and has an exact bounded object inventory',()=>{
  const house=makeHouse(818);
  const context=decisionContext(house,'sable');
  assert.equal(context.schema,PROPOSAL_SCHEMA);
  assert.equal(context.available_objects.length,6);
  assert.equal(context.resident.id,'sable');
  assert.ok(validateDecisionContext(context));
  assert.equal(JSON.stringify(context).includes('memories'),false);
  assert.equal(proposalMessages(context).length,2);
  assert.throws(()=>decisionContext(house,'ghost'));
  assert.equal(validateDecisionContext({...context,available_objects:[null]}),false);
});

test('model selects an actual object through the rules engine, not arbitrary tool execution',()=>{
  const house=makeHouse();
  const proposal=parseProposal(house,'sable',choose('f6'));
  assert.equal(proposal.schema,PROPOSAL_SCHEMA);
  assert.equal(proposal.origin_tick,0);
  assert.equal(applyProposal(house,proposal),true);
  assert.equal(house.actors.find(a=>a.id==='sable').target,'f6');
  assert.equal(house.events[0].type,'model_choice');
  advanceHouse(house);
  assert.ok(validateHouse(house));
});

test('wait is bounded to one tick, and does not override the deterministic engine thereafter',()=>{
  const house=makeHouse();
  const proposal=parseProposal(house,'jun',wait());
  assert.equal(applyProposal(house,proposal),true);
  advanceHouse(house);
  const actor=house.actors.find(a=>a.id==='jun');
  assert.equal(actor.action,'Taking time to think');
  advanceHouse(house);
  assert.notEqual(actor.action,'Taking time to think');
});

test('unknown objects, invented actions, control characters, extra fields and stale snapshots fail closed',()=>{
  const house=makeHouse();
  assert.throws(()=>parseProposal(house,'mara',choose('f9999')));
  assert.throws(()=>parseProposal(house,'mara','{"action":"run_shell","target_id":null,"reason":"do it"}'));
  assert.throws(()=>parseProposal(house,'mara','{"action":"wait","target_id":null,"reason":"ok","extra":"tool"}'));
  assert.throws(()=>parseProposal(house,'mara','{"action":"wait","target_id":"f1","reason":"hello"}'));
  assert.throws(()=>parseProposal(house,'mara','wrapper:'+wait()));
  assert.throws(()=>parseProposal(house,'mara',JSON.stringify({action:'wait',target_id:null,reason:'bad\ncontrol'})));
  const p=parseProposal(house,'mara',choose('f1'));
  advanceHouse(house);
  assert.equal(applyProposal(house,p),false);
  assert.equal(removeFurniture(house,1,1),true);
  assert.equal(applyProposal(house,{...p,origin_tick:house.tick}),false);
});

test('server-side parse independently validates model output from local context',()=>{
  const ctx=decisionContext(makeHouse(),'ivo');
  const p=parseProposalFromContext(ctx,choose('f4'));
  assert.equal(p.actor_id,'ivo');
  assert.equal(p.target_id,'f4');
  assert.throws(()=>parseProposalFromContext({...ctx,available_objects:[]},choose('f4')));
});

test('local inference adapter only calls fixed loopback llama-server and never lets the model run tools',async()=>{
  const ctx=decisionContext(makeHouse(),'mara');
  let calls=0;
  const output=await invokeLocalModel(ctx,{modelPort:8080,fetcher:async(url,options)=>{
    calls++;
    assert.equal(url,'http://127.0.0.1:8080/v1/chat/completions');
    assert.equal(options.method,'POST');
    const request=JSON.parse(options.body);
    assert.equal(request.stream,false);
    assert.equal(request.tools,undefined);
    assert.equal(request.messages.length,2);
    return new Response(JSON.stringify({choices:[{message:{content:choose('f2')}}]}),{status:200,headers:{'content-type':'application/json'}});
  }});
  assert.equal(calls,1);
  assert.equal(JSON.parse(output).target_id,'f2');
});

test('owned preview serves local app and validates same-origin model requests',async(t)=>{
  const server=createHousePreview({inference:async()=>choose('f6')});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  assert.equal(server.address().address,'127.0.0.1');
  const origin='http://127.0.0.1:'+server.address().port;
  const page=await fetch(origin+'/living-worlds/');
  assert.equal(page.status,200);
  assert.match(await page.text(),/House 001/);
  const context=decisionContext(makeHouse(),'sable');
  const post=(body,headers={})=>fetch(origin+'/living-worlds/api/propose',{method:'POST',
    headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  const allowed=await post({context},{origin});
  assert.equal(allowed.status,200);
  const result=await allowed.json();
  assert.equal(result.source,'local_llm');
  assert.equal(result.proposal.target_id,'f6');
  const evil=await post({context},{origin:'http://evil.example'});
  assert.equal(evil.status,403);
  const nonsense=await post({context:{schema:'nope'}},{origin});
  assert.equal(nonsense.status,400);
  const traversal=await fetch(origin+'/living-worlds/%2e%2e/server.mjs');
  assert.equal(traversal.status,404);
});
