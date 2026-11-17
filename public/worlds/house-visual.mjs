// Evercraft Worlds: read-only visual translation of House 001's canonical World Engine scene.
// Draw instructions go to the EXISTING Worlds WebGL2 draw() and agentDraw() pipelines.
// No GL context, simulation physics, 3D engine, payments, or live AI inference here.
import {toHouseEngineWorld} from '../living-worlds/house-world-bridge.mjs';
import {validateHouse} from '../living-worlds/house-core.mjs';

export const HOUSE_VISUAL_SCHEMA='evercraft.worlds.house-visual.v1';
const C={floor:['#a0c7b0','#e4c09f','#c6b3d7','#adc1d4'],trim:'#e6d5b7',wall:'#e5ddd0',wood:'#98765d',pot:'#c78a72',leaf:'#729f7c',light:'#fff1ce'};
const PALETTE=Object.freeze({mara:'#edb7a5',ivo:'#b4c3ed',jun:'#ddc28a',sable:'#aeccbf'});
const box=(x,y,z,sx,sy,sz,color)=>({kind:'cube',x,y,z,sx,sy,sz,color});
const ball=(x,y,z,sx,sy,sz,color)=>({kind:'sphere',x,y,z,sx,sy,sz,color});
const tube=(x,y,z,sx,sy,sz,color)=>({kind:'cylinder',x,y,z,sx,sy,sz,color});

function furnishing(entity){
  const id=entity.properties.sourceId;
  const type=entity.properties.objectKind;
  const {x,z}=entity.transform.position;
  const drawings=[];
  const b=(dx,y,dz,sx,sy,sz,color)=>drawings.push(box(x+dx,y,z+dz,sx,sy,sz,color));
  const s=(dx,y,dz,sx,sy,sz,color)=>drawings.push(ball(x+dx,y,z+dz,sx,sy,sz,color));
  const t=(dx,y,dz,sx,sy,sz,color)=>drawings.push(tube(x+dx,y,z+dz,sx,sy,sz,color));
  switch(type){
    case 'bed':
      b(0,.22,0,.88,.29,.88,'#b6a38d');b(0,.39,0,.8,.11,.82,'#e3c6ba');
      b(0,.46,.24,.62,.08,.22,C.light);b(0,.38,-.38,.86,.52,.07,'#977b7a');break;
    case 'fridge':
      b(0,.68,0,.77,1.32,.7,'#c8d4d2');b(0,1.12,-.365,.78,.025,.02,'#98a9a9');
      b(.26,.55,-.37,.035,.22,.04,'#728887');break;
    case 'sofa':
      b(0,.34,0,.88,.27,.62,'#829f9e');b(0,.59,.3,.88,.42,.18,'#799493');
      b(-.41,.43,0,.13,.45,.67,'#718b88');b(.41,.43,0,.13,.45,.67,'#718b88');break;
    case 'desk':
      b(0,.55,0,.9,.12,.68,C.wood);
      for(const dx of [-.38,.38])for(const dz of [-.24,.24])b(dx,.27,dz,.08,.5,.08,'#70584c');
      b(0,.87,.15,.55,.48,.06,'#394852');b(0,.87,.1,.48,.39,.02,'#9bcbd0');
      b(0,.6,-.2,.4,.025,.15,'#ded0b5');break;
    case 'plant':
      t(0,.19,0,.35,.37,.35,C.pot);t(0,.38,0,.4,.09,.4,'#75644a');
      for(let i=0;i<4;i++)s(Math.cos(i*Math.PI/2)*.14,.65,Math.sin(i*Math.PI/2)*.14,.26,.48,.24,C.leaf);
      s(0,.81,0,.34,.44,.32,'#8ab692');break;
    case 'table':
      b(0,.64,0,.86,.12,.8,C.wood);
      for(const dx of [-.31,.31])for(const dz of [-.26,.26])b(dx,.3,dz,.08,.59,.08,'#795e4b');
      s(0,.73,0,.19,.10,.16,'#e9bd91');break;
    default:throw Error('house_visual_unknown_furnishing:'+id);
  }
  return drawings;
}

export function toHouseVisualFrame(house){
  if(!validateHouse(house))throw Error('house_visual_invalid_house');
  const world=toHouseEngineWorld(house);
  if(world.schema!=='evercraft.world-engine.world.v1'||world.metadata.projectionOnly!==true||
    world.metadata.productionAuthoritative!==false)throw Error('house_visual_untrusted_world');
  const draw=[
    box(0,-.24,0,9.5,.45,6.5,'#aa987a'),
    // A consistent 9x6 meter authored room plan; low cutaway walls for the spectator camera.
    box(-2.5,-.006,-1.5,3.94,.10,2.94,C.floor[0]),
    box(2,-.006,-1.5,4.94,.10,2.94,C.floor[1]),
    box(-2.5,-.006,1.5,3.94,.10,2.94,C.floor[2]),
    box(2,-.006,1.5,4.94,.10,2.94,C.floor[3]),
    box(-4.55,.52,0,.14,1.04,6.2,C.wall),box(4.55,.52,0,.14,1.04,6.2,C.wall),
    box(0,.52,-3.05,9.1,1.04,.14,C.wall),box(0,.52,3.05,9.1,1.04,.14,C.wall),
    // Interior partitions leave deliberate visible openings (doors).
    box(-.5,.42,-2,.13,.84,1.9,C.wall),box(-.5,.42,1.93,.13,.84,2,C.wall),
    box(-3.2,.42,0,2.5,.13,.13,C.trim),box(2.5,.42,0,3.9,.13,.13,C.trim),
    box(-4.5,1.07,0,.18,.09,6.2,C.trim),box(4.5,1.07,0,.18,.09,6.2,C.trim)
  ];
  const furnitureEntities=world.entities.filter(e=>e.id.startsWith('furniture:'));
  const actors=world.entities.filter(e=>e.id.startsWith('resident:')).map(e=>{
    const a=house.actors.find(r=>'resident:'+r.id===e.id);
    if(!a||!Object.hasOwn(PALETTE,a.id))throw Error('house_visual_invalid_resident');
    return {id:a.id,name:a.name,x:e.transform.position.x,z:e.transform.position.z,
      color:PALETTE[a.id],action:a.action,scale:.40};
  });
  for(const entity of furnitureEntities)draw.push(...furnishing(entity));
  return {schema:HOUSE_VISUAL_SCHEMA,sourceTick:house.tick,sourceVersion:world.version,
    sourceWorldId:world.id,renderer:'evercraft-worlds-existing-webgl2',
    authority:'browser-local-projection',draw,actors};
}
