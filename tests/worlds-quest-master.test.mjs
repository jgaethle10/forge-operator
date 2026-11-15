import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorld} from '../public/worlds/world-core.mjs';
import {
  QUEST_SCHEMA,QUEST_RECEIPT_SCHEMA,
  draftQuest,previewQuest,executeQuest,validateQuestProposal,describeQuestStep
} from '../public/worlds/quest-master.mjs';

test('authored game master produces three bounded quest themes', () => {
  const world=initialWorld();
  assert.equal(draftQuest(world,'flowers please').title,'The Lantern Bloom');
  assert.equal(draftQuest(world,'build a workshop').narrator,'Momo');
  assert.equal(draftQuest(world,'stargazing at night').narrator,'Lumi');
  assert.equal(draftQuest(world,'').schema,QUEST_SCHEMA);
  assert.throws(()=>draftQuest(world,'x'.repeat(121)),/quest_request_invalid/);
});
test('preview does not change original world, including inhabitants', () => {
  const world=initialWorld(),original=structuredClone(world),quest=draftQuest(world);
  const preview=previewQuest(world,quest);
  assert.deepEqual(world,original);
  assert.equal(preview.steps.length,2);
  assert.equal(preview.world.objects.length,1);
  assert.equal(preview.world.sky,'sunset');
  assert.equal(preview.world.agents[0].memories.length,0);
});
test('player approves proposal at a specific revision and receives verifiable change receipt', () => {
  const world=initialWorld(),quest=draftQuest(world,'night sky');
  assert.throws(()=>executeQuest(world,quest,{expectedRevision:world.revision}),/quest_approval_required/);
  assert.throws(()=>executeQuest(world,quest,{authorized:true,expectedRevision:999}),/quest_world_version_conflict/);
  const {world:changed,receipt}=executeQuest(world,quest,{authorized:true,expectedRevision:world.revision});
  assert.equal(world.objects.length,0);
  assert.equal(changed.objects.length,1);
  assert.equal(changed.sky,'night');
  assert.equal(changed.revision,world.revision+2);
  assert.equal(receipt.schema,QUEST_RECEIPT_SCHEMA);
  assert.equal(receipt.from_revision,world.revision);
  assert.equal(receipt.to_revision,changed.revision);
  assert.equal(receipt.actions.length,2);
  assert.equal(receipt.status,'applied_to_local_scene_only');
});
test('malformed and unsupported model proposals are refused before mutation', () => {
  const world=initialWorld(),valid=draftQuest(world);
  const malicious=[
    {...valid,steps:[{type:'shell',command:'rm -rf /'}]},
    {...valid,steps:[{type:'place',kind:'chest',x:0,z:0}]},
    {...valid,steps:[{type:'place',kind:'flower',x:300,z:0}]},
    {...valid,steps:[{type:'sky',value:'eclipse'}]},
    {...valid,steps:[{type:'sky',value:'night',extra:'secret'}]},
    {...valid,steps:[{type:'place',kind:'flower',x:0,z:0,account:'admin'}]},
    {...valid,steps:[]},
    {...valid,steps:[...valid.steps,...valid.steps]},
    {...valid,title:'\n<script>alert(1)</script>'}
  ];
  for(const proposal of malicious){
    assert.throws(()=>validateQuestProposal(proposal));
    assert.throws(()=>previewQuest(world,proposal));
  }
  assert.equal(world.objects.length,0);
});
test('quest cannot exceed shareable scene capacity', () => {
  const world=initialWorld();
  world.objects=Array.from({length:40},(_,i)=>({id:'made-'+(i+1),kind:'flower',x:i%10,z:Math.floor(i/10)}));
  assert.throws(()=>previewQuest(world,draftQuest(world,'garden')),/quest_scene_capacity_reached/);
});
test('render labels are plain text, not commands or HTML',()=>{
  assert.equal(describeQuestStep({type:'place',kind:'flower',x:4,z:2}),'Place flower at 4, 2');
  assert.equal(describeQuestStep({type:'sky',value:'sunset'}),'Set sky to sunset');
});
