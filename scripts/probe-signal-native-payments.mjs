const ORIGIN='https://fabric.systemiacommandcenters.com';
const SLUG='signal-brief';
const OFFER_KEY='signal.incident_evidence_brief_250.v1';

async function readGet(url,fetchImpl){
  const response=await fetchImpl(url,{
    method:'GET',redirect:'error',
    headers:{accept:'text/html,application/json','user-agent':'Evercraft-Signal-Payments-ReadOnly-Canary/1.0'},
    signal:AbortSignal.timeout(12000)
  });
  const text=(await response.text()).slice(0,200000);
  return {status:response.status,body:text};
}

export async function observeSignalNativeOffer({origin=ORIGIN,fetchImpl=fetch}={}){
  if(origin!==ORIGIN)throw new Error('unapproved_owned_origin');
  const receipt={
    schema:'evercraft.signal.owned-payment-offer-canary.v1',
    origin, offer_slug:SLUG, offer_key:OFFER_KEY,
    price_cents:25000,currency:'usd',
    status:'unverified',pages_requested:2,checkout_posts:0,
    orders_created:0,payments_attempted:0,paid_receipts_verified:0,
    deploy_attestation_verified:false,checks:[]
  };
  try{
    const health=await readGet(origin+'/health',fetchImpl);
    const body=health.status===200?JSON.parse(health.body):{};
    receipt.checks.push({path:'/health',http:health.status,source_release_bound:body.source_release_ref_bound===true,deployment_receipt_bound:body.deployment_receipt_bound===true,checkout_configured:body.human_offer_checkout_enabled===true});
    receipt.deploy_attestation_verified=Boolean(body.source_release_ref_bound===true&&body.deployment_receipt_bound===true);
  }catch(error){receipt.checks.push({path:'/health',error:String(error?.message||error).slice(0,150)});}
  try{
    const offer=await readGet(origin+'/offers/'+SLUG,fetchImpl);
    const pageMatches=offer.status===200&&offer.body.includes('Evercraft Payments')&&
      offer.body.includes('Incident Evidence Brief')&&offer.body.includes('$250')&&
      offer.body.includes('Confirm your incident brief first.')&&
      !offer.body.includes('action="/api/offers/signal-brief/checkout"');
    receipt.checks.push({path:'/offers/'+SLUG,http:offer.status,price_and_identity_matched:pageMatches,checkout_held_copy_present:pageMatches});
    receipt.status=pageMatches?'native_owned_offer_page_observed_checkout_held':'not_verified';
  }catch(error){receipt.checks.push({path:'/offers/'+SLUG,error:String(error?.message||error).slice(0,150)});}
  receipt.native_offer_reachable=receipt.status==='native_owned_offer_page_observed_checkout_held';
  receipt.checkout_ready=false;
  receipt.payment_verified=false;
  receipt.fulfillment_verified=false;
  receipt.proof_scope='Read-only HTTPS GET checks only. Neither payment backend acceptance nor an end-to-end paid order was tested.';
  return receipt;
}
