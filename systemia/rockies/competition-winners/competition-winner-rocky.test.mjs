import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateWinnerUniverse, trackedRepositories, fetchPublicGithubSnapshot, compareSnapshots, winnerMetadataObservation, winnerResearchQueue } from './competition-winner-rocky.mjs';

const universe=JSON.parse(fs.readFileSync(new URL('./universe.json',import.meta.url),'utf8'));
const trueup=universe.events[0].projects.find(p=>p.project_id==='neathack-trueup');
const baseline={
 schema:'evercraft.rockies.competition-public-repo-snapshot.v1',
 project_id:'neathack-trueup',repo:'Jennycruzy/trueup',observed_at:'2026-10-19T10:00:00.000Z',
 source_family:'github_repository_api',source_urls:['https://api.github.com/repos/Jennycruzy/trueup'],
 head_sha:'a'.repeat(40),latest_release_tag:null,latest_release_url:null,archived:false
};
test('universe covers all displayed placements and explicitly holds unresolved repo identities',()=>{
 const result=validateWinnerUniverse(universe);
 assert.equal(result.projects,4);
 assert.equal(result.future,5);
 assert.deepEqual(trackedRepositories(universe).map(x=>x.repo),['Jennycruzy/trueup']);
 assert.equal(universe.events[0].projects.filter(x=>x.awarded_rank!==null).length,0);
 const queue=winnerResearchQueue(universe);
 assert.equal(queue.length,4);
 assert.equal(queue.find(x=>x.project_id==='neathack-veritas').status,'needs_source_attribution');
});
test('cannot fabricate source binding or duplicate project identities',()=>{
 const wrong=structuredClone(universe);
 wrong.events[0].projects[0].repo='unverified/veritas';
 assert.throws(()=>validateWinnerUniverse(wrong),/unverified_repository_binding/);
 const duplicated=structuredClone(universe);
 duplicated.events[0].projects.push(duplicated.events[0].projects[0]);
 assert.throws(()=>validateWinnerUniverse(duplicated),/duplicate_target/);
});
test('verified public GitHub API metadata is read-only and scoped to project',async()=>{
 const hit=[];
 const mockFetch=async url=>{
   hit.push(url);
   const parts=url.split('/');
   let data;
   if(parts.at(-1)==='trueup')data={full_name:'Jennycruzy/trueup',private:false,default_branch:'main',pushed_at:'2026-10-19T10:00:00Z',open_issues_count:5,archived:false};
   else if(url.includes('/commits?'))data=[{sha:'b'.repeat(40)}];
   else if(url.includes('/releases?'))data=[{tag_name:'v1.2.0',html_url:'https://github.com/Jennycruzy/trueup/releases/tag/v1.2.0'}];
   else throw new Error('unexpected URL');
   return {ok:true,json:async()=>data};
 };
 const current=await fetchPublicGithubSnapshot(trueup,{fetchImpl:mockFetch,observedAt:'2026-10-19T12:00:00Z'});
 assert.equal(current.head_sha,'b'.repeat(40));
 assert.equal(hit.length,3);
 assert.ok(hit.every(url=>url.startsWith('https://api.github.com/repos/Jennycruzy/trueup')));
 assert.equal(current.source_family,'github_repository_api');
 const changed=compareSnapshots(baseline,current);
 assert.deepEqual(changed.material_changes.map(x=>x.kind),['commit_head_changed','new_public_release']);
 const obs=winnerMetadataObservation({competition_id:'neathack-2026',project:trueup,current,comparison:changed});
 assert.equal(obs.schema,'evercraft.context.observation.v1');
 assert.equal(obs.evidence_state,'observed');
 assert.equal(obs.metadata.notify_directly,false);
 assert.equal(obs.source_family,'github_repository_api');
 assert.equal(obs.correlation_keys[0],'competition::neathack-2026::neathack-trueup');
});
test('baseline stays quiet and noisy counts are not material changes',()=>{
 assert.equal(compareSnapshots(null,baseline).quiet,true);
 const later={...baseline,observed_at:'2026-10-20T10:00:00Z',open_issues_count:500};
 assert.deepEqual(compareSnapshots(baseline,later).material_changes,[]);
 assert.throws(()=>compareSnapshots(baseline,{...later,repo:'other/repo'}),/incompatible_snapshot_identity/);
 assert.throws(()=>compareSnapshots(baseline,{...later,observed_at:'2026-10-19T08:00:00Z'}),/nonmonotonic_snapshot_time/);
});
test('failed fetch must hold and never manufacture observations',async()=>{
 const bad={...trueup,project_id:'unverified',repo:'bad/repo',repo_identity_state:'unresolved'};
 await assert.rejects(fetchPublicGithubSnapshot(bad,{fetchImpl:async()=>({ok:true,json:async()=>({})})}),/unverified_repository_binding/);
 await assert.rejects(fetchPublicGithubSnapshot(trueup,{fetchImpl:async()=>({ok:false,status:429})}),/github_source_unavailable_429/);
 await assert.rejects(fetchPublicGithubSnapshot(trueup,{fetchImpl:async()=>({ok:true,json:async()=>({full_name:'other/project',private:false})})}),/identity_or_visibility_mismatch/);
});
