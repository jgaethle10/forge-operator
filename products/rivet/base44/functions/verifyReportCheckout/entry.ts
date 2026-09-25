import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BROKER_APP_ID='692536fdd7bfe083fc4086fa';
const clean=(v:any,max=500)=>String(v??'').trim().slice(0,max);
const nowIso=()=>new Date().toISOString();
async function first(sr:any,entity:string,query:any,sort='-updated_date'){const rows=await sr.entities[entity].filter(query,sort,20).catch(()=>[]);return rows?.[0]||null;}

Deno.serve(async(req)=>{
  try{
    if(req.method!=='POST')return Response.json({ok:false,error:'POST required'},{status:405});
    const base44=createClientFromRequest(req);const sr:any=base44.asServiceRole;
    const user:any=await base44.auth.me().catch(()=>null);
    if(!user?.id||!user?.email)return Response.json({ok:false,error:'Authentication required'},{status:401});
    const userEmail=clean(user.email,254).toLowerCase();
    const body=await req.json().catch(()=>({}));
    const purchaseKey=clean(body.purchase_key,180);const sessionId=clean(body.stripe_session_id||body.session_id,220);
    if(!purchaseKey||!sessionId.startsWith('cs_'))return Response.json({ok:false,error:'purchase_and_session_required'},{status:400});
    const purchase=await first(sr,'RIVETPurchase',{purchase_key:purchaseKey});
    if(!purchase)return Response.json({ok:false,error:'purchase_not_found'},{status:404});
    if(clean(purchase.buyer_email,254).toLowerCase()!==userEmail)return Response.json({ok:false,error:'purchase_owner_mismatch'},{status:403});
    if(purchase.provider_checkout_session_id&&purchase.provider_checkout_session_id!==sessionId)return Response.json({ok:false,error:'checkout_session_mismatch'},{status:409});
    if(purchase.status==='paid'&&purchase.report_id)return Response.json({ok:true,payment_verified:true,purchase_key:purchaseKey,status:'paid',report_id:purchase.report_id,already_verified:true});

    const vr=await fetch(`https://base44.app/api/apps/${BROKER_APP_ID}/functions/verifyRivetCheckoutBroker`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stripe_session_id:sessionId,order_id:purchaseKey,offer_key:purchase.offer_key})
    });
    const verification=await vr.json().catch(()=>({}));
    if(!vr.ok||verification?.payment_confirmed!==true)return Response.json({ok:true,payment_verified:false,status:'pending',verification_error:verification?.error||'not_verified'},{headers:{'Cache-Control':'no-store'}});
    const paidEmail=clean(verification.customer_email||purchase.buyer_email,254).toLowerCase();
    if(paidEmail!==userEmail)return Response.json({ok:false,error:'checkout_email_mismatch'},{status:409});

    const verifiedAt=verification.verified_at||nowIso();
    let report=await first(sr,'RIVETReport',{purchase_key:purchaseKey});
    if(!report){
      const reportKey=`rivet-report-${crypto.randomUUID()}`;
      report=await sr.entities.RIVETReport.create({
        report_key:reportKey,customer_email:userEmail,purchase_key:purchaseKey,payment_status:'paid',payment_verified_at:verifiedAt,
        report_price_usd:Number(purchase.amount_usd||495),customer_visible:true,
        address:purchase.requested_address,report_type:'preliminary_site_opportunity',
        title:`RIVET EV Site Report · ${purchase.requested_address}`,status:'draft',priority:'normal',
        top_drivers:[],evidence_refs:[],source_notes:'',core_work_ref:purchaseKey,generation_state:'not_started',
        detailed_report_state:'not_requested',aliev_source_status:'not_requested',aliev_app_id:'69b9b64d86a732029ce0db81',
        created_at:verifiedAt,updated_at:verifiedAt
      });
    }
    await sr.entities.RIVETPurchase.update(purchase.id,{status:'paid',paid_at:purchase.paid_at||verifiedAt,updated_at:nowIso(),report_id:report.id,report_key:report.report_key});
    const checkout=await first(sr,'RIVETBrokerCheckout',{stripe_session_id:sessionId});
    if(checkout)await sr.entities.RIVETBrokerCheckout.update(checkout.id,{status:'payment_verified',verified_at:verifiedAt,customer_email:userEmail});
    return Response.json({ok:true,payment_verified:true,purchase_key:purchaseKey,status:'paid',report_id:report.id,report_key:report.report_key,verified_at:verifiedAt},{headers:{'Cache-Control':'no-store'}});
  }catch(error){console.error('RIVET checkout verification failed',error);return Response.json({ok:false,error:'RIVET could not verify this checkout right now.'},{status:500});}
});