// Evercraft Worlds / Flight School 1.4 ground-exploration state foundation.
// Pure, deterministic, local-only game model. No real airport or road data.
export const SCHEMA='evercraft.aaar.ground-explorer.v1';
export const DEFAULT_FIELD=Object.freeze({x:1810,z:0,width:96,length:2100,level:54});
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const finite=v=>Number.isFinite(v);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const footprint=(x,z,w,d,margin=0)=>({x,z,w,d,margin});
function solids(field){
 const x=field.x,z=field.z-field.length/2;
 return [
  footprint(x+220,z+160,78,82,3),
  footprint(x+315,z+276,78,82,3),
  footprint(x+410,z+392,78,82,3),
  footprint(x+370,z+450,39,36,3),
  footprint(x+155,z+365,91,69,3)
 ];
}
function clear(point,field,radius=1.1){
 if(point.x<field.x-80||point.x>field.x+560||
    point.z<field.z-field.length/2-90||point.z>field.z+field.length/2+80)return false;
 return !solids(field).some(o=>Math.abs(point.x-o.x)<o.w/2+o.margin+radius&&
                               Math.abs(point.z-o.z)<o.d/2+o.margin+radius);
}
function cartClear(point,field){
 if(point.x<field.x+65||point.x>field.x+500||
    point.z<field.z-field.length/2+30||point.z>field.z+field.length/2-30)return false;
 return clear(point,field,4.5);
}
export function beginGroundExplorer(flight,field=DEFAULT_FIELD){
 if(!flight||flight.condition!=='ON_GROUND'||!finite(flight.x)||!finite(flight.z)||
    !finite(flight.yaw)||!finite(flight.speed)||flight.speed>.8||flight.speed<0)
  throw Error('ground_explorer_requires_stopped_landed_aircraft');
 if(Math.abs(flight.x-field.x)>field.width/2+4||
    Math.abs(flight.z-field.z)>field.length/2+5)throw Error('aircraft_outside_training_field');
 return {
  schema:SCHEMA,mode:'aircraft',elapsed:0,
  plane:{x:flight.x,z:flight.z,yaw:flight.yaw,craft:flight.craft||'trainer'},
  person:null,
  cart:{x:field.x+115,z:field.z-90,yaw:Math.PI/2,speed:0},
  field:{...field},events:[{kind:'ground_session_started',at:0}],
  provenance:'SYNTHETIC_LOCAL_GAMEPLAY'
 };
}
const validMode=m=>m==='aircraft'||m==='foot'||m==='cart';
export function validateGroundExplorer(s){
 if(!s||s.schema!==SCHEMA||!validMode(s.mode)||!s.field||
  !s.plane||!s.cart||!Array.isArray(s.events)||s.events.length>200||
  ![s.plane.x,s.plane.z,s.cart.x,s.cart.z,s.cart.yaw,s.cart.speed,s.elapsed].every(finite)||
  !['aircraft','cart'].includes(s.mode)&&(!s.person||![s.person.x,s.person.z,s.person.yaw].every(finite)))
  throw Error('invalid_ground_explorer');
 return s;
}
const event=(s,kind)=>s.events.push({kind,at:+s.elapsed.toFixed(2)});
export function interactGroundExplorer(s){
 validateGroundExplorer(s);
 if(s.mode==='aircraft'){
  const candidate={x:s.plane.x+6,z:s.plane.z,yaw:s.plane.yaw};
  if(!clear(candidate,s.field))return {state:s,action:'blocked_exit'};
  s.person=candidate;s.mode='foot';event(s,'aircraft_exited');
  return {state:s,action:'exited_aircraft'};
 }
 if(s.mode==='foot'){
  if(distance(s.person,s.cart)<7.5){
   s.mode='cart';s.person=null;event(s,'cart_entered');
   return {state:s,action:'entered_cart'};
  }
  if(distance(s.person,s.plane)<9.5){
   s.mode='aircraft';s.person=null;event(s,'aircraft_boarded');
   return {state:s,action:'boarded_aircraft'};
  }
  return {state:s,action:'nothing_nearby'};
 }
 if(s.mode==='cart'){
  if(Math.abs(s.cart.speed)>.6)return {state:s,action:'stop_to_exit'};
  const candidate={x:s.cart.x-7,z:s.cart.z,yaw:s.cart.yaw};
  if(!clear(candidate,s.field))return {state:s,action:'blocked_exit'};
  s.person=candidate;s.mode='foot';event(s,'cart_exited');
  return {state:s,action:'exited_cart'};
 }
 return {state:s,action:'invalid_mode'};
}
export function stepGroundExplorer(s,input={},dt=.016){
 validateGroundExplorer(s);
 dt=clamp(Number(dt)||0,0,.05);
 if(dt===0||s.mode==='aircraft')return s;
 const steer=clamp(Number(input.turn)||0,-1,1);
 if(s.mode==='foot'){
  const f=clamp(Number(input.forward)||0,-1,1),
   side=clamp(Number(input.strafe)||0,-1,1);
  const mag=Math.max(1,Math.hypot(f,side));
  s.person.yaw+=steer*2.3*dt;
  const rate=input.run?6.1:3.7;
  const dx=(Math.sin(s.person.yaw)*f+Math.cos(s.person.yaw)*side)/mag*rate*dt;
  const dz=(Math.cos(s.person.yaw)*f-Math.sin(s.person.yaw)*side)/mag*rate*dt;
  const next={x:s.person.x+dx,z:s.person.z+dz};
  if(clear(next,s.field)){s.person.x=next.x;s.person.z=next.z;}
 }else{
  const throttle=clamp(Number(input.throttle)||0,-1,1);
  const brake=input.brake===true||input.brake>0;
  const current=s.cart.speed;
  const drag=current===0?0:Math.sign(current)*(.75+Math.abs(current)*.11);
  let nextSpeed=clamp(current+(throttle*5.4-drag-(brake?Math.sign(current)*15:0))*dt,-4.5,15);
  if(brake&&current!==0&&Math.sign(nextSpeed)!==Math.sign(current))nextSpeed=0;
  if(brake&&Math.abs(current)<.9)nextSpeed=0;
  if(Math.abs(nextSpeed)<.08&&(!throttle||brake))nextSpeed=0;
  s.cart.speed=nextSpeed;
  s.cart.yaw+=steer*clamp(Math.abs(s.cart.speed)/9,0,1)*.85*dt*(s.cart.speed<0?-1:1);
  const next={x:s.cart.x+Math.sin(s.cart.yaw)*s.cart.speed*dt,
              z:s.cart.z+Math.cos(s.cart.yaw)*s.cart.speed*dt};
  if(cartClear(next,s.field)){s.cart.x=next.x;s.cart.z=next.z;s.cart.blocked=false;}
  else{s.cart.speed=0;if(!s.cart.blocked)event(s,'cart_obstacle_stop');s.cart.blocked=true;}
 }
 s.elapsed+=dt;
 return s;
}
export function groundActions(s){
 validateGroundExplorer(s);
 if(s.mode==='aircraft')return {primary:'Exit aircraft',canExit:true,canBoard:false,canDrive:false};
 if(s.mode==='cart')return {primary:Math.abs(s.cart.speed)<.6?'Exit cart':'Brake to exit',canExit:Math.abs(s.cart.speed)<.6,canBoard:false,canDrive:true};
 const nearest=distance(s.person,s.plane)<9.5?'plane':distance(s.person,s.cart)<7.5?'cart':null;
 return {primary:nearest==='plane'?'Board aircraft':nearest==='cart'?'Enter cart':'Explore airfield',canExit:false,canBoard:nearest==='plane',canDrive:nearest==='cart'};
}
