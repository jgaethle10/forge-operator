import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/chromebook-operator-edge-canary.yml','utf8');

test('production edge canary spans one resident updater window only for the Visual Desk deployment-lag signature',()=>{
  assert.match(workflow,/timeout-minutes: 8/);
  assert.match(workflow,/max_attempts=16/);
  assert.match(workflow,/stage\" = \"visual_desk/);
  assert.match(workflow,/error\" = \"http_404:\/visuals\//);
  assert.match(workflow,/visual_desk_ingest_route_not_deployed/);
  assert.match(workflow,/visual_desk_ingest_credential_not_ready/);
  assert.match(workflow,/sleep 20/);
  assert.match(workflow,/All other production failures remain immediate/);
});

test('production edge canary still exits nonzero after bounded retry exhaustion',()=>{
  assert.match(workflow,/exit \"\$status\"/);
  assert.match(workflow,/failed with status \$status after \$attempt attempt/);
});


test('root 502 retry is admitted only after the same run observed Visual Desk deployment lag',()=>{
  assert.match(workflow,/deployment_wait_started=false/);
  assert.match(workflow,/deployment_wait_started=true/);
  assert.match(workflow,/deployment_wait_started\" = \"true/);
  assert.match(workflow,/stage\" = \"customer_surface/);
  assert.match(workflow,/error\" = \"http_502:\//);
  assert.match(workflow,/A 502 without that prior deployment-lag evidence remains immediate/);
});


test('Visual Desk ingest auth failure itself is not granted rollout grace',()=>{
  assert.doesNotMatch(
    workflow,
    /\[ "\$error" = "visual_desk_ingest_auth_gate_failed" \].*retrying/s
  );
});


test('Graphics Command asset rollout receives only bounded Visual Desk deployment grace',()=>{
  assert.match(workflow,/poster-feed\.svg/);
  assert.match(workflow,/poster-story\.svg/);
  assert.match(workflow,/graphics-plan\.json/);
  assert.match(workflow,/scroll-stop-report\.json/);
  assert.match(workflow,/fallen-stage-input\.json/);
  assert.match(workflow,/poster-quality-report\.json/);
  assert.match(workflow,/poster-story\.html/);
  assert.match(workflow,/graphics_command_state_geometry_missing/);
  assert.match(workflow,/graphics_command_terrain_relief_missing/);
  assert.match(workflow,/graphics_command_terrain_lineage_missing/);
  assert.match(workflow,/graphics_command_boundary_lineage_missing/);
  assert.match(workflow,/graphics_command_fallen_polygon_missing/);
  assert.match(workflow,/graphics_command_responsive_preview_missing/);
  assert.match(workflow,/graphics_command_directed_motion_missing/);
  assert.match(workflow,/deployment_wait_started=true/);
});


test('Lineage catalog rollout gets only bounded absence grace',()=>{
  assert.match(workflow,/public\/chum\/capabilities\.json/);
  assert.match(workflow,/public\/chum\/capabilities\/lineage-founding-pilot-v1\/\*\*/);
  assert.match(workflow,/stage\" = \"lineage_surface/);
  assert.match(workflow,/lineage_catalog_missing/);
  assert.match(workflow,/http_404:\/capabilities\/lineage-founding-pilot-v1/);
  assert.match(workflow,/Lineage deployment has not reached the owned edge yet/);
  assert.match(workflow,/deployment_wait_started=true/);
});

test('Lineage policy failures do not receive rollout grace',()=>{
  assert.doesNotMatch(workflow,/lineage_machine_state_drift.*retrying/s);
  assert.doesNotMatch(workflow,/lineage_commercial_state_drift.*retrying/s);
  assert.doesNotMatch(workflow,/lineage_founding_pilot_price_drift.*retrying/s);
  assert.doesNotMatch(workflow,/lineage_unverified_checkout_leak.*retrying/s);
});
