export const EARTHWORKS_APPLICATIONS = Object.freeze([
  {
    id: 'aggregate-haul-loop',
    name: 'Quarry / aggregate haul loop',
    buyer: 'Quarry and aggregate operators',
    pain: ['operator shortages', 'variable haul cycles', 'idle time', 'mixed-fleet coordination'],
    machineRoles: ['excavator_or_loader', 'haul_truck', 'dozer_optional'],
    autonomyTargets: ['dispatch', 'exclusive-zone arbitration', 'haul routing', 'dump sequencing', 'cycle telemetry'],
    firstProof: 'Simulate the existing haul loop, then connect one bounded truck adapter in a controlled private operating area.',
    commercialEntry: 'Site Autonomy Study'
  },
  {
    id: 'mass-earthwork',
    name: 'Mass excavation / cut-fill',
    buyer: 'Civil contractors and site developers',
    pain: ['truck-excavator imbalance', 'changing cut-fill priorities', 'production visibility', 'crew coordination'],
    machineRoles: ['excavator', 'articulated_dump_truck', 'dozer', 'loader_optional'],
    autonomyTargets: ['production planning', 'truck assignment', 'haul-route coordination', 'material destination control', 'progress receipts'],
    firstProof: 'Ingest a bounded cut-fill mission and prove dispatch plus material accounting in the digital twin before physical control.',
    commercialEntry: 'EarthWorks Digital Twin Pilot'
  },
  {
    id: 'stationary-loading',
    name: 'Repetitive loading / hopper feeding',
    buyer: 'Quarries, recycling yards, bulk-material facilities',
    pain: ['repetitive operator exposure', 'cycle inconsistency', 'spill', 'stationary loading labor'],
    machineRoles: ['excavator_or_loader', 'hopper_or_crusher'],
    autonomyTargets: ['repeatable loading cycle', 'target-zone control', 'cycle counting', 'throughput monitoring'],
    firstProof: 'Train a bounded repeatable cycle with a physical scale model or approved equipment adapter and hard exclusion zone.',
    commercialEntry: 'Autonomous Cycle Pilot'
  },
  {
    id: 'landfill-material-management',
    name: 'Landfill / stockpile material management',
    buyer: 'Waste, transfer, compost and bulk-material operators',
    pain: ['operator exposure', 'dust and heat', 'repetitive spreading', 'stockpile visibility'],
    machineRoles: ['dozer', 'loader', 'compactor_optional', 'haul_truck_optional'],
    autonomyTargets: ['zone-based work orders', 'stockpile state', 'repetitive spreading', 'remote-supervised task execution'],
    firstProof: 'Model a no-person exclusion zone and repetitive material-spreading mission before any machine integration.',
    commercialEntry: 'Hazard-Zone Autonomy Study'
  },
  {
    id: 'solar-civil-site-prep',
    name: 'Solar / industrial site preparation',
    buyer: 'EPCs, grading contractors and infrastructure developers',
    pain: ['large repetitive grading areas', 'tight schedule', 'fleet utilization', 'progress verification'],
    machineRoles: ['dozer', 'grader', 'excavator', 'haul_truck'],
    autonomyTargets: ['mission decomposition', 'zone assignment', 'fleet balancing', 'production telemetry', 'as-built progress handoff'],
    firstProof: 'Run daily work packages through the site contract and compare planned versus simulated production before controlled equipment trials.',
    commercialEntry: 'SiteOS Planning Pilot'
  },
  {
    id: 'hazard-recovery',
    name: 'Hazardous recovery / disaster debris',
    buyer: 'Industrial recovery, emergency contractors and public agencies',
    pain: ['unsafe human exposure', 'unstable environments', 'debris handling', 'remote visibility'],
    machineRoles: ['excavator', 'loader', 'haul_truck'],
    autonomyTargets: ['remote-supervised tasking', 'exclusion-zone enforcement', 'material tracking', 'operator takeover'],
    firstProof: 'Use the digital twin and scale equipment to validate task sequencing and fail-safe behavior before field use.',
    commercialEntry: 'Remote Recovery Simulation'
  }
]);

export function findApplications(text = '') {
  const q = String(text).toLowerCase();
  if (!q.trim()) return [...EARTHWORKS_APPLICATIONS];
  return EARTHWORKS_APPLICATIONS.filter((app) =>
    [app.id, app.name, app.buyer, ...app.pain, ...app.machineRoles, ...app.autonomyTargets, app.commercialEntry]
      .join(' ')
      .toLowerCase()
      .includes(q)
  );
}

export function makePilotBrief(applicationId) {
  const app = EARTHWORKS_APPLICATIONS.find((item) => item.id === applicationId);
  if (!app) throw new Error(`unknown EarthWorks application: ${applicationId}`);
  return {
    schema: 'evercraft.earthworks.pilot-brief.v1',
    application: app.id,
    name: app.name,
    buyer: app.buyer,
    commercialEntry: app.commercialEntry,
    phases: [
      { id: 'observe', gate: 'read-only', output: 'baseline cycle, route, zone and production model' },
      { id: 'simulate', gate: 'no physical actuation', output: 'digital-twin mission replay and failure injection' },
      { id: 'shadow', gate: 'human remains authoritative', output: 'planner recommendations compared against real operation' },
      { id: 'bounded-actuation', gate: 'private controlled area + approved adapter + independent stop', output: 'single bounded machine/task proof' },
      { id: 'fleet-pilot', gate: 'formal safety case + site authorization', output: 'multi-machine supervised pilot receipts' }
    ],
    firstProof: app.firstProof
  };
}
