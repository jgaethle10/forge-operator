// KAIDANCE V05: pure scenic chapter descriptions. No telemetry or clock source.
// All routes supplied here are illustrative Evercraft architecture, never missions.
export const SCENIC_LEG_SECONDS=10.5;
export function scenicChapter(seconds,routes,systems){
 if(!Number.isFinite(seconds)||seconds<0)throw Error('scenic_time_invalid');
 if(!Array.isArray(routes)||!routes.length||!systems||typeof systems!=='object')throw Error('scenic_graph_missing');
 const ordinal=Math.floor(seconds/SCENIC_LEG_SECONDS);
 const index=ordinal%routes.length;
 const pair=routes[index];
 if(!Array.isArray(pair)||pair.length!==2)throw Error('scenic_route_invalid');
 const from=systems[pair[0]],to=systems[pair[1]];
 if(!from||!to)throw Error('scenic_node_missing');
 const progress=(seconds%SCENIC_LEG_SECONDS)/SCENIC_LEG_SECONDS;
 return {
  ordinal,index,total:routes.length,
  fromKey:pair[0],toKey:pair[1],from,to,progress,
  phase:progress<.19?'DEPARTURE':progress<.78?'TRAVERSAL':'APPROACH',
  // Local arrival bloom is scenic only, independent of verified heartbeat.
  arrival:Math.max(0,Math.min(1,(progress-.78)/.22)),
  progressPercent:Math.round(progress*100),
  kind:'ILLUSTRATED JOURNEY',
  title:to.name,
  meta:from.name+' → '+to.name+' · '+to.detail+' · Not a live mission'
 };
}
