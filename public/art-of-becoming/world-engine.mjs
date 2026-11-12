// Evercraft | Becoming Worlds: durable, user-directed lifetime construction.
// Pure first-party world logic. No model calls, tracking, or real-world verification.
export const WORLD_MODES = Object.freeze([
  {id:'franchise', label:'Franchise World', tagline:'Build the entire sports empire, one facility at a time.'},
  {id:'symphony', label:'Symphony World', tagline:'Build a living musical campus, from rehearsal rooms to grand stages.'},
  {id:'sanctuary', label:'Sanctuary World', tagline:'Grow a place to live, wander, restore, and remember.'},
]);
export const DEFAULT_MODE = 'franchise';
const MODE_SET = new Set(WORLD_MODES.map(mode=>mode.id));
export const WORLD_CATALOG = Object.freeze({
  franchise: Object.freeze([
    {kind:'practice-field',name:'Practice Field',cost:2,icon:'field',description:'A place to practice and learn.'},
    {kind:'training-gym',name:'Training Facility',cost:5,icon:'gym',description:'The first home for a growing program.'},
    {kind:'locker-room',name:'Clubhouse',cost:8,icon:'club',description:'Belonging starts behind these doors.'},
    {kind:'grandstand',name:'Grandstand',cost:12,icon:'stand',description:'A place for the people cheering you on.'},
    {kind:'recovery-center',name:'Recovery & Wellness Center',cost:18,icon:'wellness',description:'A campus designed to take care of people.'},
    {kind:'stadium',name:'Home Stadium',cost:25,icon:'stadium',description:'Your own home field.'},
    {kind:'academy',name:'Youth Academy',cost:35,icon:'academy',description:'The next generation has somewhere to grow.'},
    {kind:'arena',name:'Indoor Arena',cost:55,icon:'arena',description:'A new sporting heart for the campus.'},
    {kind:'trophy-hall',name:'Legacy Hall',cost:70,icon:'trophy',description:'A home for the history you have built.'},
    {kind:'second-campus',name:'Second Campus',cost:110,icon:'campus',description:'Your world grows into new neighborhoods.'},
  ]),
  symphony: Object.freeze([
    {kind:'rehearsal-room',name:'Rehearsal Studio',cost:2,icon:'studio',description:'Where the first notes find a home.'},
    {kind:'strings-hall',name:'Strings Hall',cost:5,icon:'strings',description:'A place for harmonies to gather.'},
    {kind:'percussion-house',name:'Percussion House',cost:8,icon:'percussion',description:'A place for rhythm.'},
    {kind:'light-studio',name:'Light Design Studio',cost:12,icon:'lights',description:'Shape the stage in color and light.'},
    {kind:'amphitheater',name:'Open-Air Stage',cost:18,icon:'stage',description:'Let music into the open air.'},
    {kind:'concert-hall',name:'Concert Hall',cost:25,icon:'hall',description:'An entire hall for your sound.'},
    {kind:'orchestra-school',name:'Music Academy',cost:35,icon:'academy',description:'Pass the music forward.'},
    {kind:'opera-house',name:'Opera House',cost:55,icon:'opera',description:'A grand new home for performance.'},
    {kind:'recording-campus',name:'Recording Campus',cost:70,icon:'record',description:'Capture what your world creates.'},
    {kind:'second-venue',name:'Second Performance District',cost:110,icon:'district',description:'An entire new creative neighborhood.'},
  ]),
  sanctuary: Object.freeze([
    {kind:'garden',name:'Garden',cost:2,icon:'garden',description:'A little more life takes root.'},
    {kind:'bridge',name:'Creek Bridge',cost:5,icon:'bridge',description:'Make the journey a little easier.'},
    {kind:'cabin',name:'Cabin',cost:8,icon:'cabin',description:'A quiet home in your world.'},
    {kind:'pond',name:'Pond',cost:12,icon:'pond',description:'A still place to return to.'},
    {kind:'greenhouse',name:'Greenhouse',cost:18,icon:'greenhouse',description:'Grow through changing seasons.'},
    {kind:'grove',name:'Forest Grove',cost:25,icon:'grove',description:'A whole neighborhood of trees.'},
    {kind:'library',name:'Sanctuary Library',cost:35,icon:'library',description:'A home for stories and reflection.'},
    {kind:'observatory',name:'Observatory',cost:55,icon:'observatory',description:'Room for looking outward.'},
    {kind:'village',name:'Little Village',cost:70,icon:'village',description:'A place that welcomes others.'},
    {kind:'second-valley',name:'Second Valley',cost:110,icon:'valley',description:'Another horizon opens.'},
  ]),
});

const GOODS = Object.fromEntries(Object.entries(WORLD_CATALOG).map(([mode,rows])=>[mode,new Map(rows.map(x=>[x.kind,x]))]));
const validCoord = n=>Number.isSafeInteger(n)&&Math.abs(n)<=100000;
const validLevel = n=>Number.isSafeInteger(n)&&n>=1&&n<=10000;
const validId = s=>typeof s==='string'&&/^build-[1-9][0-9]*$/.test(s)&&s.length<=24;
const num = n=>Number.isSafeInteger(n)&&n>=0?n:0;
export function emptyWorldState(){return {version:1,activeModes:{},worlds:{}};}
export function creditsForGoal(habitState,goal){return new Set(Array.isArray(habitState?.creditedDays?.[goal])?habitState.creditedDays[goal]:[]).size;}
export function expansionRadius(credits){
  // Continuous lifetime growth: no 365-day ending, no terminal season, no fixed campus.
  return 3+Math.floor(Math.sqrt(num(credits)/12));
}
export function upgradePrice(mode,kind,nextLevel){
  const catalog=GOODS[mode]?.get(kind);
  if(!catalog||!validLevel(nextLevel)||nextLevel<2)throw new Error('Unknown facility upgrade');
  return Math.ceil(catalog.cost*(0.65+nextLevel*.45));
}
export function fullCost(mode,kind,level){
  const item=GOODS[mode]?.get(kind);
  if(!item||!validLevel(level))throw new Error('Unknown structure');
  let price=item.cost;
  for(let l=2;l<=level;l++)price+=upgradePrice(mode,kind,l);
  return price;
}
export function normalizeWorldState(value,allowedGoals){
  const next=emptyWorldState();
  if(!value||typeof value!=='object'||Array.isArray(value))return next;
  const allowed=new Set(allowedGoals);
  const active=value.activeModes&&typeof value.activeModes==='object'&&!Array.isArray(value.activeModes)?value.activeModes:{};
  const worlds=value.worlds&&typeof value.worlds==='object'&&!Array.isArray(value.worlds)?value.worlds:{};
  for(const goal of allowed){
    if(MODE_SET.has(active[goal]))next.activeModes[goal]=active[goal];
    const byMode=worlds[goal];
    if(!byMode||typeof byMode!=='object'||Array.isArray(byMode))continue;
    for(const mode of MODE_SET){
      const raw=byMode[mode];
      if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.buildings))continue;
      const ids=new Set(),tiles=new Set(['0,0']),buildings=[];
      // Refuse fabricated/duplicate IDs and overlapping buildings from imports.
      for(const b of raw.buildings.slice(0,10000)){
        if(!b||typeof b!=='object'||!validId(b.id)||!GOODS[mode].has(b.kind)||!validCoord(b.x)||!validCoord(b.y)||!validLevel(b.level))continue;
        const tile=b.x+','+b.y;
        if(ids.has(b.id)||tiles.has(tile))continue;
        ids.add(b.id);tiles.add(tile);buildings.push({id:b.id,kind:b.kind,x:b.x,y:b.y,level:b.level});
      }
      if(!next.worlds[goal])next.worlds[goal]={};
      next.worlds[goal][mode]={buildings};
    }
  }
  return next;
}
export function worldSummary(habitState,goal,mode){
  if(!MODE_SET.has(mode))throw new Error('Unknown world mode');
  const credits=creditsForGoal(habitState,goal);
  const state=normalizeWorldState(habitState?.worldState,[goal]);
  const buildings=state.worlds[goal]?.[mode]?.buildings||[];
  const spent=buildings.reduce((sum,b)=>sum+fullCost(mode,b.kind,b.level),0);
  return {
    mode,credits,spent,available:Math.max(0,credits-spent),
    radius:expansionRadius(credits),buildings,
    districts:1+Math.floor(credits/365), // Legacy chapters, not a forced reset.
    lifetimeYears:Math.floor(credits/365),
  };
}
export function chooseMode(habitState,goal,mode){
  if(!MODE_SET.has(mode)||!goal||typeof goal!=='string')throw new Error('Unknown world');
  const next=structuredClone(habitState);
  next.worldState=normalizeWorldState(next.worldState,[...new Set([...Object.keys(next.creditedDays||{}),...Object.keys(next.worldState?.worlds||{}),goal])]);
  next.worldState.activeModes[goal]=mode;
  return next;
}
function mutate(habitState,goal,mode,change){
  if(!MODE_SET.has(mode)||!goal||typeof goal!=='string')throw new Error('Unknown world');
  const next=structuredClone(habitState);
  const goals=new Set([...Object.keys(next.creditedDays||{}),...Object.keys(next.worldState?.worlds||{}),goal]);
  next.worldState=normalizeWorldState(next.worldState,[...goals]);
  if(!next.worldState.worlds[goal])next.worldState.worlds[goal]={};
  if(!next.worldState.worlds[goal][mode])next.worldState.worlds[goal][mode]={buildings:[]};
  change(next,next.worldState.worlds[goal][mode]);
  next.worldState.activeModes[goal]=mode;
  return next;
}
export function placeFacility(habitState,goal,mode,kind,x,y){
  if(!GOODS[mode]?.has(kind))throw new Error('Unknown facility');
  if(!validCoord(x)||!validCoord(y))throw new Error('Invalid lot');
  return mutate(habitState,goal,mode,(state,world)=>{
    const summary=worldSummary(state,goal,mode);
    if(Math.abs(x)>summary.radius||Math.abs(y)>summary.radius)throw new Error('That district has not opened yet');
    if((x===0&&y===0)||world.buildings.some(b=>b.x===x&&b.y===y))throw new Error('That lot is already occupied');
    const item=GOODS[mode].get(kind);
    if(summary.available<item.cost)throw new Error('More intentional days are needed to build this facility');
    const nextId=1+Math.max(0,...world.buildings.map(b=>Number(b.id.slice(6))));
    world.buildings.push({id:'build-'+nextId,kind,x,y,level:1});
  });
}
export function upgradeFacility(habitState,goal,mode,id){
  return mutate(habitState,goal,mode,(state,world)=>{
    const building=world.buildings.find(b=>b.id===id);
    if(!building)throw new Error('Facility not found');
    const cost=upgradePrice(mode,building.kind,building.level+1);
    if(worldSummary(state,goal,mode).available<cost)throw new Error('More intentional days are needed for this upgrade');
    building.level+=1;
  });
}
export function worldPlot(habitState,goal,mode){
  const p=worldSummary(habitState,goal,mode);
  return {schema:'evercraft.becoming.world-plot.v1',mode,
    lifetimeCredits:p.credits,districts:p.districts,available:p.available,radius:p.radius,
    buildings:p.buildings.map(b=>({...b,name:GOODS[mode].get(b.kind).name})),
    // The center is a permanent shared gathering space, not a recurring purchase.
    origin:{x:0,y:0,name:mode==='franchise'?'Founders Field':mode==='symphony'?'Founders Stage':'Founders Clearing'},
    palette:mode==='franchise'?'emerald':mode==='symphony'?'midnight':'moss',
  };
}
