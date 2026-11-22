// Shared route-based Wayfinder journeys. Navigation only: no position, save, or identity transfer.
import {validateDestinationRegistry,portalHref} from './world-portal.mjs';
export function pickWayfinderContext(pathname,hash=''){
 if(pathname==='/worlds/hidden-world/yakima-walk/')return {current:'yakima-history-walk',next:'seattle-sky',label:'From Yakima history to Seattle skies'};
 if(pathname==='/worlds/flight/'&&hash==='#seattle')return {current:'seattle-sky',next:'yakima-history-walk',label:'From Seattle skies to Yakima history'};
 if(pathname==='/worlds/flight/')return {current:'flight-range',next:'seattle-sky',label:'Take the Seattle Sky Tour'};
 if(pathname==='/worlds/')return {current:'mossmere',next:'seattle-sky',label:'From Mossmere to Seattle skies'};
 return {current:null,next:'mossmere',label:'Explore Mossmere'};
}
export function buildWayfinderEntries(registry,pathname,hash=''){
 const destinations=validateDestinationRegistry(registry);
 const context=pickWayfinderContext(pathname,hash);
 const active=destinations.find(d=>d.id===context.current)||null;
 const recommended=destinations.find(d=>d.id===context.next)||null;
 return {active,recommended,description:context.label,entries:destinations.map(d=>({
  id:d.id,name:d.name,category:d.category,path:portalHref(d.path),active:d.id===context.current
 }))};
}
