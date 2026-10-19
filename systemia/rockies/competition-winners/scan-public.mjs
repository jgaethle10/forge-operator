#!/usr/bin/env node
import fs from 'node:fs';
import {trackedRepositories,fetchPublicGithubSnapshot,compareSnapshots,winnerMetadataObservation,winnerResearchQueue} from './competition-winner-rocky.mjs';

const root=new URL('./',import.meta.url);
function load(file) { const data=fs.readFileSync(file,'utf8'); if (data.length>2_000_000)throw new Error('input_too_large');return JSON.parse(data); }
const universe=load(new URL('universe.json',root));
const args=process.argv.slice(2);
if (args.length>2||(args.length===2&&args[0]!=='--previous')) throw new Error('usage: node scan-public.mjs [--previous <local-snapshot.json>]');
const previous=args.length===2?load(args[1]):null;
if(previous&&previous.schema!=='evercraft.rockies.competition-scan.v1')throw new Error('prior_scan_schema_invalid');
const priorMap=new Map((previous?.snapshots||[]).map(x=>[x.project_id,x]));
const observed_at=new Date().toISOString();
const snapshots=[],changes=[],observations=[],holds=[];
for(const item of trackedRepositories(universe)) {
  const project=universe.events.flatMap(x=>x.projects).find(p=>p.project_id===item.project_id);
  try {
    const snap=await fetchPublicGithubSnapshot(project,{observedAt:observed_at});
    snapshots.push(snap);
    const comparison=compareSnapshots(priorMap.get(snap.project_id)||null,snap);
    if(!comparison.quiet)changes.push({project_id:snap.project_id,repo:snap.repo,material_changes:comparison.material_changes});
    observations.push(winnerMetadataObservation({competition_id:item.competition_id,project,current:snap,comparison}));
  } catch (error) {
    holds.push({project_id:item.project_id,repo:item.repo,reason:String(error.message).slice(0,120),evidence_state:'unavailable_no_observation'});
  }
}
for(const item of winnerResearchQueue(universe,snapshots)) {
 if(item.status==='needs_source_attribution') holds.push({project_id:item.project_id,reason:'project_source_not_verified',evidence_state:'held'});
}
const batch={
 schema:'evercraft.rockies.competition-scan.v1',observed_at,mode:'PUBLIC_READ_ONLY',
 winner_targets:universe.events.reduce((n,e)=>n+e.projects.length,0),future_event_feeds:universe.future_events.length,
 repository_snapshots:snapshots.length,material_change_count:changes.length,
 snapshots,changes,observations,holds,
 release_authorized:false,systemia_ingest_performed:false,external_contacts_sent:0,
 note:'Repository metadata is public source observation, not proof of functionality, sponsorship or official winner status.'
};
process.stdout.write(JSON.stringify(batch,null,2)+'\n');
