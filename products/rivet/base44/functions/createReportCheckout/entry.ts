import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BROKER_APP_ID='692536fdd7bfe083fc4086fa';
const OFFER={key:'rivet_report_495',name:'RIVET EV Site Report · Single Site',amount_usd:495};
const clean=(v:any,max=500)=>String(v??'').trim().slice(0,max);
const nowIso=()=>new Date().toISOString();
function allowedOrigin(v:string){try{const u=new URL(v);if(u.protocol!=='https:')return'';if(u.hostname.endsWith('.base44.app')||u.hostname.endsWith('.evercraft.ai'))return u.origin;return''}catch{return''}}

Deno.serve(async(req)=>{
  try{
    if(req.method!=='POST')return Response.json({ok:false,error:'POST required'},{status:405});
    const base44=createClientFromRequest(req);const sr:any=base44.asServiceRole;
    const user:any=await base44.auth.me().catch(()=>null);
    if(!user?.id||!user?.email)return Response.json({ok:false,error:'Authentication required'},{status:401});
    const body=await req.json().catch(()=>({}));
    const requestedAddress=clean(body.requested_address,500);
    if(!requestedAddress)return Response.json({ok:false,error:'requested_address required'},{status:400});
    const returnOrigin=allowedOrigin(clean(body.return_origin||req.headers.get('x-base44-app-url'),500));
    if(!returnOrigin)return Response.json({ok:false,error:'invalid_return_origin'},{status:400});
    const buyerEmail=clean(user.email,254).toLowerCase();
    const purchaseKey=`rivet-report-purchase:${crypto.randomUUID()}`;
    const createdAt=nowIso();
    const purchase=await sr.entities.RIVETPurchase.create({
      purchase_key:purchaseKey,offer_key:OFFER.key,offer_name:OFFER.name,buyer_email:buyerEmail,
      requested_address:requestedAddress,amount_usd:OFFER.amount_usd,currency:'USD',billing_mode:'payment',
      status:'pending',provider:'stripe',source:'customer_self_service',referral_code:clean(body.referral_code,120),
      created_at:createdAt,updated_at:createdAt,
      notes:'Pending RIVET report purchase created before shared Stripe checkout. Browser return is not payment authority.'
    });
    const brokerRes=await fetch(`https://base44.app/api/apps/${BROKER_APP_ID}/functions/createRivetCheckoutBroker`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        offer_key:OFFER.key,order_id:purchaseKey,requested_address:requestedAddress,customer_email:buyerEmail,
        return_origin:returnOrigin,
        success_path:`/?payment=broker_processing&purchase_key=${encodeURIComponent(purchaseKey)}`,
        cancel_path:`/?payment=cancelled&purchase_key=${encodeURIComponent(purchaseKey)}`,
        distribution_source:'rivet_reporting_portal',distribution_medium:'self_service',
        referral_code:clean(body.referral_code,120),landing_path:clean(body.landing_path,500),referrer:clean(body.referrer,500)
      })
    });
    const data=await brokerRes.json().catch(()=>({}));
    if(!brokerRes.ok||!data?.ok||!data?.session_id||!data?.checkout_url){
      await sr.entities.RIVETPurchase.update(purchase.id,{status:'failed',updated_at:nowIso(),notes:'Shared Stripe checkout creation failed. No report access granted.'}).catch(()=>null);
      return Response.json({ok:false,error:data?.error||'checkout_creation_failed'},{status:502});
    }
    await sr.entities.RIVETPurchase.update(purchase.id,{provider_checkout_session_id:data.session_id,updated_at:nowIso()});
    await sr.entities.RIVETBrokerCheckout.create({
      checkout_key:`rivet-report-checkout:${data.session_id}`,purchase_key:purchaseKey,offer_key:OFFER.key,
      requested_address:requestedAddress,stripe_session_id:data.session_id,checkout_url:data.checkout_url,
      amount_usd:OFFER.amount_usd,status:'checkout_created',customer_email:buyerEmail,created_at:createdAt,
      evidence_ref:`stripe_checkout:${data.session_id}`
    });
    return Response.json({ok:true,purchase_key:purchaseKey,checkout_session_id:data.session_id,checkout_url:data.checkout_url,amount_usd:OFFER.amount_usd,currency:'USD',payment_state:'pending',authoritative_access_granted:false},{headers:{'Cache-Control':'no-store'}});
  }catch(error){console.error('RIVET checkout creation failed',error);return Response.json({ok:false,error:'RIVET could not start checkout right now.'},{status:500});}
});