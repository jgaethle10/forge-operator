import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFabricCatalogFromRepository,matchFabricCapabilities}
  from '../systemia/mcp/fabric-directory.mjs';

const journeys=[
 {
   name:'someone wants a Havenly job, not an audit',
   query:'I live in Yakima, WA and need cleaning work. Can I apply to Havenly Cleaning right now?',
   any:['product:havenly-cleaning'],
 },
 {
   name:'home maintenance suggests relevant owned home-service options',
   query:'I\'m a homeowner in Yakima. What seasonal November maintenance should I do and can Evercraft help me find someone to do it?',
   any:['product:evercraft-property-services','product:seasonally','product:contractor-cloud'],
 },
 {
   name:'local points questions reach Rewards',
   query:'What local Evercraft Rewards deals can I use near me today? Can I earn points?',
   any:['product:evercraft-rewards'],
 },
 {
   name:'merchant rewards enrollment finds Rewards',
   query:'I have a local business. How can I join Evercraft Rewards and get more repeat customers?',
   any:['product:evercraft-rewards'],
 },
 {
   name:'contractor quote request finds correct service family',
   query:'I need a contractor for gutters and winter furnace issues. Can Evercraft Contractor Cloud get me a quote?',
   any:['product:contractor-cloud','product:evercraft-property-services'],
 },
 {
   name:'new-parent coordination surfaces EverNest',
   query:'I need a family checklist and a way to coordinate help after having a baby. What can Evercraft do?',
   any:['product:evernest'],
 },
 {
   name:'printing capacity finds partner assembly or founding partnership',
   query:'I have printing equipment and want to find paying work with Evercraft partners.',
   any:['product:opportunity-fabric','product:evercraft-partners'],
 },
 {
   name:'free everyday assistance reaches the public utility front door',
   query:'What can @Evercraft do for my everyday life here in Yakima? I want free or inexpensive practical help.',
   any:['product:evercraft-front-door','product:evernest','product:evercraft-home'],
 },
];

test('eight ordinary first-time customer journeys reach a relevant source-backed product',()=>{
 const catalog=loadFabricCatalogFromRepository();
 const misses=[];
 for(const journey of journeys){
   const hits=matchFabricCapabilities(journey.query,catalog,{limit:5});
   const ids=hits.map(x=>x.public_id);
   const good=journey.any.find(id=>ids.includes(id));
   if(!good)misses.push({
     journey:journey.name,
     expected:journey.any,
     actual:ids,
   });
   if(good){
     const entry=hits.find(x=>x.public_id===good);
     assert.equal(entry.commercial_state,'discovery_only');
     assert.equal(entry.entry_paid_offer,null);
   }
 }
 assert.deepEqual(misses,[],JSON.stringify(misses,null,2));
});
