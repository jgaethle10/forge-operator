/**
 * Classify checkout *routing* without confusing healthy public ingress with
 * payment readiness. A held checkout is an intentional fail-closed safety state.
 * This classifier never treats a configured checkout as a successful payment.
 */
export function classifyFabricCommerceCheckout(health){
  if(!health || typeof health!=='object' || Array.isArray(health)){
    return {ok:false,reason:'health_missing'};
  }
  if(
    health.mcp_read_only!==true ||
    health.human_offer_checkout_requires_explicit_confirmation!==true ||
    health.human_offer_checkout_handoff_mode!=='explicit_evercraft_page' ||
    health.payment_authority!=='Evercraft Payments' ||
    health.payment_router!=='Raven Nexus' ||
    health.base44_transport_enabled!==false ||
    health.checkout_legacy_dependency!==false
  ){
    return {ok:false,reason:'commerce_authority_boundary_failed'};
  }
  const held=
    health.human_offer_checkout_enabled===false &&
    health.checkout_operational_state==='held_owned_payment_endpoint_unconfigured' &&
    health.checkout_purchase_intent_configured===false &&
    health.checkout_direct_offer_ops_configured===false &&
    health.checkout_provider_paid_verified===false &&
    health.checkout_fulfillment_verified===false;
  if(held){
    return {
      ok:true,state:'checkout_held_no_charge',
      checkout_route_ready:false,payment_verified:false,fulfillment_verified:false,
    };
  }
  const configured=
    health.human_offer_checkout_enabled===true &&
    health.checkout_purchase_intent_configured===true &&
    health.checkout_direct_offer_ops_configured===true &&
    health.checkout_operational_state!=='held_owned_payment_endpoint_unconfigured';
  if(configured){
    return {
      ok:true,state:'checkout_route_configured_not_payment_proof',
      checkout_route_ready:true,payment_verified:false,fulfillment_verified:false,
    };
  }
  return {ok:false,reason:'checkout_state_inconsistent'};
}
