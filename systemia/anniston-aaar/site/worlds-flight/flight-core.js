/* AAAR Worlds Flight Range core v0.5. Entertainment/simulation training only.
 * Designed for reproducible browser preview, not CFD, avionics, or certification.
 * This file contains no networking or hardware interfaces.
 */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.AAARFlight=api;})(typeof globalThis==='undefined'?null:globalThis,function(){
'use strict';
const PI=Math.PI, DEG=180/PI, RAD=PI/180;
const Foundry=typeof globalThis!=='undefined'&&globalThis.AAARFoundry?globalThis.AAARFoundry:(typeof require==='function'?require('./foundry-core.js'):null);
const aircraft={
  trainer:{id:'trainer',name:'A-01 Kestrel',kind:'Light trainer',cruise:55,stall:25,maxSpeed:83,accel:12.5,drag:.0031,bankRate:1.00,pitchRate:.60,skin:'#f8ad79'},
  glider:{id:'glider',name:'A-02 Albatross',kind:'Sailplane',cruise:34,stall:17,maxSpeed:54,accel:1.4,drag:.0011,bankRate:.69,pitchRate:.43,skin:'#d1e9f1'},
  jet:{id:'jet',name:'A-03 Peregrine',kind:'Fast experimental',cruise:118,stall:49,maxSpeed:185,accel:42,drag:.0027,bankRate:1.16,pitchRate:.78,skin:'#e6dfd3'}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function start(kind='trainer',design=null){
 if(kind==='custom'){if(!Foundry)throw Error('Aircraft Foundry model missing');return Foundry.startState(design);}
 const p=aircraft[kind]||aircraft.trainer;
 return {schema:'evercraft.aaar.worlds-flight-state.v1',craft:p.id,x:0,y:280,z:-740,
  yaw:0,pitch:0,bank:0,path:0,speed:p.cruise,throttle:p.id==='glider'?0:.68,
  flightTime:0,distance:0,maxAlt:280,maxSpeed:p.cruise,checkpoints:0,events:[],paused:false,condition:'FLYING',track:[]};
}
function groundHeight(x,z){
 // Stylized *synthetic* scenery, no real elevation or terrain engineering.
 const ridge=Math.max(0,(Math.abs(x)-950)/1900),wave=Math.sin(x/235)*Math.cos(z/330)*12+Math.sin(x/1150+z/840)*19;
 return -8+wave+ridge*ridge*580+Math.max(0,Math.abs(z)-4300)/5000*190;
}
const gates=[{x:0,y:285,z:380,title:'RUNWAY DEPARTURE'},{x:220,y:330,z:1450,title:'RIDGE TRANSIT'},{x:-230,y:385,z:2900,title:'HIGH-VALLEY PASS'}];
function step(s,input,dt){
 if(!s||!(aircraft[s.craft]||s.craft==='custom'&&s.design))throw new Error('Unsupported aircraft');
 if(s.paused||s.condition!=='FLYING')return s;
 dt=clamp(Number(dt)||0,0,.05);
 if(s.craft==='custom'){
  Foundry.stepPhysics(s,input||{},dt);
  if(s.y<=groundHeight(s.x,s.z)+4){s.y=groundHeight(s.x,s.z)+4;s.condition='GROUND_CONTACT';s.events.push({kind:'ground_contact',at:+s.flightTime.toFixed(1)});}
  const next=gates[s.checkpoints];if(next&&Math.hypot(s.x-next.x,s.y-next.y,s.z-next.z)<80){s.checkpoints++;s.events.push({kind:'gate',index:s.checkpoints,title:next.title,at:+s.flightTime.toFixed(1)});}
  if(Math.floor(s.flightTime*2)>s.track.length&&s.track.length<1200)s.track.push({x:Math.round(s.x),y:Math.round(s.y),z:Math.round(s.z),at:+s.flightTime.toFixed(1)});
  return s;
 }
 const p=aircraft[s.craft],a=input||{};
 const pitch=clamp(Number(a.pitch)||0,-1,1),bank=clamp(Number(a.bank)||0,-1,1),rudder=clamp(Number(a.rudder)||0,-1,1);
 s.throttle=clamp(s.throttle+clamp(Number(a.throttle)||0,-1,1)*.34*dt,0,1);
 s.pitch=clamp(s.pitch+pitch*p.pitchRate*dt,-.48,.54);
 s.bank=clamp(s.bank+bank*p.bankRate*dt,-1.15,1.15);
 // Banks self-settle gradually when controls released; keeps touch play approachable.
 if(Math.abs(bank)<.05)s.bank*=Math.exp(-.17*dt);
 if(Math.abs(pitch)<.05)s.pitch*=Math.exp(-.08*dt);
 const v=Math.max(s.speed,0),accel=p.accel*s.throttle-p.drag*v*v-9.81*Math.sin(s.path)*.9;
 s.speed=clamp(v+accel*dt,0,p.maxSpeed);
 const stalled=s.speed<p.stall;
 const desiredPath=stalled?Math.min(-.24,s.pitch-.24):s.pitch-(s.craft==='glider'?.055:.015);
 s.path=clamp(s.path+(desiredPath-s.path)*(stalled?1.3:.8)*dt,-.65,.54);
 const turn=(9.81*Math.tan(s.bank)/Math.max(s.speed,12))*.88+rudder*.24;
 s.yaw+=turn*dt;
 const horizontal=s.speed*Math.cos(s.path);
 const dx=Math.sin(s.yaw)*horizontal*dt,dz=Math.cos(s.yaw)*horizontal*dt;
 s.x+=dx;s.z+=dz;s.y+=s.speed*Math.sin(s.path)*dt;
 s.distance+=Math.hypot(dx,dz);
 s.flightTime+=dt;s.maxAlt=Math.max(s.maxAlt,s.y);s.maxSpeed=Math.max(s.maxSpeed,s.speed);
 if(s.y<=groundHeight(s.x,s.z)+4){s.y=groundHeight(s.x,s.z)+4;s.condition='GROUND_CONTACT';s.events.push({kind:'ground_contact',at:Math.round(s.flightTime*10)/10});}
 const next=gates[s.checkpoints];
 if(next&&Math.hypot(s.x-next.x,s.y-next.y,s.z-next.z)<80){s.checkpoints++;s.events.push({kind:'gate',index:s.checkpoints,title:next.title,at:Math.round(s.flightTime*10)/10});}
 if(Math.floor(s.flightTime*2)>s.track.length&&s.track.length<1200)s.track.push({x:Math.round(s.x),y:Math.round(s.y),z:Math.round(s.z),at:+s.flightTime.toFixed(1)});
 return s;
}
function flightReceipt(s){return {schema:'evercraft.aaar.worlds-flight.v1',model_state:'GAME_SIMULATION_ONLY',evidence_state:'UNVALIDATED_GAMEPLAY',id:'AAAR-WFL-'+Date.now().toString(36).toUpperCase(),created_at:new Date().toISOString(),aircraft:s.craft,aircraft_name:s.craft==='custom'?s.design.name:aircraft[s.craft].name,design:s.craft==='custom'?Foundry.validate(s.design):null,screening_model:s.craft==='custom'?Foundry.analyze(s.design).schema:null,world:'anniston-cedar-basin-synthetic-v1',flight_time_seconds:+s.flightTime.toFixed(1),distance_m:Math.round(s.distance),max_altitude_m:Math.round(s.maxAlt),max_speed_mps:+s.maxSpeed.toFixed(1),checkpoints:s.checkpoints,condition:s.condition,events:s.events.slice(-20),track:s.track.slice(-300),limitations:'Low-order flight dynamics and synthetic scenery. Aircraft Foundry uses approximate lift/drag or rotor momentum screening, NOT CFD, measured stability, rotor blade models, structures, certification, real terrain or flight authorization.',canonical_sync:'local_preview_only'};}
return Object.freeze({aircraft,gates,start,step,groundHeight,flightReceipt,constants:{RAD,DEG}});
});
