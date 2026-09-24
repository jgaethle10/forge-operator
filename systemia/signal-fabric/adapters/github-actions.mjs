export function githubWorkflowRunToSignal(run, options={}) {
  const branch = run.head_branch || options.branch || 'unknown';
  const conclusion = run.conclusion || null;
  const mainline = branch === (options.defaultBranch || 'main');
  const liveImpact = options.liveImpact === true;

  return {
    company:'Evercraft',
    product:options.product || 'Forge Operator',
    source:mainline ? 'main' : 'branch',
    kind:'ci_workflow',
    component:run.name || 'GitHub Actions',
    workflow:run.name || 'unknown',
    status: conclusion === 'success' ? 'success' : (conclusion || run.status || 'unknown'),
    conclusion,
    evidence_state: liveImpact ? 'live_verified' : (mainline ? 'mainline_check' : 'source_build_green'),
    mainline,
    impact: liveImpact ? 'customer_live' : 'none_verified',
    summary:`${run.name || 'Workflow'} on ${branch}: ${conclusion || run.status || 'unknown'}`,
    created_at:run.updated_at || run.created_at || new Date().toISOString(),
    metadata:{
      run_id:run.id,
      head_sha:run.head_sha,
      event:run.event,
      html_url:run.html_url
    }
  };
}
