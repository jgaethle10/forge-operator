import { randomUUID } from 'node:crypto';

const WORKFORCE_OFFERS=Object.freeze({
  agent_deposit:{
    product_name:'Evercraft AI Agent Architecture Deposit',
    amount_minor:50000,
    description:'Paid architecture deposit toward a custom or adapted isolated AI agent deployment. Credited toward implementation if the customer proceeds.'
  },
  team_deposit:{
    product_name:'Evercraft AI Agent Team Architecture Deposit',
    amount_minor:150000,
    description:'Paid architecture deposit toward a coordinated or fully custom AI agent team deployment. Credited toward implementation if the customer proceeds.'
  },
  workflow_deposit:{
    product_name:'Evercraft AI Workflow Architecture Deposit',
    amount_minor:100000,
    description:'Paid architecture deposit toward a custom AI workflow implementation. Credited toward implementation if the customer proceeds.'
  },
  nexus_deposit:{
    product_name:'Private Raven Nexus Architecture Engagement',
    amount_minor:250000,
    description:'Paid architecture engagement credited toward a Private Raven Nexus implementation. Final implementation and ongoing platform license are scoped separately.'
  }
});

const INTERVIEW_OFFER=Object.freeze({
  offer_key:'interview_sprint_7d',
  product_name:'Evercraft Interview Sprint',
  amount_minor:1900,
  description:'7 days of premium AI interview preparation for one target job, capped at 25 premium AI actions.',
  access_days:7,
  action_limit:25
});

function clean(value,max=4000){ return String(value??'').trim().slice(0,max); }
function email(value){
  const text=clean(value,320).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error('customer_email_invalid');
  return text;
}
function httpsOrigin(value){
  const url=new URL(clean(value,2000));
  if(url.protocol!=='https:'||url.username||url.password) throw new Error('workforce_public_origin_invalid');
  const host=url.hostname.toLowerCase();
  if(host==='base44.app'||host.endsWith('.base44.app')) throw new Error('workforce_public_origin_base44_forbidden');
  return url.origin;
}
function requireConfirmed(value){
  if(value!==true) throw new Error('checkout_explicit_confirmation_required');
}
function rows(result){ return Array.isArray(result)?result:(Array.isArray(result?.records)?result.records:[]); }
function items(result){ return Array.isArray(result?.items)?result.items:(Array.isArray(result?.data)?result.data:[]); }
function nowMs(now){ return new Date(now).getTime(); }
function at(now){ return new Date(now).toISOString(); }

export class EvercraftWorkforceCommerce {
  constructor({
    appKey='evercraft-ai-workforce',
    entityStore,
    connectorGateway,
    commerceBoundary,
    publicOrigin,
    clock=()=>new Date()
  }={}){
    if(!entityStore) throw new Error('workforce_entity_store_required');
    if(!connectorGateway||typeof connectorGateway.invoke!=='function') throw new Error('workforce_connector_gateway_required');
    if(!commerceBoundary||typeof commerceBoundary.verifyPayment!=='function') throw new Error('workforce_commerce_boundary_required');
    this.appKey=clean(appKey,127);
    if(!this.appKey) throw new Error('workforce_app_key_required');
    this.entityStore=entityStore;
    this.connectorGateway=connectorGateway;
    this.commerceBoundary=commerceBoundary;
    this.publicOrigin=httpsOrigin(publicOrigin);
    this.clock=clock;
  }

  #recent(entity,customerEmail,offerKey){
    return this.entityStore.filter(
      this.appKey,
      entity,
      {customer_email:customerEmail,offer_key:offerKey},
      {sort:'-created_date',limit:5}
    );
  }

  #rateGate(entity,customerEmail,offerKey){
    const now=nowMs(this.clock());
    const recent=this.#recent(entity,customerEmail,offerKey);
    if(recent.some((purchase)=>
      ['checkout_preparing','checkout_started','paid'].includes(String(purchase.payment_status||'')) &&
      now-new Date(purchase.created_date||purchase.created_at).getTime()<2*60*1000
    )){
      throw new Error('checkout_recent_attempt_exists');
    }
    const burst=recent.filter((purchase)=>
      now-new Date(purchase.created_date||purchase.created_at).getTime()<60*60*1000
    ).length;
    if(burst>=3) throw new Error('checkout_attempt_rate_limited');
  }

  async #findOrCreateProduct({
    metadataKey,
    metadataValue,
    name,
    description,
    amountMinor
  }){
    const listed=await this.connectorGateway.invoke(
      this.appKey,'polar','products.list',{queryParams:{limit:100}},
      {purpose:'workforce_checkout_product_lookup'}
    );
    const products=items(listed);
    const existing=products.find((product)=>
      clean(product?.metadata?.[metadataKey],200)===metadataValue
    );
    if(existing?.id) return {product_id:String(existing.id),created:false};

    const orgs=await this.connectorGateway.invoke(
      this.appKey,'polar','organizations.list',{queryParams:{limit:10}},
      {purpose:'workforce_checkout_organization_lookup'}
    );
    const organizationId=clean(items(orgs)?.[0]?.id,200);
    const payload={
      name,
      description,
      recurring_interval:null,
      prices:[{
        amount_type:'fixed',
        price_currency:'usd',
        price_amount:amountMinor
      }],
      metadata:{[metadataKey]:metadataValue}
    };
    if(organizationId) payload.organization_id=organizationId;

    const created=await this.connectorGateway.invoke(
      this.appKey,'polar','products.create',{payload},
      {purpose:'workforce_checkout_product_create'}
    );
    if(!created?.id) throw new Error('polar_product_create_failed');
    return {product_id:String(created.id),created:true};
  }

  async #createPolarCheckout({productId,customerEmail,purchase,metadata,returnTokenName}){
    const success=new URL('/',this.publicOrigin);
    success.searchParams.set('payment','return');
    success.searchParams.set(returnTokenName,purchase.purchase_token);

    const checkout=await this.connectorGateway.invoke(
      this.appKey,
      'polar',
      'checkouts.create',
      {
        payload:{
          products:[productId],
          success_url:success.toString(),
          customer_email:customerEmail,
          external_customer_id:purchase.id,
          metadata
        }
      },
      {purpose:'workforce_checkout_create',explicit_confirmation:true}
    );
    if(!checkout?.id||!checkout?.url) throw new Error('polar_checkout_create_failed');
    return checkout;
  }

  async createWorkforceCheckout({
    offerKey,
    customerEmail,
    customerName='',
    company='',
    need='',
    confirmedByUser=false
  }={}){
    requireConfirmed(confirmedByUser);
    const offer=WORKFORCE_OFFERS[clean(offerKey,100)];
    if(!offer) throw new Error('workforce_offer_unknown');
    const customer=email(customerEmail);
    this.#rateGate('WorkforcePurchase',customer,offerKey);

    const product=await this.#findOrCreateProduct({
      metadataKey:'evercraft_workforce_offer_key',
      metadataValue:offerKey,
      name:offer.product_name,
      description:offer.description,
      amountMinor:offer.amount_minor
    });

    const purchaseToken=randomUUID().replaceAll('-','');
    const purchase=this.entityStore.create(this.appKey,'WorkforcePurchase',{
      purchase_token:purchaseToken,
      customer_name:clean(customerName,200),
      customer_email:customer,
      company:clean(company,300),
      offer_key:offerKey,
      offer_name:offer.product_name,
      amount_cents:offer.amount_minor,
      currency:'USD',
      payment_status:'checkout_preparing',
      payment_provider:'polar',
      need:clean(need,3000),
      notes:'Owned checkout path. Paid status requires provider-authoritative Commerce Boundary verification.'
    }).record;

    try{
      const checkout=await this.#createPolarCheckout({
        productId:product.product_id,
        customerEmail:customer,
        purchase,
        returnTokenName:'workforce_purchase_token',
        metadata:{
          workforce_purchase_id:purchase.id,
          purchase_token:purchaseToken,
          offer_key:offerKey
        }
      });
      const updated=this.entityStore.update(this.appKey,'WorkforcePurchase',purchase.id,{
        payment_status:'checkout_started',
        payment_checkout_id:String(checkout.id)
      }).record;
      return {
        ok:true,
        checkout_url:String(checkout.url),
        purchase_token:purchaseToken,
        checkout_id:String(checkout.id),
        amount_cents:offer.amount_minor,
        currency:'USD',
        offer_name:offer.product_name,
        purchase:updated,
        payment_verified:false,
        payment_created:false,
        explicit_confirmation_observed:true
      };
    }catch(error){
      this.entityStore.update(this.appKey,'WorkforcePurchase',purchase.id,{
        payment_status:'checkout_failed',
        checkout_error_code:clean(error?.message||error,240)
      });
      throw error;
    }
  }

  async createInterviewCheckout({
    customerEmail,
    targetRole,
    targetCompany='',
    confirmedByUser=false
  }={}){
    requireConfirmed(confirmedByUser);
    const customer=email(customerEmail);
    const role=clean(targetRole,300);
    if(!role) throw new Error('target_role_required');
    this.#rateGate('InterviewPurchase',customer,INTERVIEW_OFFER.offer_key);

    const product=await this.#findOrCreateProduct({
      metadataKey:'evercraft_offer_key',
      metadataValue:INTERVIEW_OFFER.offer_key,
      name:INTERVIEW_OFFER.product_name,
      description:INTERVIEW_OFFER.description,
      amountMinor:INTERVIEW_OFFER.amount_minor
    });

    const purchaseToken=randomUUID().replaceAll('-','');
    const purchase=this.entityStore.create(this.appKey,'InterviewPurchase',{
      purchase_token:purchaseToken,
      customer_email:customer,
      target_role:role,
      target_company:clean(targetCompany,300),
      offer_key:INTERVIEW_OFFER.offer_key,
      amount_cents:INTERVIEW_OFFER.amount_minor,
      currency:'USD',
      payment_status:'checkout_preparing',
      payment_provider:'polar',
      premium_actions_used:0,
      premium_actions_limit:INTERVIEW_OFFER.action_limit
    }).record;

    try{
      const checkout=await this.#createPolarCheckout({
        productId:product.product_id,
        customerEmail:customer,
        purchase,
        returnTokenName:'purchase_token',
        metadata:{
          interview_purchase_id:purchase.id,
          purchase_token:purchaseToken,
          offer_key:INTERVIEW_OFFER.offer_key,
          access_days:INTERVIEW_OFFER.access_days,
          action_limit:INTERVIEW_OFFER.action_limit
        }
      });
      const updated=this.entityStore.update(this.appKey,'InterviewPurchase',purchase.id,{
        payment_status:'checkout_started',
        payment_checkout_id:String(checkout.id)
      }).record;
      return {
        ok:true,
        purchase_token:purchaseToken,
        checkout_url:String(checkout.url),
        checkout_id:String(checkout.id),
        amount_cents:INTERVIEW_OFFER.amount_minor,
        currency:'USD',
        purchase:updated,
        payment_verified:false,
        payment_created:false,
        explicit_confirmation_observed:true
      };
    }catch(error){
      this.entityStore.update(this.appKey,'InterviewPurchase',purchase.id,{
        payment_status:'checkout_failed',
        checkout_error_code:clean(error?.message||error,240)
      });
      throw error;
    }
  }

  #purchase(entity,purchaseToken){
    const found=this.entityStore.filter(this.appKey,entity,{purchase_token:clean(purchaseToken,200)},{limit:2});
    if(found.length!==1) throw new Error(found.length?'purchase_token_ambiguous':'purchase_not_found');
    return found[0];
  }

  async verifyWorkforcePayment({purchaseToken}={}){
    const purchase=this.#purchase('WorkforcePurchase',purchaseToken);
    if(purchase.payment_status==='paid'){
      return {ok:true,paid:true,purchase,verification_replayed:true};
    }
    const checkoutId=clean(purchase.payment_checkout_id,200);
    if(!checkoutId) throw new Error('purchase_checkout_missing');

    const verified=await this.commerceBoundary.verifyPayment({
      appKey:this.appKey,
      provider:'polar',
      paymentRef:checkoutId,
      expected:{amount_minor:Number(purchase.amount_cents),currency:'USD'},
      context:{
        expected_metadata:{
          workforce_purchase_id:purchase.id,
          purchase_token:purchase.purchase_token,
          offer_key:purchase.offer_key
        },
        expected_customer_email:purchase.customer_email
      }
    });

    const updated=this.entityStore.update(this.appKey,'WorkforcePurchase',purchase.id,{
      payment_status:'paid',
      payment_verified_at:at(this.clock()),
      commerce_verification_hash:verified.payment.verification_hash
    }).record;
    return {
      ok:true,
      paid:true,
      purchase:updated,
      commerce_verification_hash:verified.payment.verification_hash,
      provider_authoritative:true
    };
  }

  async verifyInterviewPayment({purchaseToken}={}){
    const purchase=this.#purchase('InterviewPurchase',purchaseToken);
    if(purchase.payment_status==='paid'){
      return {ok:true,paid:true,purchase,verification_replayed:true};
    }
    const checkoutId=clean(purchase.payment_checkout_id,200);
    if(!checkoutId) throw new Error('purchase_checkout_missing');

    const verified=await this.commerceBoundary.verifyPayment({
      appKey:this.appKey,
      provider:'polar',
      paymentRef:checkoutId,
      expected:{amount_minor:Number(purchase.amount_cents),currency:'USD'},
      context:{
        expected_metadata:{
          interview_purchase_id:purchase.id,
          purchase_token:purchase.purchase_token,
          offer_key:purchase.offer_key
        },
        expected_customer_email:purchase.customer_email
      }
    });
    const expiresAt=new Date(
      this.clock().getTime()+INTERVIEW_OFFER.access_days*24*60*60*1000
    ).toISOString();
    const updated=this.entityStore.update(this.appKey,'InterviewPurchase',purchase.id,{
      payment_status:'paid',
      payment_verified_at:at(this.clock()),
      commerce_verification_hash:verified.payment.verification_hash,
      access_expires_at:expiresAt
    }).record;
    return {
      ok:true,
      paid:true,
      purchase:updated,
      access_expires_at:expiresAt,
      commerce_verification_hash:verified.payment.verification_hash,
      provider_authoritative:true
    };
  }

  health(){
    return {
      schema:'evercraft.workforce.commerce-health.v1',
      state:'healthy',
      public_origin:this.publicOrigin,
      public_origin_base44:false,
      provider:'polar',
      checkout_requires_explicit_confirmation:true,
      paid_state_requires_commerce_boundary:true,
      provider_authoritative_payment:true,
      legacy_credential_copy_allowed:false
    };
  }
}

export { WORKFORCE_OFFERS, INTERVIEW_OFFER };
