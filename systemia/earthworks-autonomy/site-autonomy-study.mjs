const DIMENSIONS = Object.freeze({
  repeatability: { weight: 5, positive: true, label: 'Task repeatability' },
  controlledAccess: { weight: 5, positive: true, label: 'Controlled/private operating area' },
  routeStability: { weight: 4, positive: true, label: 'Route and zone stability' },
  productionPressure: { weight: 2, positive: true, label: 'Production / labor pressure' },
  operatorExposure: { weight: 3, positive: true, label: 'Human exposure worth reducing' },
  telemetryReadiness: { weight: 2, positive: true, label: 'Existing telemetry / positioning readiness' },
  trafficComplexity: { weight: 5, positive: false, label: 'Mixed traffic complexity' },
  environmentVariability: { weight: 4, positive: false, label: 'Environment variability' }
});

function bounded(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('study dimensions must be numeric');
  return Math.max(0, Math.min(5, n));
}

export function scoreSiteAutonomy(input = {}) {
  let earned=0,total=0;
  const dimensions={};
  for (const [key, meta] of Object.entries(DIMENSIONS)) {
    const raw=bounded(input[key] ?? 0);
    const normalized=meta.positive ? raw : 5-raw;
    earned += normalized * meta.weight;
    total += 5 * meta.weight;
    dimensions[key]={raw,normalized,label:meta.label};
  }
  const score=Math.round((earned/total)*100);
  const blockers=[];
  if ((input.controlledAccess ?? 0) < 3) blockers.push('operating domain is not sufficiently controlled');
  if ((input.trafficComplexity ?? 0) > 3) blockers.push('mixed traffic complexity is high');
  if ((input.environmentVariability ?? 0) > 4) blockers.push('environment changes too quickly for the current autonomy concept');
  if ((input.routeStability ?? 0) < 2) blockers.push('routes/zones are not stable enough to model reliably');

  let disposition='instrument-first';
  if (score >= 72 && blockers.length === 0) disposition='strong-simulation-shadow-candidate';
  else if (score >= 52) disposition='site-autonomy-study-candidate';

  return {
    schema:'evercraft.earthworks.site-autonomy-study.v1',
    score,
    disposition,
    dimensions,
    blockers,
    nextAction: disposition === 'instrument-first'
      ? 'Establish site telemetry, route/zone definitions and baseline cycle evidence before considering physical autonomy.'
      : 'Build a read-only site twin and replay one real production loop before any physical actuation.',
    authorityCeiling:'simulation_or_shadow_until_separate_physical_safety_case',
    requiredBaseline:[
      'machine roster and roles',
      'site zones and route geometry',
      'cycle-time observations',
      'material source and destination',
      'human and mixed-traffic interactions',
      'stop/takeover concept',
      'localization and heartbeat quality'
    ]
  };
}

export function studyDimensions(){return JSON.parse(JSON.stringify(DIMENSIONS));}
