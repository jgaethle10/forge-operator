/* Anniston Aircraft Foundry v0.6 — screening model, NOT CFD, flight certification or a digital twin.
 * Pure deterministic equations, limited fixed-wing point-mass / multirotor thrust model.
 * Validated designs only; no network, physical outputs or external packages.
 */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.AAARFoundry=api;})(typeof globalThis==='undefined'?null:globalThis,function(){
'use strict';
const SCHEMA='evercraft.aaar.airframe-design.v1';
const G=9.80665,RHO0=1.225,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const bounds={massKg:[.4,30000],spanM:[.6,60],chordM:[.15,9],sweepDeg:[0,60],bodyLengthM:[.5,40],bodyWidthM:[.15,8],tailAreaM2:[0,30],cgFraction:[.05,.85],thrustN:[0,160000],cd0:[.012,.25],clMax:[.65,2.5],rotors:[2,12],rotorRadiusM:[.09,3.5],totalPowerW:[100,1500000]};
const BASE={schema:SCHEMA,name:'Untitled machine',type:'wing',massKg:850,spanM:12,chordM:1.6,sweepDeg:5,bodyLengthM:8.2,bodyWidthM:1.35,tailAreaM2:3.1,cgFraction:.28,thrustN:3200,cd0:.038,clMax:1.35,rotors:4,rotorRadiusM:.42,totalPowerW:3600};
const presets={
 kestrel:{...BASE,name:'Kestrel One',type:'wing'},
 glider:{...BASE,name:'Silent Arc',type:'wing',massKg:550,spanM:21,chordM:1.1,bodyLengthM:7.6,tailAreaM2:2.8,thrustN:0,cd0:.019},
 flyingwing:{...BASE,name:'Manta Concept',type:'wing',massKg:220,spanM:9,chordM:2.7,bodyLengthM:4,tailAreaM2:0,cgFraction:.43,thrustN:1300,sweepDeg:31,cd0:.032},
 quad:{...BASE,name:'Quad Sparrow',type:'rotor',massKg:2.4,bodyLengthM:.7,bodyWidthM:.32,spanM:1.1,chordM:.35,tailAreaM2:0,rotors:4,rotorRadiusM:.23,totalPowerW:900},
 heavy:{...BASE,name:'Sky Hauler',type:'rotor',massKg:95,bodyLengthM:2.8,bodyWidthM:1.5,spanM:3.8,chordM:1.5,tailAreaM2:0,rotors:8,rotorRadiusM:.83,totalPowerW:45000}
};
function validate(input){
 if(!input||Array.isArray(input)||typeof input!=='object'||input.schema!==SCHEMA)throw Error('Invalid AAAR airframe schema');
 if(!['wing','rotor'].includes(input.type))throw Error('Choose fixed-wing or rotorcraft');
 if(typeof input.name!=='string'||input.name.trim().length<1||input.name.length>64)throw Error('Aircraft name must be 1–64 characters');
 const out={schema:SCHEMA,name:input.name.trim(),type:input.type};
 for(const [key,[lo,hi]] of Object.entries(bounds)){
  const n=input[key];if(typeof n!=='number'||!Number.isFinite(n)||n<lo||n>hi)throw Error(`Invalid ${key}: ${lo}–${hi}`);
  if(key==='rotors'&&!Number.isInteger(n))throw Error('Rotor count must be an integer');
  out[key]=n;
 }
 return out;
}
const preset=(key='kestrel')=>validate({...presets[key]||presets.kestrel});
function rho(h){return RHO0*Math.exp(-clamp(h,0,20000)/8500);}
function wingNumbers(d){
 const wingArea=d.spanM*d.chordM,ar=d.spanM*d.spanM/wingArea;
 const e=clamp(.84 - d.sweepDeg*.003, .6,.88),a=(2*Math.PI)/(1+2/(e*ar));
 // Assumed section zero-lift at -2 deg, not inferred from geometry.
 const alpha0=-2*Math.PI/180;
 const vStall=Math.sqrt(2*d.massKg*G/(RHO0*wingArea*d.clMax));
 const vScreen= Math.max(vStall*1.45,8);
 const clReq=(d.massKg*G)/(.5*RHO0*vScreen*vScreen*wingArea);
 const cd=d.cd0+clReq*clReq/(Math.PI*e*ar);
 const drag=.5*RHO0*vScreen*vScreen*wingArea*cd;
 const alphaTrim=alpha0+clReq/a;
 const tailVolume=d.tailAreaM2*Math.max(.5,d.bodyLengthM*.46)/(wingArea*d.chordM);
 return {wingArea,aspectRatio:ar,spanEfficiency:e,liftSlope:a,alpha0,vStall,screenSpeed:vScreen,screenDragN:drag,screenThrustMarginN:d.thrustN-drag,trimAlphaRad:alphaTrim,tailVolume,cdAtScreen:cd};
}
function rotorNumbers(d){
 const diskArea=d.rotors*Math.PI*d.rotorRadiusM**2;
 // Momentum theory hover ideal induced power: P = T^(3/2) / sqrt(2 rho A).
 // Effective factor 0.56 is an arbitrary screening assumption, NOT a blade-design calculation.
 const efficiency=.56;
 const thrust=(d.totalPowerW*efficiency*Math.sqrt(2*RHO0*diskArea))**(2/3);
 const hoverPowerIdeal=(d.massKg*G)**1.5/Math.sqrt(2*RHO0*diskArea);
 const hoverPowerScreen=hoverPowerIdeal/efficiency;
 return {diskArea,maxThrustN:thrust,thrustWeightRatio:thrust/(d.massKg*G),hoverPowerIdealW:hoverPowerIdeal,hoverPowerScreenW:hoverPowerScreen,diskLoadingNpm2:(d.massKg*G)/diskArea,efficiencyAssumption:efficiency};
}
function analyze(input){const d=validate(input),warnings=[],metrics=d.type==='wing'?wingNumbers(d):rotorNumbers(d);
 if(d.type==='wing'){
   if(metrics.screenThrustMarginN<0&&d.thrustN>0)warnings.push('At screening airspeed, modeled thrust does not cover drag. Level powered flight is unlikely in this model.');
   if(!d.thrustN)warnings.push('No propulsion: expect an energy-losing glide without modeled updrafts.');
   if(metrics.aspectRatio<2)warnings.push('Very low aspect ratio: simple lifting-line approximation is unreliable.');
   if(metrics.tailVolume<.2)warnings.push('Low horizontal tail-volume proxy: pitch stability and trim are NOT established.');
   if(d.cgFraction>.4||d.cgFraction<.12)warnings.push('Center of mass appears outside a conventional starting range; neutral-point location is unknown.');
   if(d.sweepDeg>35)warnings.push('High sweep: this screening model omits compressibility, vortex lift and swept-wing aeroelasticity.');
 }else{
   if(metrics.thrustWeightRatio<1)warnings.push('Modeled maximum rotor thrust is below weight: cannot hover or sustain vertical flight.');
   else if(metrics.thrustWeightRatio<1.25)warnings.push('Low modeled hover thrust margin; handling and disturbance reserves are not demonstrated.');
   if(d.rotorRadiusM*2>d.spanM)warnings.push('Rotor disks may overlap the nominal vehicle footprint. Geometry interference is not modeled.');
   warnings.push('Rotor thrust uses an ideal momentum-theory scaling with an assumed efficiency. Blade aerodynamics and flight-controller stability are not simulated.');
 }
 warnings.push('No structural strength, control surface sizing, dynamic stability, battery/fuel, weather, certification or physical safety assessment.');
 return {schema:'evercraft.aaar.foundry-screen.v1',model_state:'LOW_ORDER_ANALYTICAL_ESTIMATE',evidence_state:'UNVALIDATED_SCREENING',design:d,metrics,warnings};
}
function startState(design){const d=validate(design),a=analyze(d),wing=d.type==='wing';const stall=wing?a.metrics.vStall:0,initialV=wing?Math.max(stall*1.5,8):2;
 const canHover=!wing&&a.metrics.thrustWeightRatio>=1;
 const throttle=wing?(d.thrustN? .7:0):(canHover?clamp((d.massKg*G/a.metrics.maxThrustN)**1.5*1.05,0,1):1);
 return {schema:'evercraft.aaar.worlds-flight-state.v1',craft:'custom',design:d,x:0,y:wing?280:90,z:-740,yaw:0,
   pitch:wing?a.metrics.trimAlphaRad:0,bank:0,path:0,speed:initialV,throttle,
   vx:0,vz:wing?initialV:2,vy:0,flightTime:0,distance:0,maxAlt:wing?280:90,maxSpeed:initialV,
   checkpoints:0,events:[],track:[],paused:false,condition:'FLYING',aero:{liftN:0,dragN:0,thrustN:0,stall:false,verticalSpeed:0}};
}
function stepPhysics(s,a,dt){const d=s.design;dt=clamp(Number(dt)||0,0,.05);const inPitch=clamp(Number(a?.pitch)||0,-1,1),inBank=clamp(Number(a?.bank)||0,-1,1),rudder=clamp(Number(a?.rudder)||0,-1,1);
 s.throttle=clamp(s.throttle+clamp(Number(a?.throttle)||0,-1,1)*.4*dt,0,1);
 s.pitch=clamp(s.pitch+inPitch*(d.type==='wing'?.52:.7)*dt,d.type==='wing'?-.42:-.48,d.type==='wing'?.52:.48);
 s.bank=clamp(s.bank+inBank*(d.type==='wing'?1.0:1.3)*dt,-1.1,1.1);
 if(Math.abs(inBank)<.01)s.bank*=Math.exp(-(d.type==='wing'?.15:.75)*dt);
 let lift=0,drag=0,thrust=0,stall=false,cl=0;
 if(d.type==='wing'){
  const w=wingNumbers(d),v=Math.max(.1,s.speed),density=rho(s.y),q=.5*density*v*v;
  const alpha=s.pitch-s.path,clLinear=w.liftSlope*(alpha-w.alpha0);
  cl=clamp(clLinear,-.9,d.clMax);
  // Post-stall reduction is a toy approximation, not dynamic-stall CFD.
  if(clLinear>d.clMax){stall=true;cl=Math.max(.35*d.clMax,d.clMax*(1-.032*(clLinear-d.clMax)*180/Math.PI));}
  lift=q*w.wingArea*cl;
  drag=q*w.wingArea*(d.cd0+cl*cl/(Math.PI*w.spanEfficiency*w.aspectRatio));
  thrust=d.thrustN*s.throttle;
  const acceleration=(thrust-drag)/d.massKg -G*Math.sin(s.path);
  s.speed=clamp(s.speed+acceleration*dt,0,400);
  const pathRate=(lift*Math.cos(s.bank)-d.massKg*G*Math.cos(s.path))/(d.massKg*Math.max(5,s.speed));
  s.path=clamp(s.path+clamp(pathRate,-1,1)*dt,-1.2,.8);
  s.yaw+=(G*Math.tan(s.bank)/Math.max(s.speed,8)*Math.cos(s.path)+rudder*.15)*dt;
  const horizontal=s.speed*Math.cos(s.path),dx=Math.sin(s.yaw)*horizontal*dt,dz=Math.cos(s.yaw)*horizontal*dt;
  s.x+=dx;s.z+=dz;s.y+=s.speed*Math.sin(s.path)*dt;s.distance+=Math.hypot(dx,dz);
  s.vy=s.speed*Math.sin(s.path);
 }else{
  const r=rotorNumbers(d),dens=rho(s.y),rhoScale=(dens/RHO0)**(1/3),T=r.maxThrustN*Math.pow(s.throttle,2/3)*rhoScale;
  const cPitch=Math.cos(s.pitch),cBank=Math.cos(s.bank),vertical=T*cPitch*cBank;
  // X/Z body axes; simplified thrust-vectoring, not propeller flight dynamics.
  const forward=T*Math.sin(s.pitch)*cBank,lateral=T*Math.sin(s.bank);
  const hx=Math.sin(s.yaw),hz=Math.cos(s.yaw),sideX=Math.cos(s.yaw),sideZ=-Math.sin(s.yaw);
  const cdA=.8*d.bodyLengthM*d.bodyWidthM;
  const hSpeed=Math.hypot(s.vx,s.vz),dragH=.5*dens*hSpeed*hSpeed*cdA;
  const accF=forward/d.massKg,accLat=lateral/d.massKg;
  s.vx+=(accF*hx+accLat*sideX - (hSpeed>0?dragH/d.massKg*s.vx/hSpeed:0))*dt;
  s.vz+=(accF*hz+accLat*sideZ - (hSpeed>0?dragH/d.massKg*s.vz/hSpeed:0))*dt;
  const vDrag=.5*dens*s.vy*Math.abs(s.vy)*cdA*.65;
  s.vy+=clamp((vertical-vDrag)/d.massKg-G,-100,100)*dt;
  s.vy=clamp(s.vy,-90,90);
  const dx=s.vx*dt,dz=s.vz*dt;s.x+=dx;s.z+=dz;s.y+=s.vy*dt;s.distance+=Math.hypot(dx,dz);
  s.yaw+=rudder*.85*dt;
  s.speed=Math.hypot(s.vx,s.vz);s.path=Math.atan2(s.vy,Math.max(s.speed,.5));
  thrust=T;drag=dragH;lift=vertical;
 }
 s.flightTime+=dt;s.maxAlt=Math.max(s.maxAlt,s.y);s.maxSpeed=Math.max(s.maxSpeed,s.speed);
 s.aero={liftN:lift,dragN:drag,thrustN:thrust,stall,verticalSpeed:s.vy,cl};
 return s;
}
return Object.freeze({SCHEMA,G,bounds,presets,preset,validate,analyze,startState,stepPhysics,wingNumbers,rotorNumbers,rho});
});
