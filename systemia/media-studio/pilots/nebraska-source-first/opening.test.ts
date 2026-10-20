import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { compileStudioDraft } from '../../studio-create.js';
import { buildTimelineExportPlan } from '../../timeline-export.js';
import type { StudioDraftPlan } from '../../studio-create.js';
const input=JSON.parse(fs.readFileSync(new URL('./opening.plan.json',import.meta.url),'utf8')) as StudioDraftPlan;
test('Nebraska compiles an editable 22.5s project without manufacturing production-ready assets',()=>{
 const bundle=compileStudioDraft(input);
 const shots=bundle.project.tracks.find(track=>track.kind==='video')?.clips??[];
 assert.equal(bundle.project.fps,24);
 assert.equal(shots.length,6);
 assert.equal(shots.at(-1)!.startSec+shots.at(-1)!.durationSec,22.5);
 assert.ok(bundle.productionNeeds.length>=8);
 assert.equal(input.music,undefined,'No auto-scored dramatic bed before source footage is reviewed');
 assert.equal(bundle.productionNeeds.some(need=>need.kind==='music'),false);
 assert.ok(bundle.project.assets.every(asset=>asset.path.startsWith('pending://')));
 assert.equal(bundle.boundaries.publicationAuthorityGranted,false);
 assert.equal(bundle.boundaries.paidGenerationAuthorityGranted,false);
 assert.equal(bundle.boundaries.generatedVisualsRequireTournament,true);
 assert.throws(()=>buildTimelineExportPlan({project:bundle.project,outputPath:'/tmp/nebraska.mp4'}),/timeline_export_pending_asset/);
});
test('2026 game scenes are held for authentic licensing and original dated source',()=>{
 for(const id of ['physicality','late-leads']){
  const scene=input.scenes.find(s=>s.id===id)!;
  assert.equal(scene.visual.assetId,undefined);
  assert.ok(scene.visual.prompt?.includes('Authentic'));
  assert.ok(scene.visual.sourceRefs.includes('game-film-license:needed'));
  assert.ok(scene.visual.sourceRefs.some(ref=>ref.includes('huskers.com/news/2026')));
 }
});