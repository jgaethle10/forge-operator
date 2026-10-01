import { createStripeWebhookVerifier } from '../webhook-gateway/provider-verifiers.mjs';

export const AUDIT_TIERS=Object.freeze({
  quick:{amount_minor:4900,price_id:'',label:'Systemia Quick Win Audit'},
  complete:{amount_minor:50000,price_id:'price_1TzTudBoJA1hSFafuGYpy5T0',label:'Systemia Complete Audit'},
  patch:{amount_minor:120000,price_id:'price_1TzTudBoJA1hSFafxwRKZW46',label:'Systemia Audit + Patch'}
});
export const AUDIT_PUBLIC_ID='audit-center-website-audit-machine-v1';

function clean(value,max=4000){ return String(value??'').trim().slice(0,max); }
function httpsOrigin(value){
  const url=new URL(clean(value,2000));
  if(url.protocol!=='https:'||url.username||url.password) throw new Error('audit_public_origin_invalid');
  const host=url.hostname.toLowerCase();
  if(host==='base44.app'||host.endsWith('.base44.app')) throw new Error('audit_public_origin_base44_forbidden');
  return url.origin;
}
function normalizeDomain(input){
  let value=clean(input,1000);
  if(!value) return '';
  if(!/^https?:\/\//i.test(value)) value='https://'+value;
  try{return new URL(value).hostname.replace(/^www\./,'');}catch{return '';}
}
function requireConfirmed(value){
  if(value!==true) throw new Error('checkout_explicit_confirmation_required');
}
function journey(value){
  const text=clean(value,80);
  return /^ps_[a-f0-9]{32}$/.test(text)?text:'';
}
function exactOne(rows,label){
  if(!Array.isArray(rows)||rows.length!==1) throw new Error(rows?.length?'audit_order_ambiguous':label+'_not_found');
  return rows[0];
}

export class EvercraftAuditCommerce {
  constructor({
    appKey='systemia-audit-center',
    entityStore,
    stripeClient,
    commerceBoundary,
    publicOrigin,
    acquisitionSink=null,
    clock=()=>new Date()
  }={}){
    if(!entityStore) throw new Error('audit_entity_store_required');
    if(!stripeClient||typeof stripeClient.createCheckoutSession!=='function'||typeof stripeClient.retrieveCheckoutSession!=='function'){
      throw new Error('audit_stripe_client_required');
    }
    if(!commerceBoundary||typeof commerceBoundary.verifyPayment!=='function'){
      throw new Error('audit_commerce_boundary_required');
    }
    this.appKey=clean(appKey,127);
    this.entityStore=entityStore;
    this.stripeClient=stripeClient;
    this.commerceBoundary=commerceBoundary;
    this.publicOrigin=httpsOrigin(publicOrigin);
    this.acquisitionSink=typeof acquisitionSink==='function'?acquisitionSink:null;
    this.clock=clock;
  }

  #tier(key){
    const tierKey=clean(key,40);
    const config=AUDIT_TIERS[tierKey];
    if(!config) throw new Error('audit_tier_invalid');
    return {tierKey,config};
  }

  async createCheckout({
    tier,
    domain='',
    referralCode='',
    acquisitionSource='',
    campaignKey='',
    journeyBucket='',
    confirmedByUser=false
  }={}){
    requireConfirmed(confirmedByUser);
    const {tierKey,config}=this.#tier(tier);
    const normalizedDomain=normalizeDomain(domain);
    if(tierKey==='quick'&&!normalizedDomain) throw new Error('audit_domain_required');

    const order=this.entityStore.create(this.appKey,'PaidAuditOrder',{
      tier:tierKey,
      status:'checkout_preparing',
      referral_code:clean(referralCode,80),
      acquisition_source:clean(acquisitionSource,80),
      campaign_key:clean(campaignKey,120),
      domain:normalizedDomain,
      amount_cents:config.amount_minor,
      currency:'USD',
      payment_provider:'stripe'
    }).record;

    const params={
      mode:'payment',
      'line_items[0][quantity]':'1',
      success_url:this.publicOrigin+'/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url:this.publicOrigin+'/',
      'metadata[audit_order_id]':order.id,
      'metadata[tier]':tierKey
    };
    if(config.price_id){
      params['line_items[0][price]']=config.price_id;
    }else{
      params['line_items[0][price_data][currency]']='usd';
      params['line_items[0][price_data][unit_amount]']=String(config.amount_minor);
      params['line_items[0][price_data][product_data][name]']=config.label;
    }
    if(order.referral_code) params['metadata[referral_code]']=order.referral_code;
    if(order.acquisition_source) params['metadata[acquisition_source]']=order.acquisition_source;
    if(order.campaign_key) params['metadata[campaign_key]']=order.campaign_key;
    if(normalizedDomain) params['metadata[domain]']=normalizedDomain;
    const bucket=journey(journeyBucket);
    if(bucket) params['metadata[evercraft_journey]']=bucket;

    try{
      const session=await this.stripeClient.createCheckoutSession(params);
      if(!session?.id||!session?.url) throw new Error('stripe_checkout_create_failed');
      const updated=this.entityStore.update(this.appKey,'PaidAuditOrder',order.id,{
        stripe_session_id:String(session.id),
        status:'pending_payment'
      }).record;

      let acquisitionState='not_requested';
      if(bucket&&this.acquisitionSink){
        try{
          await this.acquisitionSink({
            event_type:'checkout_started',
            offer_id:AUDIT_PUBLIC_ID,
            journey_bucket:bucket,
            destination_url:String(session.url),
            audit_order_id:order.id
          });
          acquisitionState='recorded';
        }catch{
          acquisitionState='deferred';
        }
      }else if(bucket){
        acquisitionState='deferred';
      }

      return {
        ok:true,
        url:String(session.url),
        session_id:String(session.id),
        tier:tierKey,
        amount_cents:config.amount_minor,
        currency:'USD',
        order:updated,
        acquisition_state:acquisitionState,
        explicit_confirmation_observed:true,
        payment_verified:false
      };
    }catch(error){
      this.entityStore.update(this.appKey,'PaidAuditOrder',order.id,{
        status:'checkout_failed',
        checkout_error_code:clean(error?.message||error,240)
      });
      throw error;
    }
  }

  #orderBySession(sessionId){
    return exactOne(
      this.entityStore.filter(this.appKey,'PaidAuditOrder',{stripe_session_id:clean(sessionId,255)},{limit:2}),
      'audit_order'
    );
  }

  async verifyPaidAudit({sessionId}={}){
    const order=this.#orderBySession(sessionId);
    const {config}=this.#tier(order.tier);
    if(order.status==='paid_needs_intake'||order.status==='paid'){
      return {verified:true,order_id:order.id,tier:order.tier,replayed:true,order};
    }

    const verified=await this.commerceBoundary.verifyPayment({
      appKey:this.appKey,
      provider:'stripe',
      paymentRef:clean(sessionId,255),
      expected:{amount_minor:config.amount_minor,currency:'USD'},
      context:{
        expected_tier:order.tier,
        expected_metadata:{
          audit_order_id:order.id,
          tier:order.tier
        }
      }
    });

    const session=await this.stripeClient.retrieveCheckoutSession(sessionId,{expandLineItems:false});
    const customerEmail=clean(session.customer_details?.email||session.customer_email,320);
    const updated=this.entityStore.update(this.appKey,'PaidAuditOrder',order.id,{
      status:'paid_needs_intake',
      customer_email:customerEmail,
      amount_paid:Number(verified.payment.amount_minor)/100,
      paid_at:this.clock().toISOString(),
      commerce_verification_hash:verified.payment.verification_hash
    }).record;

    return {
      verified:true,
      order_id:updated.id,
      tier:updated.tier,
      email:customerEmail,
      order:updated,
      provider_authoritative:true,
      commerce_verification_hash:verified.payment.verification_hash
    };
  }

  registerStripeWebhook(webhookGateway,{
    routeKey='stripe',
    secretNamespace='webhook:systemia-audit-center:stripe',
    secretName='signing-secret'
  }={}){
    if(!webhookGateway||typeof webhookGateway.registerRoute!=='function'){
      throw new Error('audit_webhook_gateway_required');
    }
    webhookGateway.registerRoute({
      appKey:this.appKey,
      routeKey,
      secretNamespace,
      secretName,
      verifier:createStripeWebhookVerifier(),
      handler:async ({body,verificationMetadata})=>{
        const event=JSON.parse(body.toString('utf8'));
        if(verificationMetadata?.event_type!=='checkout.session.completed'){
          return {accepted:true,action:'ignored_non_checkout_completion'};
        }
        const sessionId=clean(event?.data?.object?.id,255);
        if(!sessionId) throw new Error('stripe_webhook_session_id_required');
        const result=await this.verifyPaidAudit({sessionId});
        return {
          accepted:true,
          action:'provider_verified_paid_audit',
          order_id:result.order_id,
          verification_hash:result.commerce_verification_hash||result.order?.commerce_verification_hash||null
        };
      }
    });
    return this;
  }

  health(){
    return {
      schema:'evercraft.audit-center.commerce-health.v1',
      state:'healthy',
      public_origin:this.publicOrigin,
      public_origin_base44:false,
      checkout_requires_explicit_confirmation:true,
      webhook_can_trigger_verification:true,
      webhook_can_self_assert_paid:false,
      provider_authoritative_payment:true,
      tier_count:Object.keys(AUDIT_TIERS).length
    };
  }
}
