/**
 * Historical route storyboard, NOT a geographic route planner.
 * The canonical Evercraft Worlds engine alone owns walk movement/physics/rendering.
 */
import {makeHistoricalOverlay} from './historical-evidence.mjs';
import {resolvePeriodAppearance} from './architectural-periods.mjs';
import {makeMapSheetAnchors} from './map-sheet-anchors.mjs';
export const WALK_TOPOLOGY_SCHEMA='evercraft.timewalk.walk-topology.v1';
const fail=(message)=>{throw Error('timewalk_walk_topology_'+message)};
const matchPlace=(a,b)=>['city','region','country'].every(k=>String(a?.[k]||'').toLowerCase()===String(b?.[k]||'').toLowerCase());
export function validateWalkTopology(route,ledger){
  if(!route || route.schema!==WALK_TOPOLOGY_SCHEMA || route.worldId!==ledger?.worldId ||
      route.sceneYear!==ledger.sceneYear || route.mode!=='walk')
    fail('invalid_scene_year_or_schema');
  if(!matchPlace(route.location,ledger.location.jurisdiction)||route.location.city!=='Yakima')
    fail('wrong_city');
  if(route.historical1960CrossingsVerified!==false||route.realWorldNavigationAuthorized!==false ||
     route.geometry!==null||route.coordinates!==null||route.metricDistances!==null)
    fail('invented_navigation_authority');
  const ids=new Set(ledger.places.map(p=>p.id));
  const sources=new Set(ledger.sources.map(s=>s.id));
  if(!Array.isArray(route.sources)||route.sources.length<2||
     route.sources.some(x=>!sources.has(x.sourceId)||!Number.isInteger(x.sourceYear)))
    fail('missing_source_links');
  if(!Array.isArray(route.routeNodes)||route.routeNodes.length<3 ||
     !Array.isArray(route.routeSegments)||route.routeSegments.length!==route.routeNodes.length-1)
    fail('invalid_walk_structure');
  const nodes=new Map();
  for(const node of route.routeNodes){
    if(!node.id||nodes.has(node.id)||node.position!==null ||
       (node.placeId!==null&&!ids.has(node.placeId)))
      fail('bad_node_or_fake_position');
    nodes.set(node.id,node);
  }
  for(let i=0;i<route.routeSegments.length;i++){
    const edge=route.routeSegments[i];
    if(edge.from!==route.routeNodes[i].id||edge.to!==route.routeNodes[i+1].id||
       !nodes.has(edge.from)||!nodes.has(edge.to)||edge.distanceMeters!==null||
       edge.status!=='illustrative-walk-sequence'||edge.historical1960CrossingVerified!==false)
      fail('broken_walk_sequence_or_fake_distance');
  }
  if(route.routeNodes[0].placeId!=='ae-larson' || route.routeNodes.at(-1).placeId!=='capitol' ||
     route.routeNodes[0].tourStop!==27 || route.routeNodes.at(-1).tourStop!==10)
    fail('landmark_route_mismatch');
  if(route.authoringCue?.integrationStatus!=='data-contract-only-not-executable-navigation')
    fail('route_not_engine_neutral');
  return route;
}
export function makeTimewalkSceneHandoff(ledger,route,architecture,archiveAcquisition=null){
  validateWalkTopology(route,ledger);
  const evidence=makeHistoricalOverlay(ledger,route.sceneYear);
  const architecturalCue=resolvePeriodAppearance(architecture,ledger,route.sceneYear);
  const historicalMapAnchors=archiveAcquisition ? makeMapSheetAnchors(archiveAcquisition,ledger) : null;
  return {
    schema:'evercraft.timewalk.scene-handoff.v1',
    worldId:route.worldId,sceneYear:route.sceneYear,mode:'walk',
    owner:'canonical-evercraft-worlds',
    targetRuntime:'evercraft-worlds',
    historicalEvidence:evidence,
    architecturalCues:[architecturalCue],
    historicalMapAnchors,
    orderedWaypoints:route.routeNodes.map(n=>({
      id:n.id,placeId:n.placeId,title:n.title,
      streetContext:n.streetContext,position:null,worldPosition:null,
      provenance:n.nodeEvidence
    })),
    segments:route.routeSegments.map(e=>({
      id:e.id,from:e.from,to:e.to,streetLabel:e.streetLabel,
      historical1960CrossingVerified:false,distanceMeters:null
    })),
    geometry:null,walkingPaths:null,renderer:null,physics:null,
    navigationAuthorized:false,
    productionWorldReady:false,
    reviewRequired:true,
    warnings:[
      'Street sequence is a research storyboard based on modern route orientation, not verified 1960 sidewalk geometry.',
      'Canonical Worlds must provide all player movement, physics, rendering, placement and persistent scenes.',
      'Building appearance before the 1963 bank remodel is retrospectively inferred, not a 1960 photogrammetric facade.',
      'Archivist identified Yakima Sanborn sheets 6 and 15 and reports matching 1952/1960 footprints; original 1960 sheets remain uninspected and no georeferenced geometry is approved.'
    ]
  };
}
