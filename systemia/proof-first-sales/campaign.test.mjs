import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { admitProofFirstOutreach } from './engine.mjs';

const campaign=JSON.parse(fs.readFileSync(new URL('./campaigns/yakima-hvac-2026-10.json',import.meta.url),'utf8'));
const now=new Date('2026-10-07T04:46:00Z');

test('current Yakima HVAC campaign is held from repetitive same-night outreach',()=>{
  const states=campaign.targets.map((target)=>admitProofFirstOutreach({
    ...target,
    cooldown_hours:campaign.policy.cooldown_hours,
    max_unanswered_outbound:campaign.policy.max_unanswered_outbound,
  },now));

  assert.equal(states.length,8);
  assert.equal(states.filter((x)=>x.admitted).length,0);

  const firstWave=states.slice(0,4);
  assert.ok(firstWave.every((x)=>x.state==='waiting_reply'));
  assert.ok(firstWave.every((x)=>x.reason==='unanswered_outbound_limit_reached'));

  const proofFirstWave=states.slice(4);
  assert.ok(proofFirstWave.every((x)=>x.state==='cooldown'));
  assert.ok(proofFirstWave.every((x)=>x.reason==='outbound_cooldown_active'));
});
