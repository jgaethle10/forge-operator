// RouteTwin v0: deterministic, synthetic-only freight rehearsal core.
// This module never fetches live road data or authorizes a dispatch.
export const ROUTETWIN_SCHEMA = 'evercraft.atlas.route-twin.rehearsal.v0';
export const EVIDENCE_STATE = Object.freeze({
  tier: 'synthetic',
  geometry: 'schematic_waypoints_not_road_centerline',
  restrictions: 'not_checked',
  traffic: 'not_connected',
  weather: 'not_connected',
  timestamp: null,
});
export const CORRIDOR = Object.freeze({
  id: 'yakima-seattle-schematic',
  label: 'Yakima → Seattle / illustrative I-82 & I-90 corridor',
  notice: 'Teaching geometry only. Not surveyed, navigable, or a truck-legal route.',
  stops: [
    { id: 'yakima', name: 'Yakima', x: -8, z: -3 },
    { id: 'ellensburg', name: 'Ellensburg', x: -3.5, z: -1.6 },
    { id: 'pass', name: 'Snoqualmie Pass', x: 1, z: 1.5 },
    { id: 'north-bend', name: 'North Bend', x: 4, z: 4.5 },
    { id: 'seattle', name: 'Seattle', x: 8, z: 5 },
  ],
  segments: [
    { id: 'yakima-ellensburg', name: 'Yakima → Ellensburg', miles: 37, assumedMph: 51 },
    { id: 'ellensburg-pass', name: 'Ellensburg → Pass', miles: 65, assumedMph: 49 },
    { id: 'pass-north-bend', name: 'Pass → North Bend', miles: 25, assumedMph: 45 },
    { id: 'north-bend-seattle', name: 'North Bend → Seattle', miles: 35, assumedMph: 40 },
  ],
});
export const SCENARIOS = Object.freeze({
  baseline: { label: 'Synthetic baseline', description: 'No hypothetical disruption applied' },
  snow: { label: 'Hypothetical pass snow', description: 'Model a storm window of 15:00–22:00 local' },
  wind: { label: 'Hypothetical crosswinds', description: 'Model severe wind east of the pass' },
  closure: { label: 'Hypothetical pass closure', description: 'Force a no-go on the pass approach' },
});
function assertNumber(value, name, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(name+' must be between '+min+' and '+max);
}
function isWindow(hour, start, end) {
  const h = ((hour % 24) + 24) % 24;
  return start <= h && h < end;
}
const hourLabel = (hour) => {
  const n = ((hour % 24) + 24) % 24;
  const hr = Math.floor(n), min = Math.floor((n-hr)*60 + 0.5);
  return String((hr + Math.floor(min/60))%24).padStart(2,'0')+':'+String(min%60).padStart(2,'0');
};
export function simulateRoute({ scenario = 'baseline', departureHour = 8, truck = {} } = {}) {
  if (!Object.hasOwn(SCENARIOS, scenario)) throw new RangeError('Unknown scenario');
  assertNumber(departureHour, 'departureHour', 0, 23.999);
  const heightFt = truck.heightFt ?? 13.5;
  const grossWeightLb = truck.grossWeightLb ?? 80000;
  assertNumber(heightFt, 'heightFt', 1, 30);
  assertNumber(grossWeightLb, 'grossWeightLb', 1, 200000);
  let totalHours = 0, blocked = false, highRiskCount = 0;
  const legs = CORRIDOR.segments.map((segment, i) => {
    const entersAt = departureHour + totalHours;
    let factor = 1, status = 'illustrative', hazard = null;
    if (scenario === 'snow' && (i === 1 || i === 2) && isWindow(entersAt,15,22)) {
      factor = 0.55;
      status = 'caution';
      hazard = 'Hypothetical snow and reduced travel speed';
    }
    if (scenario === 'wind' && (i === 0 || i === 1)) {
      factor = 0.7;
      status = 'caution';
      hazard = 'Hypothetical crosswind exposure';
    }
    if (scenario === 'closure' && i === 1) {
      blocked = true;
      status = 'blocked';
      hazard = 'Hypothetical pass closure: STOP, no diversion validated';
    }
    if (status !== 'illustrative') highRiskCount += 1;
    const durationHours = blocked ? null : segment.miles/(segment.assumedMph*factor);
    if (durationHours !== null) totalHours += durationHours;
    return {
      ...segment,
      entersAt: blocked && i > 1 ? null : hourLabel(entersAt),
      exitsAt: durationHours === null ? null : hourLabel(departureHour+totalHours),
      durationHours,
      status: blocked && i > 1 ? 'unassessed' : status,
      hazard: blocked && i > 1 ? null : hazard,
      dataClass: 'hypothetical',
    };
  });
  const checked = !blocked;
  return {
    schema: ROUTETWIN_SCHEMA,
    corridorId: CORRIDOR.id,
    scenario,
    scenarioLabel: SCENARIOS[scenario].label,
    departureHour,
    truck: { heightFt, grossWeightLb },
    evidence: { ...EVIDENCE_STATE },
    authority: 'rehearsal_only_not_dispatch_approval',
    requires: [
      'Current official commercial-vehicle restrictions and permitted vehicle dimensions',
      'Current closure and construction status',
      'Weather forecast and observed conditions for each route segment',
      'A truck-legal road-network route and independent dispatcher/driver review',
    ],
    blocked,
    disposition: blocked ? 'stop_replan_and_verify' : 'illustrative_rehearsal_only',
    highRiskCount,
    travelHours: checked ? Number(totalHours.toFixed(2)) : null,
    arrivalAt: checked ? hourLabel(departureHour+totalHours) : null,
    legs,
  };
}
export function compareScenarios({departureHour=8,truck={}}={}) {
  return Object.keys(SCENARIOS).map(scenario=>simulateRoute({scenario,departureHour,truck}));
}
