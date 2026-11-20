#!/usr/bin/env node
// Owner-invoked read-only canary for the two *existing* official Radar source lanes.
// A successful probe establishes a bounded source read, not a resident or full 99/26 fleet.
import { runRockiesOfficialSourceCycle } from './official-bridge.mjs';
import { summarizeTopology } from './expansion.mjs';

const args = process.argv.slice(2);
if (args.length !== 1 || !['--design', '--live'].includes(args[0])) {
  console.error('Usage: node systemia/rockies/official-probe.mjs --design|--live');
  process.exitCode = 2;
} else if (args[0] === '--design') {
  const roster = summarizeTopology();
  console.log(JSON.stringify({
    status: 'design_only',
    ...roster,
    active_worker_count: null,
    verified_observations: 0,
    external_network_attempted: false,
    publication_authority: false
  }, null, 2));
} else {
  try {
    const run = await runRockiesOfficialSourceCycle();
    const sourceReadOk = run.coverage.some((row) => [
      'observations_propagated_to_context',
      'source_read_passed_no_new_observations',
      'source_read_passed_no_new_context'
    ].includes(row.status));
    console.log(JSON.stringify({
      schema: run.schema,
      status: sourceReadOk ? 'bounded_read_success' : 'no_confirmed_source_read',
      attempted_sources: run.coverage.length,
      projected_observation_count: run.projected_observation_count,
      coverage: run.coverage,
      designed_range_count: run.designed_range_count,
      declared_baseline_logical_rockies: run.declared_baseline_logical_rockies,
      active_worker_count: null,
      full_roster_runtime_verified: false,
      external_social_publication: false,
      publication_authority: false
    }, null, 2));
    if (!sourceReadOk) process.exitCode = 1;
  } catch {
    console.error('ROCKIES_OFFICIAL_PROBE_HELD: collector or projection failed');
    process.exitCode = 1;
  }
}
