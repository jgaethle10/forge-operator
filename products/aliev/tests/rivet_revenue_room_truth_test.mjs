import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const room=read('src/components/RevenueRoom.jsx');
const access=read('src/config/platformAccess.js');
const receiver=read('base44/functions/systemiaCommunicationsProjectionIngress/entry.ts');
const refresh=read('base44/functions/refreshCommunicationsProjection/entry.ts');

const checks={
  team_only_tab: /teamTabs:\s*\[[^\]]*['"]revenue-room['"]/.test(access),
  room_states_contacted_replied_paid:
    room.includes('contacted ≠ replied ≠ checkout ≠ paid'),
  prospect_not_proof:
    room.includes('Canonical Systemia pre-payment link, not proof'),
  reply_can_remain_suppressed:
    receiver.indexOf("if(Boolean(row.inbound_event_observed))return 'replied';") <
      receiver.indexOf("if(Boolean(row.do_not_contact))return 'suppressed';") &&
    room.includes('Inbound evidence only · may still be suppressed'),
  needs_us_excludes_suppressed_and_counterparty_wait:
    room.includes('Needs us now') &&
    room.includes("row.do_not_contact||!(") &&
    room.includes("row.next_action_owner&&row.next_action_owner!=='counterparty'"),
  pain_not_reply:
    room.includes('A reply or public opportunity signal does not advance this rung.'),
  proof_requires_delivery:
    room.includes("j.job_type==='send_preview'&&j.state==='completed'"),
  payment_from_purchase_ledger:
    room.includes("['paid','subscription_active'].includes(r.purchase?.status)"),
  prospect_uses_canonical_systemia_refs:
    room.includes('canonical_revenue_prospect_keys'),
  aggregate_pipeline_uses_snapshot:
    room.includes('RIVETRevenueJourneySnapshot') && room.includes('Full AliEV pre-payment pipeline'),
  effective_review_ready_excludes_duplicate_hold:
    room.includes('prospect_review_ready_effective') && room.includes('prospect_duplicate_hold_count'),
  owned_next_move_is_visibility_only:
    room.includes('Owned next move · human review required') &&
    room.includes('does not send the inquiry or authorize automated follow-up'),
  decision_ready_requires_three_independent_conditions:
    room.includes('Decision ready') &&
    room.includes('Legitimate route + buyer-specific proof + owned action') &&
    room.includes('decision_ready_count'),
  smoke_checkout_excluded_from_commercial:
    room.includes('smoke checkout excluded') && room.includes('commercial_checkout_created'),
  sync_is_admin_bounded:
    refresh.includes("rivet_admin_required") && refresh.includes('operator_token_required'),
  receiver_exact_systemia_source:
    receiver.includes("SYSTEMIA_APP_ID='694612db777e391542fd0333'"),
  receiver_rivet_scope_only:
    receiver.includes('product_scope_must_be_rivet'),
  stale_projection_fails_safe:
    receiver.includes('stale_ignored'),
  duplicate_projection_fails_safe:
    receiver.includes('duplicate_projection_rows_require_reconciliation'),
  no_outbound_authority:
    !/sendEmail|sendSMS|sendMessage|Gmail/.test(receiver+refresh),
  no_prospect_creation_authority:
    !/RIVETRevenueProspect\.(create|update)|RevenueProspect\.(create|update)/.test(receiver+refresh),
  no_checkout_or_payment_authority:
    !/RIVETPurchase\.(create|update)|RIVETBrokerCheckout\.(create|update)|rivetCreateCheckout/.test(receiver+refresh),
};

const failed=Object.entries(checks).filter(([,ok])=>!ok);
console.log(JSON.stringify(checks,null,2));
if(failed.length){
  console.error('RIVET_REVENUE_ROOM_TRUTH_GATE_FAIL',failed.map(([k])=>k).join(','));
  process.exit(1);
}
console.log('RIVET_REVENUE_ROOM_TRUTH_GATE_PASS');