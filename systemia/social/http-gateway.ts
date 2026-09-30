import type { Express, Request, Response } from 'express';
import { facebookProviderReadiness, resolveFacebookPage } from './facebook-provider.mjs';

function bearer(req:Request){
  const auth=String(req.get('authorization')||'').trim();
  return auth.startsWith('Bearer ')?auth.slice(7):'';
}
function operatorAuthorized(req:Request){
  const expected=String(process.env.SOCIAL_PROVIDER_OPERATOR_TOKEN||'').trim();
  return Boolean(expected && bearer(req)===expected);
}

export function registerSocialProviderGateway(app:Express){
  app.get('/api/social/providers/health',(_req:Request,res:Response)=>{
    res.setHeader('Cache-Control','no-store');
    res.json({
      ok:true,
      runtime:'yard_evercraft_compute',
      providers:{facebook:facebookProviderReadiness()},
      publication_authority:'provider_specific_fail_closed'
    });
  });

  app.post('/api/social/providers/facebook/identity-canary',async(req:Request,res:Response)=>{
    if(!operatorAuthorized(req)){
      res.status(401).json({ok:false,error:'social_provider_operator_authorization_required'});
      return;
    }
    const readiness=facebookProviderReadiness();
    if(!readiness.ready_for_identity_canary){
      res.status(503).json({ok:false,error:'facebook_provider_credentials_not_configured',readiness});
      return;
    }
    try{
      const page=await resolveFacebookPage({
        userAccessToken:process.env.META_USER_ACCESS_TOKEN,
        pageId:req.body?.page_id || process.env.META_EPS_PAGE_ID,
        graphVersion:process.env.META_GRAPH_VERSION || 'v23.0'
      });
      res.json({
        ok:true,
        state:'facebook_page_identity_verified',
        provider:'facebook',
        page:{id:page.page_id,name:page.page_name,tasks:page.tasks},
        create_content_authorized:page.create_content_authorized,
        token_returned:false,
        publish_attempted:false,
        base44_connector_used:false
      });
    }catch(error){
      res.status(502).json({ok:false,error:error instanceof Error?error.message:String(error)});
    }
  });
}
