// Evercraft Worlds: owned, same-origin destination catalog and navigation contract.
// This is an entry-point portal, not seamless scene streaming or shared player state.
const PATH=/^\/worlds\/(?:[a-z0-9/-]*)(?:#[a-z0-9-]+)?$/;
export function validateDestinationRegistry(value){
 if(!value||value.schema!=='evercraft.worlds.destinations.v1'||value.version!==1||!Array.isArray(value.destinations))throw Error('Invalid Worlds registry');
 const ids=new Set(),paths=new Set();
 for(const d of value.destinations){
  if(!d||typeof d.id!=='string'||!/^[a-z0-9-]+$/.test(d.id)||ids.has(d.id))throw Error('Duplicate or invalid destination id');
  if(typeof d.path!=='string'||!PATH.test(d.path)||d.path.includes('//')||paths.has(d.path))throw Error('Unsafe or duplicate destination route');
  if(typeof d.name!=='string'||!d.name.trim()||typeof d.description!=='string')throw Error('Invalid destination content');
  ids.add(d.id);paths.add(d.path);
 }
 if(!ids.has(value.home))throw Error('Unknown Worlds home');
 return value.destinations;
}
export function portalHref(path){
 if(typeof path!=='string'||!PATH.test(path)||path.includes('//'))throw Error('Unsafe portal route');
 return path;
}
export function filterDestinations(destinations,query='',category='all'){
 const term=String(query).trim().toLocaleLowerCase();
 return destinations.filter(d=>(category==='all'||d.category===category)&&(!term||[d.name,d.description,d.category,...d.capabilities].join(' ').toLocaleLowerCase().includes(term)));
}
