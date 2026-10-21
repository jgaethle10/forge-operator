import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyFabricCommerceCheckout } from '../systemia/mcp/fabric-commerce-edge-health.mjs';

const script=fs.readFileSync('scripts/fabric-edge-external-canary.mjs','utf8');

test('external Fabric canary proves the mobile surface and health metadata',()=>{
  assert.ok(script.includes("getText('/mobile')"));
  assert.ok(script.includes("receipt.checks.mobile_surface=true"));
  assert.ok(script.includes("mobile_surface_identity_missing"));
  assert.ok(script.includes("health.mobile_path!=='/mobile'"));
  assert.ok(script.includes("health.mobile_installable!==true"));
  assert.ok(script.includes("mobile_health_metadata_missing"));
});

test('mobile failure is a first-class canary stage',()=>{
  assert.ok(script.includes("if(checks.mobile_surface!==true) return 'mobile_surface'"));
});


test('external Fabric canary proves Visual Desk page, catalog, social card, motion stage, and health metadata',()=>{
  assert.ok(script.includes("getText('/visuals/')"));
  assert.ok(script.includes("getJson('/visuals/index.json')"));
  assert.ok(script.includes("washington-active-volcanoes"));
  assert.ok(script.includes("card-story.svg"));
  assert.ok(script.includes("__evercraftRenderAt"));
  assert.ok(script.includes("__evercraftRenderFrame"));
  assert.ok(script.includes("receipt.checks.visual_desk=true"));
  assert.ok(script.includes("health.visual_desk_ready!==true"));
  assert.ok(script.includes("health.visual_desk_motion_capable!==true"));
});

test('Visual Desk failure is a first-class external canary stage',()=>{
  assert.ok(script.includes("if(checks.visual_desk!==true) return 'visual_desk'"));
});


test('external Fabric canary proves Visual Desk ingest exists and blocks unauthenticated mutation',()=>{
  assert.ok(script.includes("timedFetch(origin+'/api/visuals/ingest'"));
  assert.ok(script.includes("negativeVisualIngest.status!==401"));
  assert.ok(script.includes("visual_ingest_unauthorized"));
  assert.ok(script.includes("visual_desk_ingest_auth_gate_failed"));
  assert.ok(script.includes("health.visual_desk_ingest_ready!==true"));
  assert.ok(script.includes("health.visual_desk_ingest_publication_authority!==false"));
});


test('external Fabric canary distinguishes deployment lag from a broken ingest auth gate',()=>{
  assert.ok(script.includes("negativeVisualIngest.status===404"));
  assert.ok(script.includes("visual_desk_ingest_route_not_deployed"));
  assert.ok(script.includes("negativeVisualIngest.status===503"));
  assert.ok(script.includes("visual_desk_ingest_credential_not_ready"));
  assert.ok(script.includes("visual_desk_ingest_auth_gate_failed"));
});


test('external Fabric canary proves Graphics Command poster, scroll-stop gate, and Fallen handoff',()=>{
  assert.ok(script.includes("poster-feed.svg"));
  assert.ok(script.includes("poster-story.svg"));
  assert.ok(script.includes("5 ACTIVE VOLCANOES"));
  assert.ok(script.includes("graphics-plan.json"));
  assert.ok(script.includes("evercraft.graphics-command.plan.v1"));
  assert.ok(script.includes("scroll-stop-report.json"));
  assert.ok(script.includes("graphics_command_scroll_stop_not_passed"));
  assert.ok(script.includes("fallen-stage-input.json"));
  assert.ok(script.includes("graphics_command_fallen_geo_handoff_invalid"));
  assert.ok(script.includes("graphics_command_verified:true"));
  assert.ok(script.includes("graphics_command_state_geometry_missing"));
  assert.ok(script.includes("graphics_command_terrain_relief_missing"));
  assert.ok(script.includes("graphics_command_terrain_lineage_missing"));
  assert.ok(script.includes('data:image\\/png;base64'));
  assert.ok(script.includes("data-source-sha256"));
  assert.ok(script.includes("graphics_command_boundary_lineage_missing"));
  assert.ok(script.includes("CC0-1.0"));
  assert.ok(script.includes("public_domain"));
  assert.ok(script.includes("graphics_command_fallen_polygon_missing"));
  assert.ok(script.includes("poster-story.html"));
  assert.ok(script.includes("graphics_command_responsive_preview_missing"));
  assert.ok(script.includes("evercraft\\.visual-story\\.motion-stage\\.v2"));
  assert.ok(script.includes("graphics_command_directed_motion_missing"));
  assert.ok(script.includes("poster-quality-report.json"));
  assert.ok(script.includes("evercraft.graphics-command.poster-quality-report.v1"));
  assert.ok(script.includes("graphics_command_poster_quality_not_passed"));
  assert.ok(script.includes("graphics_command_layout_quality_invalid"));
  assert.ok(script.includes("labelsNonOverlapping"));
  assert.ok(script.includes("labelsClearOfOtherMarkers"));
  assert.ok(script.includes("regionIdentityClear"));
  assert.ok(script.includes("region_identity_clear"));
});


test('Lineage founding pilot is a first-class external production invariant',()=>{
  assert.ok(script.includes("if(checks.lineage_surface!==true) return 'lineage_surface'"));
  assert.ok(script.includes("lineage-founding-pilot-v1"));
  assert.ok(script.includes("lineage_catalog_missing"));
  assert.ok(script.includes("lineage_machine_state_drift"));
  assert.ok(script.includes("lineage_commercial_state_drift"));
  assert.ok(script.includes("lineage_founding_pilot_price_drift"));
  assert.ok(script.includes("getText(lineagePath)"));
  assert.ok(script.includes("Evercraft Lineage Founding Pilot"));
  assert.ok(script.includes("lineage_direct_processor_checkout_leak"));
  assert.ok(script.includes("lineage_unverified_checkout_leak"));
  assert.ok(script.includes("receipt.checks.lineage_surface=true"));
});

test('Lineage external proof preserves human-confirmed authority boundaries',()=>{
  assert.ok(script.includes("machine_state:lineage.state"));
  assert.ok(script.includes("commercial_state:lineage.commercial_state"));
  assert.ok(script.includes("human_confirmed:true"));
  assert.ok(script.includes("automatic_repository_access:false"));
  assert.ok(script.includes("automatic_payment:false"));
  assert.ok(script.includes("direct_processor_checkout:false"));
});


test('FAIE AgNormal design-partner room is a first-class external production invariant',()=>{
  assert.ok(script.includes("if(checks.faie_design_partner_surface!==true) return 'faie_design_partner_surface'"));
  assert.ok(script.includes("getText('/faie/agnormal/')"));
  assert.ok(script.includes("Prepared for AgNormal"));
  assert.ok(script.includes("One real decision\\. Live evidence\\. No theater\\."));
  assert.ok(script.includes('id="activityHud"'));
  assert.ok(script.includes("Cancel operation"));
  assert.ok(script.includes("Download handed off"));
  assert.ok(script.includes("receipt.checks.faie_design_partner_surface=true"));
});

test('FAIE AgNormal external proof executes a bounded live decision packet and preserves authority',()=>{
  assert.ok(script.includes("if(checks.faie_design_partner_investigation!==true) return 'faie_design_partner_investigation'"));
  assert.ok(script.includes("postJson('/api/faie/investigate'"));
  assert.ok(script.includes("evercraft.faie.investigation.v1"));
  assert.ok(script.includes("SENSE_CHALLENGE_DECIDE"));
  assert.ok(script.includes("human_review_required!==true"));
  assert.ok(script.includes("action_authority!==false"));
  assert.ok(script.includes("decision_authority!==false"));
  assert.ok(script.includes("publication_authority!==false"));
  assert.ok(script.includes("evidence_acquisition_queue"));
  assert.ok(script.includes("receipt.checks.faie_design_partner_investigation=true"));
});

test('FAIE external health metadata exposes the clean design-partner path',()=>{
  assert.ok(script.includes("faieHealth.design_partner_surface!=='/faie/agnormal/'"));
  assert.ok(script.includes("design_partner_surface:faieHealth.design_partner_surface"));
});


const heldCommerceHealth={
  mcp_read_only:true,
  human_offer_checkout_enabled:false,
  human_offer_checkout_requires_explicit_confirmation:true,
  human_offer_checkout_handoff_mode:'explicit_evercraft_page',
  payment_authority:'Evercraft Payments',
  payment_router:'Raven Nexus',
  base44_transport_enabled:false,
  checkout_legacy_dependency:false,
  checkout_operational_state:'held_owned_payment_endpoint_unconfigured',
  checkout_purchase_intent_configured:false,
  checkout_direct_offer_ops_configured:false,
  checkout_provider_paid_verified:false,
  checkout_fulfillment_verified:false,
};

test('public Fabric canary treats explicitly held checkout as online, not paid',()=>{
  const result=classifyFabricCommerceCheckout(heldCommerceHealth);
  assert.deepEqual(result,{
    ok:true,state:'checkout_held_no_charge',checkout_route_ready:false,
    payment_verified:false,fulfillment_verified:false,
  });
  assert.ok(script.includes('classifyFabricCommerceCheckout(health)'));
  assert.ok(script.includes('checkout_boundary_state:commerceBoundary.state'));
});

test('public Fabric canary requires both owned payment endpoints when enabled',()=>{
  const configured={
    ...heldCommerceHealth,
    human_offer_checkout_enabled:true,
    checkout_operational_state:'owned_checkout_route_configured',
    checkout_purchase_intent_configured:true,
    checkout_direct_offer_ops_configured:true,
  };
  const result=classifyFabricCommerceCheckout(configured);
  assert.equal(result.ok,true);
  assert.equal(result.checkout_route_ready,true);
  assert.equal(result.payment_verified,false);
  assert.equal(result.fulfillment_verified,false);
  for(const broken of [
    {...configured,checkout_purchase_intent_configured:false},
    {...configured,checkout_direct_offer_ops_configured:false},
    {...configured,checkout_operational_state:'held_owned_payment_endpoint_unconfigured'},
  ]){
    assert.equal(classifyFabricCommerceCheckout(broken).ok,false);
  }
});

test('public Fabric canary rejects inconsistent or insecure checkout holds',()=>{
  const overrides=[
    {human_offer_checkout_enabled:true},
    {checkout_purchase_intent_configured:true},
    {checkout_direct_offer_ops_configured:true},
    {checkout_provider_paid_verified:true},
    {checkout_fulfillment_verified:true},
    {checkout_legacy_dependency:true},
    {base44_transport_enabled:true},
    {human_offer_checkout_requires_explicit_confirmation:false},
    {payment_authority:'Stripe'},
    {payment_router:'direct_stripe'},
    {checkout_operational_state:'unknown'},
  ];
  for(const override of overrides){
    const result=classifyFabricCommerceCheckout({...heldCommerceHealth,...override});
    assert.equal(result.ok,false,JSON.stringify(override));
  }
});
