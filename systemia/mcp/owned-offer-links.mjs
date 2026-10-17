const ROUTES={
 'audit-center-website-audit-machine-v1':['website-audit',4900,'systemia.website_audit_quick_win_49.v1'],
 'ibmi-rescue-v1':['ibmi-rescue',25000,'ibmi_estate_xray_250'],
 'legacy-rescue-lab-v1':['legacy-rescue',29900,'legacy_rescue_scan_299.v1'],
 'findmypart-paid-hunt-v1':['findmypart',1900,'findmypart.quick_hunt_19.v1'],
 'site-survive-rapid-audit-v1':['site-survive',25000,'evercraft_network.site_survive_rapid_audit_250.v1'],
 'workflow-foundry-xray-v1':['workflow-xray',25000,'workflow_foundry.xray_250.v1']
};
export function ownedOfferLink(item){
 const route=ROUTES[item?.public_id];
 if(!route||item.commercial_state!=='sell_now'||Math.round(Number(item.entry_paid_offer?.price_usd_normalized)*100)!==route[1])return null;
 return {offer_slug:route[0],offer_key:route[2],price_cents:route[1],currency:'usd',human_form_url:'https://fabric.systemiacommandcenters.com/offers/'+route[0],buyer_confirmation_required:true,checkout_created:false,payment_verified:false,fulfillment_verified:false,evidence:'checkout_preparation_observed_2026-10-15'};
}
