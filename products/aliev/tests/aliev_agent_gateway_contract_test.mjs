import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=(p)=>fs.readFileSync(p,'utf8');
const gateway=read('base44/functions/alievAgentGateway/entry.ts');
const mcp=read('base44/functions/alievMcp/entry.ts');
const humanCheckout=read('base44/functions/alievHumanCheckoutStart/entry.ts');
const llms=read('public/llms.txt');
const manifest=JSON.parse(read('public/agents.json'));
const openapi=JSON.parse(read('public/openapi.json'));

const checks={};
function check(name,condition){
  checks[name]=Boolean(condition);
  assert.ok(condition,name);
}

check('gateway_reuses_public_energy_site_lookup', gateway.includes('/functions') && gateway.includes('/energySiteLookup'));
check('gateway_does_not_use_legacy_v2', !gateway.includes('energySiteLookupV2'));
check('gateway_has_analyze_site', gateway.includes("action==='analyze_site'"));
check('gateway_has_offer_catalog', gateway.includes("action==='offers'"));
check('gateway_has_capability_catalog', gateway.includes("action==='capabilities'"));
check('missing_is_not_zero', gateway.includes('Missing is not zero.') && llms.includes('Missing is not zero.'));
check('mapped_inventory_not_utilization', gateway.includes('Mapped charger inventory is not utilization.'));
check('gateway_never_calls_checkout', !/rivetCreateCheckout|createStripeCheckout|checkout\/sessions/.test(gateway+mcp));
check('mcp_four_read_only_tools_remain_read_only', (mcp.match(/readOnlyHint:true/g)||[]).length===4);
check('mcp_has_six_machine_tools', ['analyze_ev_site','get_aliev_offers','prepare_paid_handoff','prepare_site_report_checkout','get_aliev_purchase_status','get_aliev_capabilities'].every(x=>mcp.includes(x)));
check('handoff_is_non_destructive_and_not_read_only', mcp.includes("'prepare_paid_handoff'") && mcp.includes('destructiveHint:false') && mcp.includes('readOnlyHint:false'));
check('handoff_never_creates_checkout', gateway.includes("action==='create_handoff'") && gateway.includes('payment_authority:false') && !/rivetCreateCheckout|createStripeCheckout|checkout\/sessions/.test(gateway+mcp));
check('mcp_uses_current_server_package', mcp.includes("@modelcontextprotocol/server"));
check('public_manifest_blocks_silent_payment', manifest?.commercial_boundary?.machine_can_silently_create_payment===false);
check('human_confirmation_required', manifest?.commercial_boundary?.human_confirmation_required_for_paid_offer===true);
check('default_paid_site_offer_present', manifest?.pricing?.some(x=>x.offer_key==='site_report_299'&&x.amount_usd===299));
check('openapi_uses_verified_base44_endpoint',
  openapi?.servers?.[0]?.url==='https://base44.app' &&
  Boolean(openapi?.paths?.['/api/apps/69b9b64d86a732029ce0db81/functions/alievAgentGateway']?.post)
);
check('llms_advertises_exact_mcp_endpoint', llms.includes('https://base44.app/api/apps/69b9b64d86a732029ce0db81/functions/alievMcp'));
check('no_outreach_authority', !/SendEmail|RevenueProspect\.(create|update)|ExternalOutreachReceipt/.test(gateway+mcp+humanCheckout));
check('human_checkout_requires_explicit_confirmation', humanCheckout.includes("confirm_purchase") && humanCheckout.includes("!=='yes'"));
check('human_checkout_reuses_canonical_broker', humanCheckout.includes('/rivetCreateBrokerCheckout'));
check('human_checkout_preserves_agent_attribution', humanCheckout.includes("distribution_source:qaMode?'agent_gateway_qa':'agent_gateway'") && humanCheckout.includes("distribution_medium:'human_handoff'"));
check('human_checkout_never_marks_paid', !/status\s*:\s*['"]paid['"]|authoritative_access_granted\s*:\s*true/.test(humanCheckout));
check('human_checkout_redirects_to_provider_only_after_broker_success', humanCheckout.includes("status:303") && humanCheckout.includes("Location:data.checkout_url"));

console.log(JSON.stringify(checks,null,2));
console.log('ALIEV_AGENT_GATEWAY_CONTRACT_PASS');