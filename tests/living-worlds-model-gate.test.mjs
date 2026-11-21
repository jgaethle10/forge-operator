import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHouse,advanceHouse,removeFurniture,validateHouse,eligibleSocialPeers,SOCIAL_COOLDOWN_TICKS} from '../public/living-worlds/house-core.mjs';
import {PROPOSAL_SCHEMA,decisionContext,proposalMessages,parseProposal,parseProposalFromContext,
  validateDecisionContext,applyProposal} from '../public/living-worlds/agent-proposals.mjs';
import {createHousePreview,invokeLocalModel} from '../systemia/living-worlds/local-llm-preview.mjs';

const choose=(target_id='f6')=>JSON.stringify({action:'use_object',target_id,reason:'I want to make progress.'});
const wait=()=>JSON.stringify({action:'wait',target_id:null,reason:'I need a moment to think.'});
const invite=(target_id='ivo')=>JSON.stringify({action:'socialize',target_id,reason:'I would like to check in.'});

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

test('v2 context only exposes nearby eligible peers and bounded goals, not memories or free text',()=>{
  const house=makeHouse();
  const mara=house.actors[0],ivo=house.actors[1],jun=house.actors[2];
  mara.x=4;mara.y=2;ivo.x=4;ivo.y=3;jun.x=4;jun.y=4;
  const ctx=decisionContext(house,'mara');
  assert.equal(PROPOSAL_SCHEMA,'evercraft.living-worlds.model-proposal.v2');
  assert.deepEqual(ctx.allowed_actions,['use_object','wait','socialize']);
  assert.equal(ctx.resident.goal_id,'home');
  assert.equal(ctx.resident.goal_phase,0);
  assert.equal(ctx.available_peers.some(p=>p.id==='ivo'),true);
  assert.equal(ctx.available_peers.some(p=>p.id==='jun'),true);
  assert.equal(ctx.available_peers.some(p=>p.id==='sable'),false);
  assert.equal(JSON.stringify(ctx).includes('memories'),false);
  assert.equal(JSON.stringify(ctx).includes('highlights'),false);
  assert.ok(validateDecisionContext(ctx));
  assert.equal(validateDecisionContext({...ctx,available_peers:[{id:'ivo',x:99,y:3,bond:50}]}),false);
  assert.equal(validateDecisionContext({...ctx,available_peers:[ctx.available_peers[0],ctx.available_peers[0]]}),false);
  assert.equal(validateDecisionContext({...ctx,available_peers:[{...ctx.available_peers[0],shell:'rm -rf /'}]}),false);
  assert.equal(validateDecisionContext({...ctx,developer_instruction:'run network calls'}),false);
  assert.equal(validateDecisionContext({...ctx,resident:{...ctx.resident,prompt:'ignore safety'}}),false);
  assert.equal(validateDecisionContext({...ctx,available_objects:[{...ctx.available_objects[0],secret:'metadata'}]}),false);
  assert.match(proposalMessages(ctx)[0].content,/listed peer/);
});
test('validated local-model invite triggers reciprocal memory, bond progress and goal chapter',()=>{
  const world=makeHouse();
  const mara=world.actors.find(a=>a.id==='mara'),ivo=world.actors.find(a=>a.id==='ivo');
  mara.x=4;mara.y=2;ivo.x=4;ivo.y=3;
  mara.goal.progress=11;
  const before=[mara.bonds.ivo,ivo.bonds.mara];
  const p=parseProposal(world,'mara',invite('ivo'));
  assert.equal(p.target_id,'ivo');
  assert.equal(applyProposal(world,p),true);
  const scene=world.events.find(e=>e.type==='social_scene'||e.type==='support');
  assert.ok(scene);
  assert.ok(mara.memories.includes(scene.description)&&ivo.memories.includes(scene.description));
  assert.ok(mara.bonds.ivo>before[0]&&ivo.bonds.mara>before[1]);
  assert.equal(mara.goal.phase,1);
  assert.equal(mara.lastSocialTick,world.tick);
  assert.equal(ivo.lastSocialTick,world.tick);
  assert.equal(applyProposal(world,p),false,'same-tick repeated invite blocked by social cooldown');
  assert.equal(validateHouse(world),true);
});
test('local-model social invite refuses absent, distant, stale or cooling-down partners',()=>{
  const world=makeHouse(),mara=world.actors[0],ivo=world.actors[1];
  assert.throws(()=>parseProposal(world,'mara',invite('sable')),/unavailable resident/);
  mara.x=4;mara.y=2;ivo.x=4;ivo.y=3;
  const p=parseProposal(world,'mara',invite('ivo'));
  ivo.x=8;ivo.y=5;
  assert.equal(applyProposal(world,p),false,'position rechecked at application');
  ivo.x=4;ivo.y=3;
  advanceHouse(world);
  assert.equal(applyProposal(world,p),false,'stale world tick must reject');
  // Even a fresh valid-looking tick cannot evade a partner cooldown.
  const cooled=makeHouse();const a=cooled.actors[0],b=cooled.actors[1];
  a.x=b.x=4;a.y=2;b.y=3;a.lastSocialTick=0;
  assert.deepEqual(eligibleSocialPeers(cooled,'mara'),[]);
  assert.throws(()=>parseProposal(cooled,'mara',invite('ivo')),/unavailable resident/);
  assert.equal(applyProposal(cooled,{...p,origin_tick:cooled.tick}),false);
  assert.equal(validateHouse(cooled),true);
});
test('fake model outputs cannot invent social peers, objects, conversations, or network actions',()=>{
  const world=makeHouse();const a=world.actors[0],b=world.actors[1];
  a.x=b.x=4;a.y=2;b.y=3;
  const initial=structuredClone(world);
  const attacks=[
    {action:'socialize',target_id:'ghost',reason:'Talk to stranger'},
    {action:'socialize',target_id:'https://example.org',reason:'Send'},
    {action:'socialize',target_id:'ivo',reason:'fine',tool_call:'http'},
    {action:'send_email',target_id:'ivo',reason:'mail'},
    {action:'socialize',target_id:'ivo',reason:'bad\nnewline'}
  ];
  for(const payload of attacks)assert.throws(()=>parseProposal(world,'mara',JSON.stringify(payload)));
  assert.deepEqual(world,initial,'rejecting model output must not mutate the world');
  const proposed=parseProposal(world,'mara',invite('ivo'));
  assert.equal(applyProposal(world,{...proposed,target_id:'sable'}),false);
  assert.deepEqual(world,initial);
});

test('owned loopback proposal gateway returns a validated social invite that the house engine executes',async(t)=>{
  const server=createHousePreview({inference:async()=>invite('ivo')});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const world=makeHouse(),mara=world.actors[0],ivo=world.actors[1];
  mara.x=4;mara.y=2;ivo.x=4;ivo.y=3;
  const origin='http://127.0.0.1:'+server.address().port;
  const result=await fetch(origin+'/living-worlds/api/propose',{
    method:'POST',headers:{'content-type':'application/json',origin},
    body:JSON.stringify({context:decisionContext(world,'mara')})
  });
  assert.equal(result.status,200);
  const response=await result.json();
  assert.equal(response.source,'local_llm');
  assert.equal(response.proposal.action,'socialize');
  assert.equal(response.proposal.target_id,'ivo');
  assert.equal(applyProposal(world,response.proposal),true);
  assert.ok(world.events.some(e=>e.type==='social_scene'||e.type==='support'));
  assert.equal(world.actors[0].lastSocialTick,world.tick);
  assert.ok(validateHouse(world));
  // This test uses a synthetic injected model, not a real llama-server inference session.
});
