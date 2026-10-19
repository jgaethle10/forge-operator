import { createHash } from 'node:crypto';
import { normalizeContextObservation } from '../../worldstate/observation-fabric.mjs';

const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);
const validRepo = (repo) => typeof repo === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
const clean = (x) => String(x ?? '').trim();
function iso(value, what) {
  if (!value || !Number.isFinite(new Date(value).getTime())) throw new Error(what + '_invalid');
  return new Date(value).toISOString();
}
function requireValidTarget(target) {
  if (!target || !clean(target.project_id) || !clean(target.name) || !Array.isArray(target.public_sources)) {
    throw new Error('winner_target_missing_fields');
  }
  if (target.repo && !validRepo(target.repo)) throw new Error('winner_repo_invalid');
  if (target.repo && target.repo_identity_state !== 'matched_public_project_readme') throw new Error('unverified_repository_binding');
  if (!target.repo && target.monitor_state === 'read_only_public_repo') throw new Error('missing_repository_binding');
  return target;
}

export function validateWinnerUniverse(universe) {
  if (universe?.schema !== 'evercraft.rockies.competition-winner-universe.v1') throw new Error('invalid_universe');
  const known = new Set();
  for (const event of universe.events || []) {
    if (!clean(event.competition_id) || !Array.isArray(event.projects)) throw new Error('invalid_competition');
    for (const project of event.projects) {
      requireValidTarget(project);
      const key = event.competition_id + '/' + project.project_id;
      if (known.has(key)) throw new Error('duplicate_target');
      known.add(key);
    }
  }
  return { projects:known.size, competitions:(universe.events||[]).length, future:(universe.future_events||[]).length };
}

export function trackedRepositories(universe) {
  validateWinnerUniverse(universe);
  return (universe.events || []).flatMap(e => e.projects.map(p=>({competition_id:e.competition_id,...p})))
    .filter(p=>p.repo && p.repo_identity_state === 'matched_public_project_readme')
    .map(p=>({competition_id:p.competition_id,project_id:p.project_id,name:p.name,repo:p.repo}));
}

export async function fetchPublicGithubSnapshot(target,{fetchImpl=fetch, observedAt=new Date().toISOString()}={}) {
  requireValidTarget(target);
  if (!target.repo || target.repo_identity_state !== 'matched_public_project_readme') throw new Error('repo_not_independently_bound');
  const observed_at=iso(observedAt,'observation_time');
  const root='https://api.github.com/repos/'+target.repo;
  async function read(url) {
    if (!url.startsWith(root)) throw new Error('url_not_in_project_scope');
    const response=await fetchImpl(url, {redirect:'error', headers:{accept:'application/vnd.github+json','user-agent':'Evercraft-Rockies-competition-research'}});
    if (!response?.ok) throw new Error('github_source_unavailable_'+(response?.status??'unknown'));
    return response.json();
  }
  const metadata=await read(root);
  if (metadata.full_name!==target.repo || metadata.private!==false) throw new Error('github_repo_identity_or_visibility_mismatch');
  const [commits,releases]=await Promise.all([read(root+'/commits?per_page=1'),read(root+'/releases?per_page=1')]);
  if (!Array.isArray(commits) || !Array.isArray(releases)) throw new Error('github_source_shape_invalid');
  const head=commits[0]?.sha??null;
  if (head!==null && !/^[a-f0-9]{40}$/.test(head)) throw new Error('head_sha_invalid');
  const release=releases[0]||null;
  return {
    schema:'evercraft.rockies.competition-public-repo-snapshot.v1',
    project_id:target.project_id,repo:target.repo,observed_at,
    source_family:'github_repository_api',
    source_urls:[root,root+'/commits?per_page=1',root+'/releases?per_page=1'],
    default_branch:metadata.default_branch||null,
    head_sha:head,
    latest_release_tag:release?.tag_name||null,
    latest_release_url:release?.html_url||null,
    pushed_at:metadata.pushed_at||null,
    open_issues_count:Number.isSafeInteger(metadata.open_issues_count)?metadata.open_issues_count:null,
    archived:metadata.archived===true
  };
}

export function compareSnapshots(previous,current) {
  if (current?.schema!=='evercraft.rockies.competition-public-repo-snapshot.v1') throw new Error('invalid_current_snapshot');
  if (!previous) return {phase:'baseline',material_changes:[],quiet:true};
  if (previous.repo!==current.repo||previous.project_id!==current.project_id) throw new Error('incompatible_snapshot_identity');
  const newer=new Date(current.observed_at).getTime();
  const older=new Date(previous.observed_at).getTime();
  if (!Number.isFinite(newer)||!Number.isFinite(older)||newer<=older) throw new Error('nonmonotonic_snapshot_time');
  const changes=[];
  if (current.head_sha && previous.head_sha && current.head_sha!==previous.head_sha) {
    changes.push({kind:'commit_head_changed',before:previous.head_sha,after:current.head_sha,evidence_status:'public_metadata_observed'});
  }
  if (current.latest_release_tag && current.latest_release_tag!==previous.latest_release_tag) {
    changes.push({kind:'new_public_release',before:previous.latest_release_tag,after:current.latest_release_tag,evidence_status:'public_metadata_observed'});
  }
  if (previous.archived!==current.archived) changes.push({kind:'repository_archival_changed',before:previous.archived,after:current.archived,evidence_status:'public_metadata_observed'});
  // Issue counts, stars and noisy timestamps do not become strategic alerts. An observed new commit is not proof of shipped capability.
  return {phase:'comparison',material_changes:changes,quiet:changes.length===0};
}

export function winnerMetadataObservation({competition_id,project,current,comparison}) {
  requireValidTarget(project);
  if (!current||current.project_id!==project.project_id||current.repo!==project.repo) throw new Error('mismatched_project_snapshot');
  const kinds=(!comparison?.material_changes?.length)?['baseline_observed']:comparison.material_changes.map(x=>x.kind);
  const facts={project_id:project.project_id,competition_id,repo:project.repo,release_tag:current.latest_release_tag,head_sha:current.head_sha,change_kinds:kinds,conclusion:'Public GitHub metadata only; commits and releases require separate functionality review.'};
  return normalizeContextObservation({
    observation_id:'ctxobs:rockies:competition:'+sha([project.project_id,current.repo,current.head_sha,current.latest_release_tag,current.archived]),
    source_system:'rockies',source_family:'github_repository_api',observed_at:current.observed_at,
    region_keys:['global'],domains:['ai','general'],kind:'competition_project_public_repo',
    evidence_state:'observed',reliability:0.85,anomaly_score:comparison?.material_changes?.some(x=>x.kind==='new_public_release')?0.55:0.05,
    summary:project.name+': '+(comparison?.phase==='baseline'?'established public repository baseline':comparison.quiet?'no material repo change observed':'public GitHub metadata changed; functional impact unverified'),
    provenance_refs:['https://github.com/'+current.repo,...current.source_urls],
    correlation_keys:['competition::'+competition_id+'::'+project.project_id],
    facts,metadata:{rockies_range:'ai_models',mission_key:'rockies-competition-winners-public-intelligence-20261019',signal_type:'project_change_not_person_level',notify_directly:false,modeled_judge_score:false}
  });
}

export function winnerResearchQueue(universe,snapshots=[]) {
  validateWinnerUniverse(universe);
  const byId=new Map(snapshots.map(s=>[s.project_id,s]));
  return (universe.events||[]).flatMap(event=>event.projects.map(project=>{
    const snapshot=byId.get(project.project_id);
    return {
      competition_id:event.competition_id,project_id:project.project_id,project_name:project.name,
      status:project.repo?snapshot?'ready_for_delta_review':'repo_verified_awaiting_first_public_snapshot':'needs_source_attribution',
      evidence_sources:project.public_sources,
      questions:[
        'What exactly completed end to end with reproducible proof?',
        'How were third-party tools integrated and verified?',
        'What measurable before/after result is supported?',
        'What makes the demonstration clear, compelling, and honest?',
        'What changed since judging and what is actually released?',
        'Which gap can Evercraft address with its existing capabilities?'
      ],
      autonomy:'research_only_human_approves_any_external_action',
      source_family_count:project.repo?1:0
    };
  }));
}
