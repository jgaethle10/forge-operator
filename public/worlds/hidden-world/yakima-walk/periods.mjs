// Evidence-backed period labels for a deliberately NON-surveyed Yakima history gallery.
// These are dated interpretive artwork LENSES. None represents measured architecture,
// a verified inter-building connection, a real entrance or an underground passage.
import {YAKIMA_SCENE,validateYakimaScene,buildYakimaDrawList} from './scene.mjs';
export const YAKIMA_PERIOD_SCHEMA='evercraft.hidden-world.yakima-period-lenses.v1';
export const YAKIMA_PERIODS=Object.freeze([
 Object.freeze({id:'1899',label:'1899',title:'Alfalfa Saloon',
  record:'Lund Building completed in 1899; original saloon used the truncated corner entrance.',
  certainty:'The building and historical use are documented. This doorway and canopy are NOT a measured reconstruction.',
  source_url:'https://npgallery.nps.gov/GetAsset/34270517-7a19-422d-a0a6-3070adf1befa'}),
 Object.freeze({id:'1910',label:'c. 1910',title:'Chicago Clothing storefront',
  record:'The Lund building was converted to clothing retail circa 1910 with large plate-glass display windows.',
  certainty:'The change of use and glazing are documented. Individual glass panels, signage and dimensions are imagined.',
  source_url:'https://npgallery.nps.gov/GetAsset/34270517-7a19-422d-a0a6-3070adf1befa'}),
 Object.freeze({id:'1920s',label:'1920s',title:'Retail facade with marquee',
  record:'The 1983 nomination reports a metal marquee added to the Yakima Avenue facade in the 1920s.',
  certainty:'The marquee period is documented, but not an exact year, projection, shape or location in this model.',
  source_url:'https://npgallery.nps.gov/GetAsset/34270517-7a19-422d-a0a6-3070adf1befa'})
]);
const IDS=new Set(YAKIMA_PERIODS.map(p=>p.id));
export function getYakimaPeriod(id){
 if(!IDS.has(id))throw Error('unknown_yakima_period');
 return YAKIMA_PERIODS.find(p=>p.id===id);
}
export function buildYakimaPeriodDrawList(periodId='1910',scene=YAKIMA_SCENE){
 const period=getYakimaPeriod(periodId);
 validateYakimaScene(scene);
 const features=[];
 const add=(x,y,z,sx,sy,sz,color,name)=>features.push({x,y,z,sx,sy,sz,color,
  tier:'interpretive',name,periodId,provenance:'illustrative_geometry_only'});
 // Gallery wall is visually based on documented stone-building CATEGORY, not a scaled facade.
 const x=7.55,z=-9;
 if(period.id==='1899'){
  add(x,1.45,z+5,.18,2.9,1.9,'#454038','Interpretive 1899 saloon doorway');
  add(x+.06,2.88,z+5,.14,.25,2.2,'#d8bc8e','Symbolic 1899 stone lintel');
  add(x-.45,2.72,z+1,.95,.13,11,'#877058','Artist-made saloon-era canopy');
  add(x-.65,2.32,z+1,.30,.17,10.2,'#d6bd8e','Unmeasured canopy highlight');
 }else{
  // These retail-glass objects were already classified as fiction in the first Yakima walk.
  // They are shown only in retail-era lenses, never at the original 1899 saloon phase.
  const retail=buildYakimaDrawList(scene).filter(o=>o.tier==='interpretive');
  for(const item of retail)features.push({...item,periodId,provenance:'illustrative_geometry_only'});
  // A broad display-window entrance silhouette, not a surveyed door position.
  add(x,1.5,z+5,.16,2.8,1.9,'#34545e','Illustrative Chicago Clothing street entrance');
  if(period.id==='1920s'){
   // The 1920s metal marquee is a DOCUMENTED modification. This size and profile are invented.
   add(x-.72,3.38,z,1.6,.26,16,'#555f5c','Interpretive 1920s marquee');
   add(x-.84,3.17,z,1.18,.12,15.5,'#d2b884','Unmeasured underside of marquee');
   for(const p of [z-6,z,z+6])add(x-.74,3.28,p,1.7,.12,.24,'#877b6b','Marquee decorative crossbar');
  }
 }
 return features;
}
export function validateYakimaPeriodDrawList(periodId,items){
 getYakimaPeriod(periodId);
 if(!Array.isArray(items)||items.length<3)throw Error('empty_period_artwork');
 for(const o of items){
  if(o.tier!=='interpretive'||o.periodId!==periodId||o.provenance!=='illustrative_geometry_only'||
   [o.x,o.y,o.z,o.sx,o.sy,o.sz].some(n=>!Number.isFinite(n))||
   !/^#[0-9a-f]{6}$/i.test(o.color))throw Error('period_provenance_or_geometry_invalid');
 }
 return true;
}
for(const p of YAKIMA_PERIODS)validateYakimaPeriodDrawList(p.id,buildYakimaPeriodDrawList(p.id));
