// Systemia commercial evidence: reconcile central Evercraft Payments snapshots without
// granting ANY provider-read, checkout, publication, fulfillment, or paid-state authority.
// These are caller-provided internal records, not authenticated processor attestations.
export const WEBSITE_AUDIT_OFFER_KEY='systemia.website_audit_quick_win_49.v1';
const EXPECTED={amount_cents:4900,currency:'usd',product_key:'systemia-website-audit'};
const isArray=Array.isArray;
const str=x=>typeof x==='string'?x.trim():'';
const distinct=(rows,key)=>new Set(rows.map(row=>str(row?.[key])).filter(Boolean));
const acceptedRows=(rows)=>isArray(rows)?rows.filter(x=>x&&typeof x==='object'&&!isArray(x)):[];
const protectedCount=(rows,declared)=>declared===true?rows.length:null;
const cleanOffer=(x)=>x.offer_key===WEBSITE_AUDIT_OFFER_KEY&&
  x.status==='active'&&x.product_key===EXPECTED.product_key&&
  Number(x.amount_cents)===EXPECTED.amount_cents&&str(x.currency).toLowerCase()===EXPECTED.currency;
const cleanContract=(x)=>x.offer_key===WEBSITE_AUDIT_OFFER_KEY&&x.status==='ready';
const isMappedAttempt=(x)=>str(x.operation).startsWith('migration.');

export function reconcileWebsiteAuditCheckoutEvidence({
  offers,contracts,orders,attempts,receipts,coverage={},
}={}){
  // A caller may supply partial record subsets. Not observed means UNKNOWN, not zero.
  const known=Object.fromEntries(['offers','contracts','orders','attempts','receipts'].map(k=>[
    k,coverage[k]===true&&isArray(({offers,contracts,orders,attempts,receipts})[k]),
  ]));
  const o=acceptedRows(offers),c=acceptedRows(contracts);
  const allOrders=acceptedRows(orders).filter(row=>row.offer_key===WEBSITE_AUDIT_OFFER_KEY);
  const orderKeySeen=new Set(), scopedOrders=[], duplicateOrders=[];
  for(const row of allOrders){
    const key=str(row.order_key);
    if(!key){duplicateOrders.push(row);continue;}
    if(orderKeySeen.has(key)){duplicateOrders.push(row);continue;}
    orderKeySeen.add(key);scopedOrders.push(row);
  }
  const matchingAttempts=acceptedRows(attempts).filter(row=>orderKeySeen.has(str(row.order_key)));
  const matchingReceipts=acceptedRows(receipts).filter(row=>row.offer_key===WEBSITE_AUDIT_OFFER_KEY
    ||orderKeySeen.has(str(row.order_key)));
  const mappedByOrder=new Set(matchingAttempts.filter(isMappedAttempt).map(a=>str(a.order_key)));
  const directByOrder=new Set(matchingAttempts.filter(a=>!isMappedAttempt(a)&&
    ['observed_open','observed_paid'].includes(a.state)&&
    str(a.provider_session_id)).map(a=>str(a.order_key)));

  const sessionRows=scopedOrders.filter(row=>str(row.provider_session_id) &&
    row.provider==='stripe' &&
    row.state==='checkout_open' &&
    Number(row.amount_cents)===EXPECTED.amount_cents &&
    str(row.currency).toLowerCase()===EXPECTED.currency);
  const importedSessions=sessionRows.filter(row=>mappedByOrder.has(str(row.order_key)));
  const directObservedSessions=sessionRows.filter(row=>directByOrder.has(str(row.order_key)));
  const localReceiptRows=matchingReceipts.filter(row=>row.synthetic!==true&&
    Boolean(row.verified_at)&&
    Number(row.amount_cents)===EXPECTED.amount_cents&&
    str(row.currency).toLowerCase()===EXPECTED.currency);

  const offerRows=o.filter(cleanOffer);
  const contractRows=c.filter(cleanContract);
  const missing=Object.entries(known).filter(([,yes])=>!yes).map(([key])=>key);
  const warnings=[];
  if(missing.length)warnings.push('incomplete_snapshot_coverage');
  if(known.offers&&offerRows.length!==1)warnings.push('exact_offer_not_uniquely_active');
  if(known.contracts&&contractRows.length!==1)warnings.push('exact_fulfillment_not_uniquely_ready');
  if(known.orders&&duplicateOrders.length)warnings.push('duplicate_or_unkeyed_order_rows');
  if(known.orders&&known.attempts&&importedSessions.length){
    warnings.push('migration_imports_are_not_provider_verification');
  }
  if(known.receipts&&localReceiptRows.length)warnings.push('internal_receipts_need_provider_reconciliation');
  const counts={
    exact_active_offers:protectedCount(offerRows,known.offers),
    exact_ready_fulfillment_contracts:protectedCount(contractRows,known.contracts),
    distinct_local_orders:protectedCount(scopedOrders,known.orders),
    local_checkout_open_session_references:protectedCount(sessionRows,known.orders),
    checkout_sessions_associated_with_migration:known.orders&&known.attempts?importedSessions.length:null,
    checkout_sessions_with_nonmigration_observed_attempt:known.orders&&known.attempts?directObservedSessions.length:null,
    local_recorded_receipts:protectedCount(matchingReceipts,known.receipts),
    local_qualified_receipt_rows:protectedCount(localReceiptRows,known.receipts),
    unique_provider_session_references:known.orders?distinct(sessionRows,'provider_session_id').size:null,
    independently_verified_provider_sessions:null,
    independently_verified_settled_orders:null,
    independently_verified_net_revenue_cents:null,
    independently_verified_shipping_deliveries:null,
  };
  const offerReady=known.offers&&known.contracts&&offerRows.length===1&&contractRows.length===1;
  const nextGate=missing.length?'complete_private_snapshot_coverage':
    !offerReady?'repair_exact_offer_or_fulfillment_contract':
    'authorize_read_only_processor_session_and_payment_reconciliation';
  return Object.freeze({
    schema:'evercraft.systemia.website-audit-payments-evidence.v1',
    offer_key:WEBSITE_AUDIT_OFFER_KEY,
    evidence_class:'read_only_internal_snapshot_not_stripe_verification',
    price_cents:EXPECTED.amount_cents,
    currency:EXPECTED.currency,
    coverage:known,
    counts,
    warnings:[...new Set(warnings)],
    next_gate:nextGate,
    state:'verification_held',
    systemia_admission_required:true,
    buyer_checkout_live_verified:false,
    provider_session_authenticated:false,
    settled_payment_verified:false,
    delivery_verified:false,
    outreach_authority:false,
    publication_authority:false,
    payment_mutation_authority:false,
    private_customer_data_in_output:false,
    note:'Session IDs or synthetic=false, even with migration-derived open state, never prove a processor-verified session, payment, customer, or delivery.',
  });
}
