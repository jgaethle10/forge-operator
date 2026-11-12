// Read-only synthetic contract proof; NOT an active Spider/Network/Saban integration.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function reconcileIncident(fixture, blackbox) {
  if (!fixture || fixture.schema !== 'evercraft.incident-fabric.synthetic.v1' || fixture.synthetic !== true)
    throw new Error('Only explicitly synthetic v1 incident fixtures are accepted');
  for (const key of ['incident_id','mission_id','occurred_at','agent_id','operation_id']) {
    if (typeof fixture[key] !== 'string' || !fixture[key].trim()) throw new Error('Missing ' + key);
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(fixture.occurred_at) ||
      Number.isNaN(Date.parse(fixture.occurred_at)))
    throw new Error('occurred_at requires ISO UTC timestamp');
  if (blackbox?.schema_version !== '1' || blackbox.operation_id !== fixture.operation_id)
    throw new Error('Black Box operation identity mismatch');
  if (blackbox.externally_verified !== false)
    throw new Error('Provider verification must not be inferred or supplied as true');
  if (!['UNKNOWN','CONFLICT','UNVERIFIED_COMMITTED_CLAIM','UNVERIFIED_FAILED_CLAIM'].includes(blackbox.assessment))
    throw new Error('Unsupported Black Box assessment');
  for (const key of ['spider_society','evercraft_network','saban','systemia','chum','fallen']) {
    if (fixture[key]?.incident_id !== fixture.incident_id) throw new Error(key + ' incident identity mismatch');
    if (fixture[key].evidence_state !== 'synthetic') throw new Error(key + ' is not labeled synthetic');
  }
  if (!Array.isArray(fixture.possible_downstream) ||
      !fixture.possible_downstream.every(x => typeof x === 'string' && x.trim()))
    throw new Error('possible_downstream must contain nonempty identifiers');
  if (fixture.spider_society.action_taken !== false ||
      fixture.evercraft_network.delivered !== false ||
      fixture.saban.dispatched !== false ||
      fixture.systemia.admitted !== false ||
      fixture.chum.published !== false ||
      fixture.fallen.rendered !== false)
    throw new Error('Synthetic scenario must not claim live dispatch, delivery, publication, rendering or intervention');
  const digest = createHash('sha256').update(JSON.stringify({fixture,blackbox})).digest('hex');
  return {
    schema:'evercraft.incident-fabric.reconciliation.v1',
    proof_state:'SYNTHETIC_CONTRACT_TEST_ONLY', live_integrated:false,
    input_sha256:digest, mission_id:fixture.mission_id, incident_id:fixture.incident_id,
    reconstruction:{
      who:{value:fixture.agent_id,evidence_state:'synthetic'},
      what:{value:fixture.failure_type,evidence_state:'synthetic'},
      where:{value:fixture.execution_environment,evidence_state:'synthetic'},
      when:{value:fixture.occurred_at,evidence_state:'synthetic'},
      why:{value:'UNKNOWN',evidence_state:'unverified_causality'},
      blackbox_assessment:blackbox.assessment, external_side_effect_verified:false
    },
    possible_downstream:fixture.possible_downstream.map(name=>({name,impact:'POSSIBLE_NOT_CONFIRMED'})),
    verified_collateral:[],
    spider_society:{persistence_signal:fixture.spider_society.persistence_signal,evidence_state:'synthetic',containment_performed:false},
    evercraft_network:{continuity_state:fixture.evercraft_network.continuity_state,evidence_state:'synthetic',delivery_verified:false},
    saban:{hypothesis:fixture.saban.hypothesis,evidence_state:'synthetic',agents_dispatched:false},
    systemia:{canonical_admission:'NOT_ADMITTED',real_actions_allowed:false},
    chum:{distribution:'NOT_PUBLISHED',provider_pickup:'NOT_VERIFIED'},
    fallen:{story_state:'STORYBOARD_ONLY',source_label:'SYNTHETIC_DEMONSTRATION'},
    required_next_actions:[
      'Obtain provider-authenticated readback before determining the operation result or retrying',
      'Inventory surviving timers, callbacks, queues and successors with scoped authorization',
      'Validate durable Network custody and delivery with real device/transport receipts',
      'Admit and dispatch through canonical Systemia before active review or remediation',
      'Have Saban test alternative explanations against source evidence',
      'Gate any public film or CHUM publication on factual accuracy and release approval'
    ]
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node reconcile.mjs <scenario.json> <blackbox-assessment.json>');
    const fixture=JSON.parse(readFileSync(process.argv[2],'utf8'));
    const assessment=JSON.parse(readFileSync(process.argv[3],'utf8'));
    process.stdout.write(JSON.stringify(reconcileIncident(fixture,assessment),null,2)+'\n');
  } catch(error) { console.error('Incident reconciliation rejected:',error.message); process.exitCode=1; }
}
