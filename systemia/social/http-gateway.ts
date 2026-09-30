import type { Express, Request, Response } from 'express';
import { facebookProviderReadiness, resolveFacebookPage } from './facebook-provider.mjs';
import { createSocialStore } from './store.mjs';
import { runEpsFacebookContinuity } from './eps-continuity.mjs';

function bearer(req:Request){
  const auth=String(req.get('authorization')||'').trim();
  return auth.startsWith('Bearer ')?auth.slice(7):'';
}
function operatorAuthorized(req:Request){
  const expected=String(process.env.SOCIAL_PROVIDER_OPERATOR_TOKEN||'').trim();
  return Boolean(expected && bearer(req)===expected);
}

export function registerSocialProviderGateway(app:Express){
  const store=createSocialStore({
    stateDir:process.env.SOCIAL_STATE_DIR || undefined
  });
  const tokenMatches=(req:Request,name:string)=>{
    const expected=String(process.env[name]||'').trim();
    return Boolean(expected && bearer(req)===expected);
  };
  app.get('/api/social/providers/health',(_req:Request,res:Response)=>{
    res.setHeader('Cache-Control','no-store');
    res.json({
      ok:true,
      runtime:'yard_evercraft_compute',
      providers:{facebook:facebookProviderReadiness()},
      social_store:store.snapshot(),
      continuity_ingress_configured:Boolean(String(process.env.SOCIAL_CONTINUITY_TOKEN||'').trim()),
      ingest_configured:Boolean(String(process.env.SOCIAL_INGEST_TOKEN||'').trim()),
      publication_authority:'provider_specific_fail_closed',
      base44_runtime_required:false
    });
  });

  app.post('/api/social/packages',async(req:Request,res:Response)=>{
    if(!tokenMatches(req,'SOCIAL_INGEST_TOKEN')){
      res.status(401).json({ok:false,error:'social_ingest_authorization_required'});
      return;
    }
    try{
      const pkg=await store.upsertPackage(req.body?.package || req.body || {});
      let queue=null;
      if(req.body?.queue){
        queue=await store.enqueue({
          ...req.body.queue,
          package_id:pkg.id
        });
      }
      res.status(201).json({
        ok:true,
        state:'owned_social_package_recorded',
        package:pkg,
        queue,
        base44_runtime_used:false
      });
    }catch(error){
      res.status(400).json({ok:false,error:error instanceof Error?error.message:String(error)});
    }
  });

  app.post('/api/social/eps/continuity',async(req:Request,res:Response)=>{
    if(!tokenMatches(req,'SOCIAL_CONTINUITY_TOKEN')){
      res.status(401).json({ok:false,error:'social_continuity_authorization_required'});
      return;
    }
    const action=String(req.body?.action||'').trim();
    if(action && action!=='publish_due_eps_facebook'){
      res.status(400).json({ok:false,error:'unsupported_social_continuity_action'});
      return;
    }
    try{
      const result=await runEpsFacebookContinuity({
        store,
        pageId:process.env.META_EPS_PAGE_ID || '',
        userAccessToken:process.env.META_USER_ACCESS_TOKEN || '',
        publishEnabled:String(process.env.EVERCRAFT_FACEBOOK_PUBLISH_ENABLED||'').toLowerCase()==='true'
      });
      res.status(result.ok?200:(result.held?409:502)).json({
        ...result,
        runtime:'yard_evercraft_compute',
        source_store:'owned_social_store',
        base44_runtime_used:false
      });
    }catch(error){
      res.status(500).json({ok:false,error:error instanceof Error?error.message:String(error),base44_runtime_used:false});
    }
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
