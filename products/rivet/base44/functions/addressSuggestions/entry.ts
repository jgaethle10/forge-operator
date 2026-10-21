const ALIEV_APP_ID='69b9b64d86a732029ce0db81';
const URL='https://base44.app/api/apps/'+ALIEV_APP_ID+'/functions/addressSuggestions';

Deno.serve(async(req)=>{
  try{
    if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
    const body=await req.json().catch(()=>({}));
    const q=String(body?.q||'').trim().slice(0,200);
    if(q.length<3)return Response.json({query:q,suggestions:[],status:'too_short',source_engine:'RIVET'});
    const auth=req.headers.get('authorization')||'';
    if(!auth)return Response.json({error:'Authentication required'},{status:401});
    const headers:Record<string,string>={
      'Content-Type':'application/json',
      'Accept':'application/json',
      'X-App-Id':ALIEV_APP_ID,
      'User-Agent':'RIVET-Reporting/1.0'
    };
    headers.Authorization=auth;
    const response=await fetch(URL,{method:'POST',headers,body:JSON.stringify({q})});
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(String(data?.error||response.statusText||response.status));
    return Response.json({...data,source_engine:'RIVET'},{headers:{'Cache-Control':'no-store'}});
  }catch(e){
    console.error('RIVET address source lookup failed',e); return Response.json({error:'Address lookup is temporarily unavailable.',suggestions:[],status:'provider_error',source_engine:'RIVET'},{status:502});
  }
});