import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {buildSpaceDudzCampaign,normalizeSpaceDudzCampaign,renderSpaceDudzDesign,renderSpaceDudzVoteCard} from './space-dudz-design-factory.mjs';

const campaign={
  schema:'evercraft.space-dudz.graphics-campaign.v1',
  id:'space-dudz-orbit-one-20261007',
  slug:'orbit-one-community-cut',
  pollId:'orbit_one_vote_20261007',
  candidates:[
    {id:'moon-motel',label:'A',name:'Moon Motel',concept:'moon_motel',tagline:'Vacancy in orbit',microcopy:'Check in weird'},
    {id:'signal-lost',label:'B',name:'Signal Lost Club',concept:'signal_lost',tagline:'Transmission 404',microcopy:'Stay receiving'},
    {id:'orbital-service',label:'C',name:'Orbital Service Co.',concept:'orbital_service',tagline:'Tune ups · recovery · bad ideas',microcopy:'Earth side'},
  ],
};

test('normalizes a repeatable Space Dudz Graphics Command campaign',()=>{
  const result=normalizeSpaceDudzCampaign(campaign);
  assert.equal(result.creativeSystem,'evercraft_graphics_command');
  assert.equal(result.candidates.length,3);
  assert.equal(result.boundaries.publicationAuthority,false);
  assert.equal(result.boundaries.preorderRequiredBeforePrint,true);
});

test('renders deterministic vector design and social vote card',()=>{
  const normalized=normalizeSpaceDudzCampaign(campaign);
  const a=renderSpaceDudzDesign(normalized,normalized.candidates[0]);
  const b=renderSpaceDudzDesign(normalized,normalized.candidates[0]);
  assert.equal(a,b);
  assert.match(a,/MOON MOTEL/);
  assert.match(renderSpaceDudzVoteCard(normalized,normalized.candidates[0]),/PICK THE ONE YOU'D ACTUALLY WEAR/);
});

test('build emits designs, social formats and Clip handoff without publication authority',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'space-dudz-graphics-'));
  const built=buildSpaceDudzCampaign(campaign,{outputRoot:root,origin:'https://example.test/space-dudz'});
  assert.equal(built.manifest.clipHandoff.publicationAuthority,false);
  for(const id of ['moon-motel','signal-lost','orbital-service']){
    assert.equal(fs.existsSync(path.join(built.dir,id+'.svg')),true);
    assert.equal(fs.existsSync(path.join(built.dir,id+'-vote-feed.svg')),true);
    assert.equal(fs.existsSync(path.join(built.dir,id+'-vote-story.svg')),true);
  }
});
