import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { registerFallenFamilyRoutes } from './family-http.js';

async function withServer(run: (origin: string) => Promise<void>) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  registerFallenFamilyRoutes(app, {
    ai: {
      interactions: {
        create: async () => {
          throw new Error('provider should not be called in this test');
        },
      },
      models: {
        generateVideos: async () => {
          throw new Error('provider should not be called in this test');
        },
      },
      operations: {},
      files: {},
    },
    Type: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      ARRAY: 'ARRAY',
      INTEGER: 'INTEGER',
    },
    generateContentWithFallback: async () => {
      throw new Error('story provider intentionally unavailable');
    },
    parseGeminiError: (error: any) => ({
      statusCode: 503,
      statusText: 'UNAVAILABLE',
      userMessage: error?.message || 'unavailable',
    }),
    rateLimit: () => (_req, _res, next) => next(),
  });

  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test port.');
    await run('http://127.0.0.1:' + String(address.port));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('family quickstart builds a valid episode even when the story provider is unavailable', async () => {
  await withServer(async (origin) => {
    const response = await fetch(origin + '/api/fallen/family/episode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        seriesTitle: 'The Family Show',
        episodeTitle: 'The Blanket Fort',
        premise: 'The family builds an enormous blanket fort and the dog keeps stealing the pillows.',
        style: 'Warm 2D storybook cartoon',
        characters: [
          {
            id: 'mom',
            name: 'Mom',
            role: 'Parent',
            description: 'Warm, funny, quick thinker.',
          },
          {
            id: 'kid',
            name: 'Kid',
            role: 'Kid',
            description: 'Curious and energetic.',
          },
        ],
      }),
    });

    const payload: any = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.data.story.scenes.length, 6);
    assert.equal(payload.data.bible.schema, 'evercraft.fallen.series-bible.v1');
    assert.equal(payload.data.seriesPlan.schema, 'evercraft.fallen.series-plan.v1');
    assert.equal(payload.data.seriesPlan.continuity.status, 'pass');
    assert.equal(payload.data.seriesPlan.canonReceipt.length, 64);
    assert.ok(payload.data.seriesPlan.productionNeeds.length >= 1);
    assert.equal(payload.data.provider.story, 'deterministic-fallback');
  });
});

test('reference imagery fails closed without explicit provider consent', async () => {
  await withServer(async (origin) => {
    const response = await fetch(origin + '/api/fallen/family/character-sheet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        consent: false,
        characters: [
          {
            id: 'mom',
            name: 'Mom',
            photoDataUrl: 'data:image/jpeg;base64,YQ==',
          },
        ],
      }),
    });

    const payload: any = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.success, false);
    assert.match(payload.error, /consent/i);
  });
});


test('family episode can enter the Toon Megazord without provider calls or unearned render claims',async()=>{
  await withServer(async(origin)=>{
    const result=await fetch(origin+'/api/fallen/family/episode',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        seriesTitle:'The Lantern Family',episodeTitle:'One Bright Night',
        premise:'The family finds a mysterious glowing lamp in the living room.',
        style:'Warm 2D storybook cartoon',
        characters:[
          {id:'parent',name:'Parent',role:'Parent',description:'Steady, curious'},
          {id:'child',name:'Child',role:'Child',description:'Energetic and playful'},
        ]
      })
    });
    assert.equal(result.status,200);
    const {data}=await result.json();
    assert.ok(data.bible.entities.some((x:any)=>x.id==='family-story-world'&&x.kind==='location'));
    const visuals=data.seriesPlan.productionNeeds.filter((x:any)=>x.kind==='video');
    assert.ok(visuals.length>0,'family episode should have video needs');
    const visible=data.bible.entities.filter((x:any)=>x.kind==='character').map((entity:any)=>({
      entityId:entity.id,
      acting:{
        objective:'Understand the glowing lamp and respond to the family',
        physicalAction:'Move toward the lamp with grounded, deliberate steps',
        face:'React with restrained surprise and believable expression',
        gazeTarget:'The lamp or the speaking family member',
        hands:'Keep hand anatomy and gesture scale stable throughout the shot',
      }
    }));
    const shots=visuals.map((need:any,i:number)=>({
      id:'family-toon-'+String(i+1),
      visualNeedId:need.id,durationSec:need.durationSec,
      locationId:'family-story-world',
      action:'Show a believable family discovery through motivated action',
      soundDirection:'Protect dialogue intelligibility with an original restrained score',
      characters:visible,
      dialogueCueIds:i===0?data.seriesPlan.dialogue.map((x:any)=>x.id):[],
    }));
    const post=async(entries:any[])=>fetch(origin+'/api/fallen/family/toon-handoff',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({bible:data.bible,seriesPlan:data.seriesPlan,shots:entries,fps:24})
    });
    const response=await post(shots);
    const payload=await response.json();
    assert.equal(response.status,200,JSON.stringify(payload));
    assert.equal(payload.success,true);
    assert.equal(payload.data.handoff.shots.length,visuals.length);
    assert.equal(payload.data.handoff.deliveryReady,false);
    assert.equal(payload.data.handoff.boundaries.providerCallsPerformed,false);
    assert.equal(payload.data.handoff.shots[0].characters.length,2);
    assert.ok(payload.data.handoff.shots[0].qualityGates.includes('character_face_and_hand_anatomy'));
    const broken=structuredClone(shots);
    delete broken[0].characters[0].acting.hands;
    const failed=await post(broken);
    assert.equal(failed.status,422);
    assert.match((await failed.json()).error,/direction_missing/);
  });
});

test('incomplete toon shot direction cannot trigger paid keyframe or pilot video generation',async()=>{
  await withServer(async origin=>{
    for(const endpoint of ['scene-image','video/start']){
      const response=await fetch(origin+'/api/fallen/family/'+endpoint,{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({
          consent:true,scene:{title:'Cautious wave',action:'Wave'},
          imageDataUrl:'data:image/png;base64,YQ==',
          toonHandoff:{schema:'forged'},toonShotId:'shot-1',
        }),
      });
      assert.equal(response.status,422,endpoint);
      const payload=await response.json();
      assert.equal(payload.success,false);
      assert.match(payload.error,/toon_handoff_packet_schema/);
    }
  });
});
