// The Business Square is geometry and local authored copy for the *existing* Mossmere engine.
// It is not an authenticated multiplayer lobby, agent session or commercial service.
export const BUSINESS_SQUARE_ENTRY = Object.freeze({x:-9.8,z:12.9,yaw:0});
export const BUSINESS_SPOTS = Object.freeze([
  Object.freeze({id:'business-directory',x:-10.2,z:9.5,action:'inspect the connections directory',topic:'network'}),
  Object.freeze({id:'business-concierge',x:-7.0,z:9.2,action:'meet the concierge concept',topic:'concierge'}),
  Object.freeze({id:'business-meeting',x:-12.8,z:10.6,action:'inspect the meeting studio',topic:'meetings'}),
]);
export const BUSINESS_TOPICS = Object.freeze({
  overview:Object.freeze({title:'Worlds Business Square',eyebrow:'LOCAL WALKTHROUGH',
    message:'Explore a business space built into the same Evercraft Worlds engine. No real people or independently running AI agents are connected to this preview.'}),
  network:Object.freeze({title:'Connections Directory',eyebrow:'NO LIVE PROFILES',
    message:'A future opt-in directory will let verified adults discover opportunities and request introductions. This preview contains no real profiles, search results or contact information.'}),
  concierge:Object.freeze({title:'Evercraft Concierge',eyebrow:'CONCEPT STATION',
    message:'An eventual Saban-powered concierge could help explain capabilities and propose bounded work. There is no live agent, inference, outreach or job execution in this preview.'}),
  meetings:Object.freeze({title:'Meeting Studio',eyebrow:'PRIVATE ROOMS NOT ACTIVE',
    message:'A future room will require authenticated participation and mutual acceptance. This station does not open calls, transmit messages or reveal visitor locations.'}),
  permissions:Object.freeze({title:'Your Privacy Comes First',eyebrow:'DEFAULT: NO CONTACT',
    message:'Human contact, AI approaches, suggested introductions, persistent memory and payments each require separate, revocable permission. No personal information is collected by this walkthrough.'}),
});
export function describeBusinessTopic(topic='overview'){
  return BUSINESS_TOPICS[topic]||BUSINESS_TOPICS.overview;
}
export function inBusinessSquare(x,z){
  return Number.isFinite(x)&&Number.isFinite(z)&&x>=-15.5&&x<=-4.5&&z>=4.4&&z<=16.9;
}
export function nearbyBusinessSpot(x,z,radius=3.2){
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(radius)||radius<=0)return null;
  const near=BUSINESS_SPOTS.map(spot=>({spot,distance:Math.hypot(x-spot.x,z-spot.z)}))
    .sort((a,b)=>a.distance-b.distance)[0];
  return near?.distance<radius?near.spot:null;
}

// All authored shapes stay inside the existing local world bounds. Static instancing
// is owned by public/worlds/app.mjs; this function only contributes geometry to it.
export function addBusinessSquareGeometry({box,ball,tube}={}){
  if([box,ball,tube].some(fn=>typeof fn!=='function'))throw Error('worlds_geometry_callbacks_required');
  // Square, walkable spine, warm office pavilion.
  box(-10,.025,8.5,10,.09,8.2,'#b8c9bf');
  box(-10,.095,10.2,2.6,.06,5.8,'#e5dac6');
  box(-10,.14,6.7,8,.15,3.35,'#d7cbb4');
  box(-10,4.1,6.65,8.5,.23,3.85,'#668787');
  box(-10,2.05,4.83,8.4,4.1,.16,'#bad3d0');
  for(const x of [-14.02,-5.98]){
    box(x,2.05,6.65,.16,4.1,3.45,'#7b9997');
    box(x,4.35,6.65,.24,.4,4,'#496b6b');
  }
  // Front glass frontage: leave a generous central entrance.
  for(const x of [-12.7,-7.3]){
    box(x,2.05,8.35,2.2,3.2,.12,'#90bab7');
    box(x,3.74,8.36,2.3,.13,.16,'#426866');
  }
  box(-10,.77,7.55,3.5,1.15,.7,'#9a735d');
  box(-10,1.38,7.86,1.75,.86,.12,'#274f52');
  box(-10,1.41,7.94,1.5,.61,.03,'#91c4bf');
  // Directory kiosk, three readable stations exposed by keyboard and touch HUD.
  tube(-10.2,1.08,9.45,.18,2.16,.18,'#3b6464');
  box(-10.2,2.12,9.45,2,.92,.15,'#244a50');
  box(-10.2,2.13,9.36,1.7,.61,.04,'#d6e6d8');
  // Privacy-first meeting area and a round table.
  tube(-12.8,.57,10.58,1.65,.1,1.65,'#c19e78');
  tube(-12.8,.29,10.58,.22,.58,.22,'#6a7d76');
  for(const [x,z] of [[-13.95,10.58],[-11.65,10.58]]){
    box(x,.37,z,.5,.7,.5,'#8eada5');
  }
  // Concierge silhouette is a STATIC sculpture, never represented as a live person.
  tube(-7,.48,9.2,.55,.95,.55,'#71918d');
  ball(-7,1.28,9.2,.62,.68,.6,'#e1c79f');
  ball(-7,1.92,9.2,.65,.63,.62,'#e1c79f');
  box(-7,2.43,9.2,1.2,.12,.7,'#eedab3');
  // Low-energy wayfinding lamps and greenery.
  for(const [x,z] of [[-14,12],[-6,12],[-14,5],[-6,5]]){
    tube(x,.95,z,.12,1.9,.12,'#577776');
    ball(x,2.04,z,.47,.52,.47,'#e4d2a2');
  }
  for(const [x,z] of [[-14.4,8.8],[-5.6,8.8]]){
    tube(x,.31,z,.8,.62,.8,'#b8876b');
    ball(x,.8,z,.85,.82,.82,'#739b7b');
  }
}
