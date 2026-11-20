// KAIDANCE V07 / illustrated field geometry, not actual mission routing.
export const SCENIC_ROUTES=Object.freeze([
 ['systemia','kaidance'],['kaidance','discovery'],
 ['discovery','hudson'],['hudson','kaidance'],
 ['kaidance','raven'],['raven','evidence'],
 ['evidence','saban'],['saban','systemia']
].map(pair=>Object.freeze(pair)));

export const CONFLUENCE_CONNECTIONS=Object.freeze([
 ['systemia','kaidance'],['kaidance','hudson'],
 ['discovery','kaidance'],['kaidance','raven'],
 ['kaidance','saban'],['saban','evidence'],
 ['hudson','evidence'],['raven','evidence'],
 ['systemia','discovery'],['discovery','saban'],
 ['hudson','raven'],
 // These two visible corridors were previously missing even though the
 // scenic traveler traveled them in chapters 3 and 8.
 ['discovery','hudson'],['saban','systemia']
].map(pair=>Object.freeze(pair)));
export const edgeKey=(a,b)=>[a,b].sort().join(':');
export const visibleEdges=new Set(CONFLUENCE_CONNECTIONS.map(([a,b])=>edgeKey(a,b)));
export function connectedDestinations(key){
 if(typeof key!=='string'||!key)return [];
 const result=[];
 for(const [a,b] of CONFLUENCE_CONNECTIONS){
  if(a===key)result.push(b);
  else if(b===key)result.push(a);
 }
 return result;
}
export function activeCorridorExists(from,to){
 return visibleEdges.has(edgeKey(from,to));
}
