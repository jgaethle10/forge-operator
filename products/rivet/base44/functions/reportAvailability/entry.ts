const ALIEV_APP_ID='69b9b64d86a732029ce0db81';
const URL='https://base44.app/api/apps/'+ALIEV_APP_ID+'/functions/energySiteLookup';
const clean=(v:any,max=500)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);

Deno.serve(async(req)=>{
  try{
    if(req.method!=='POST')return Response.json({ok:false,error:'POST required'},{status:405});
    const auth=req.headers.get('authorization')||'';
    if(!auth)return Response.json({ok:false,error:'Authentication required'},{status:401});
    const body=await req.json().catch(()=>({}));
    const address=clean(body?.address,500);
    if(address.length<5)return Response.json({ok:false,available:false,error:'A complete address is required.'},{status:400});
    const response=await fetch(URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':auth,'X-App-Id':ALIEV_APP_ID,'User-Agent':'RIVET-Reporting/1.0'},
      body:JSON.stringify({address})
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok)return Response.json({ok:true,available:false,address_input:address,reason:'RIVET could not confirm reporting coverage for this address yet.'},{headers:{'Cache-Control':'no-store'}});
    const lat=Number(data?.latitude),lon=Number(data?.longitude);
    const available=Boolean(clean(data?.matched_address||data?.address_input)&&Number.isFinite(lat)&&Number.isFinite(lon));
    return Response.json({
      ok:true,available,address_input:address,matched_address:clean(data?.matched_address||data?.address_input),
      state:clean(data?.state),postal_code:clean(data?.postal_code),country_code:clean(data?.country_code),
      reason:available?'RIVET can build a site report for this resolved address.':'RIVET could not resolve enough location evidence to sell a report yet.',
      price_usd:495,offer_key:'rivet_report_495'
    },{headers:{'Cache-Control':'no-store'}});
  }catch(error){console.error('RIVET availability check failed',error);return Response.json({ok:false,available:false,error:'RIVET could not check this address right now.'},{status:500});}
});