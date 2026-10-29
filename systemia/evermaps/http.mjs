import {createOwnedWfigsService} from './incident-source.mjs';
import {createOwnedHoodPondService} from './hood-pond-evidence.mjs';
// Canonical Forge-owned, read-only source routes. No Base44 host, entities or SDK.
export function registerEvermapsIncidentRoutes(app,{
 service=createOwnedWfigsService(),
 environmentalService=createOwnedHoodPondService(),
 publicLimiter=(_req,_res,next)=>next()
}={}){
 app.get('/api/evermaps/source-health',(_req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.status(200).json(service.health());
 });
 app.get('/api/evermaps/incidents/pnw',publicLimiter,async(_req,res)=>{
  try{
   const payload=await service.read();
   res.setHeader('Cache-Control','public, max-age=60, must-revalidate');
   res.status(200).json(payload);
  }catch(error){
   res.setHeader('Cache-Control','no-store');
   res.status(503).json({
    schema:'evercraft.evermaps.incident-observations.v1',
    status:'SOURCE_UNAVAILABLE',
    count:null,records:[],
    source:'NIFC WFIGS',
    details:'Authoritative data cannot be confirmed at this time.',
    active_burning_status:'NOT_VERIFIED',
    safety:'Do not use this API for wildfire entry, evacuation or route clearance.'
   });
  }
 });
 app.get('/api/evermaps/events/mount-hood-pond',publicLimiter,async(_req,res)=>{
  try{
   const payload=await environmentalService.read();
   res.setHeader('Cache-Control','public, max-age=60, must-revalidate');
   res.status(200).json(payload);
  }catch(_error){
   res.setHeader('Cache-Control','no-store');
   res.status(503).json({
    schema:'evercraft.evermaps.environmental-event-evidence.v1',
    event_id:'usgs-hood-coalman-pond-2026',
    status:'SOURCE_UNAVAILABLE',
    source:'USGS CVO HANS',
    source_url:'https://volcanoes.usgs.gov/hans-public/volcano/cas',
    current_notice:null,
    details:'Official current status cannot be checked. Do not infer conditions from a historical bulletin.',
    safety:'Not an emergency alert or evacuation decision.'
   });
  }
 });
 return service;
}
