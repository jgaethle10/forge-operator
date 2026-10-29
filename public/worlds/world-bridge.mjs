import {validateWorld} from './world-core.mjs';
// Explicit data bridge into the existing Systemia World Engine V1 schema.
// Browser scene appearance is a render projection, not a replacement physics authority.
const pos=(x,y,z)=>({x,y,z});
const dims={tree:[.32,1.7,.32],flower:[.16,.5,.16],bench:[.9,.6,.36],lamp:[.2,1.4,.2],rock:[.47,.25,.36],mushroom:[.4,.4,.4]};
export function toEngineWorld(scene){
 validateWorld(scene);
 const entities=[
  {id:'scene:workshop',name:'Mossmere Workshop',transform:{position:pos(-3.2,2,-4.2)},collider:{type:'box',halfExtents:pos(4,2,3.95)},tags:['worlds','building','static'],properties:{visualSource:'original_procedural'}},
  {id:'scene:pond',name:'Glasswater Pond',transform:{position:pos(7,0,-5)},tags:['worlds','water'],properties:{visualSource:'original_procedural'}},
  {id:'scene:portal',name:'Sunlit Cove Portal',transform:{position:pos(3,2.45,-10.2)},tags:['worlds','portal'],properties:{destination:'sunlit-cove'}},
  ...scene.objects.map(o=>({id:`object:${o.id}`,name:o.kind,transform:{position:pos(o.x,0,o.z)},collider:{type:'box',halfExtents:pos(...dims[o.kind])},tags:['worlds','user_created',o.kind],properties:{source:'local_browser_builder'}})),
  ...scene.agents.map(a=>({id:`character:${a.id}`,name:a.name,transform:{position:pos(a.x,0,a.z)},tags:['worlds','character','local_scripted_behavior'],properties:{mood:a.mood,goal:a.goal}}))
 ];
 return {schema:'evercraft.world-engine.world.v1',id:'worlds-mossmere-v1',version:scene.revision,tickRateHz:60,gravity:pos(0,-9.81,0),ground:{enabled:true,height:0},entities,metadata:{producer:'evercraft-worlds-browser-prototype',sourceSchema:scene.schema,productionAuthoritative:false,collaborationEnabled:false}};
}