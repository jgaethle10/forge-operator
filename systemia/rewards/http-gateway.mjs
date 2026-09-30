import path from 'node:path';
import { createRewardsStore } from './store.mjs';

function clean(value){ return String(value ?? '').trim(); }
function authorized(req,token){ return clean(req.headers.authorization) === 'Bearer '+token; }

export function registerRewardsGateway(app,{
  gatewayToken=process.env.REWARDS_GATEWAY_TOKEN || '',
  stateDir=process.env.REWARDS_STATE_DIR || path.join('/tmp','evercraft-rewards'),
  store=createRewardsStore({stateDir})
}={}){
  app.get('/api/rewards/health',(_req,res)=>{
    res.setHeader('cache-control','no-store');
    res.json({
      ...store.health(),
      runtime:'Forge/Yard',
      configured:Boolean(clean(gatewayToken)),
      migration_state:'owned_scratch_runtime_ready_for_canary',
      legacy_base44_write_authority:false
    });
  });

  app.post('/api/rewards/profile',(req,res)=>{
    if(!clean(gatewayToken)){
      res.status(503).json({ok:false,error:'rewards_gateway_not_configured'});
      return;
    }
    if(!authorized(req,gatewayToken)){
      res.status(401).json({ok:false,error:'rewards_gateway_authorization_required'});
      return;
    }
    try{
      const profile=store.getScratchProfile({
        subject:req.body?.subject,
        timeZone:req.body?.timezone
      });
      res.setHeader('cache-control','no-store');
      res.json({ok:true,profile});
    }catch(error){
      res.status(400).json({ok:false,error:error instanceof Error?error.message:String(error)});
    }
  });

  app.post('/api/rewards/scratch/play',async(req,res)=>{
    if(!clean(gatewayToken)){
      res.status(503).json({ok:false,error:'rewards_gateway_not_configured'});
      return;
    }
    if(!authorized(req,gatewayToken)){
      res.status(401).json({ok:false,error:'rewards_gateway_authorization_required'});
      return;
    }
    try{
      const result=await store.playScratch({
        subject:req.body?.subject,
        runKey:req.body?.run_key,
        themeKey:req.body?.theme_key,
        timeZone:req.body?.timezone
      });
      res.status(result.already_recorded?200:201).json(result);
    }catch(error){
      res.status(400).json({ok:false,error:error instanceof Error?error.message:String(error)});
    }
  });
}
