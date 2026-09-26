import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const TARGETS=['ibmi-rescue','foundry-app-escape','site-survive'];

function directDoorStates(specs){
  const products=Array.isArray(specs?.products)?specs.products:[];
  return TARGETS.map((slug)=>{
    const product=products.find((x)=>x.slug===slug);
    return {
      slug,
      state:product?.state||'missing',
      registry_name:product?.registry_name||null,
      mcp_url:product?.mcp_url||null,
    };
  });
}

export function evaluatePublicEdgeFieldMission({
  node001Mission=null,
  edgeWatch=null,
  externalCanary=null,
  directPluginSpecs=null,
  issueRef='github:issue:403',
  dependencyIssueRef='github:issue:175',
  now=new Date(),
}={}){
  const completed=new Set(node001Mission?.completed_steps||[]);
  const fieldVerified=Boolean(
    completed.has('yard_enrollment_verified') &&
    completed.has('live_identity_attested')
  );
  const fieldEvidenceReady=completed.has('field_evidence_candidate_ready');
  const physicalActionRequired=Boolean(
    !fieldVerified && node001Mission?.human_field_action_required===true
  );

  const edgeActivated=Boolean(
    ['activated','healthy'].includes(String(edgeWatch?.action||'')) &&
    edgeWatch?.field_verified===true
  );
  const publicRouteVerified=Boolean(
    edgeActivated && edgeWatch?.route_verified===true
  );
  const canaryVerified=Boolean(
    externalCanary?.verified===true &&
    externalCanary?.state==='public_https_verified' &&
    externalCanary?.field_enrollment_verified===true &&
    externalCanary?.public_https_verified===true
  );

  const doors=directDoorStates(directPluginSpecs);
  const allRegistryPending=doors.every(
    (x)=>x.state==='public_https_verified_registry_pending'
  );
  const allPublished=doors.every(
    (x)=>x.state==='registry_published_direct_mcp_existing'
  );

  let status='waiting_on_field_evidence';
  let nextAction='Complete Node 001 field evidence and live Yard attestation.';
  let systemiaAutonomyReady=false;

  if(fieldVerified){
    systemiaAutonomyReady=true;
    status='ready_for_systemia';
    nextAction='Discover an edge-ready field NodeSeed and activate the managed public edge.';
  }
  if(edgeActivated&&!publicRouteVerified){
    status='edge_active_external_route_pending';
    nextAction='Verify the managed public HTTPS route and retain the field-bound runtime.';
  }
  if(publicRouteVerified&&!canaryVerified){
    status='public_edge_active_external_canary_pending';
    nextAction='Wait for the external canary to verify trusted public TLS and MCP handshakes.';
  }
  if(canaryVerified&&!allRegistryPending&&!allPublished){
    status='public_https_verified_promotion_pending';
    nextAction='Promote direct specialist specs from the verified external canary receipt.';
  }
  if(canaryVerified&&allRegistryPending){
    status='public_https_verified_registry_pending';
    nextAction='Run the existing MCP Registry publication lane under Systemia release policy.';
  }
  if(canaryVerified&&allPublished){
    status='complete';
    nextAction='Maintain public edge health, registry conformance and specialist availability.';
  }

  const evidenceRefs=[
    issueRef,
    dependencyIssueRef,
    edgeWatch?.receipt_hash,
    edgeWatch?.provision_receipt,
    edgeWatch?.field_enrollment_receipt,
    externalCanary?.deployment_receipt_ref,
    externalCanary?.field_enrollment_receipt_ref,
    externalCanary?.public_edge_admission_receipt_ref,
  ].filter(Boolean);

  const body={
    schema:'evercraft.public-edge.field-mission-state.v1',
    issue_ref:issueRef,
    dependency_issue_ref:dependencyIssueRef,
    status,
    field_evidence_ready:fieldEvidenceReady,
    field_verified:fieldVerified,
    authorized_field_action_required:physicalActionRequired,
    systemia_autonomy_ready:systemiaAutonomyReady,
    edge_activated:edgeActivated,
    public_route_verified:publicRouteVerified,
    external_canary_verified:canaryVerified,
    direct_doors:doors,
    all_registry_pending:allRegistryPending,
    all_registry_published:allPublished,
    founder_login_required:false,
    next_action:nextAction,
    observed_at:now.toISOString(),
    evidence_refs:evidenceRefs,
  };
  const mission={...body,receipt_hash:sha(body)};

  const changed=status!=='complete'?1:0;
  return {
    mission,
    mission_snapshot:{
      schema:'evercraft.kaidance.mission-snapshot.v1',
      snapshot_ref:'public-edge-field:'+mission.receipt_hash,
      observed_at:mission.observed_at,
      counts:{
        scanned:1,
        changed,
        admitted:systemiaAutonomyReady?1:0,
        held:physicalActionRequired?1:0,
      },
      evidence_refs:[...evidenceRefs,mission.receipt_hash],
      mission_key:'evercraft-public-specialist-edge',
      workflow_key:'public-edge-activation-watch',
      state:status,
    },
  };
}
