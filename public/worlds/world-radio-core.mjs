// Evercraft Worlds / Live Radio. Pure, testable geo and catalog helpers.
// Stations and geographic claims must come from a live directory response, never demo fixtures.
export const RADIO_BROWSER_MIRRORS = Object.freeze([
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info'
]);
export const RADIO_PRESETS = Object.freeze([
  {name:'Yakima, Washington', lat:46.6021, lon:-120.5059, countrycode:'US', state:'Washington'},
  {name:'Seattle, Washington', lat:47.6062, lon:-122.3321, countrycode:'US', state:'Washington'},
  {name:'New York City', lat:40.7128, lon:-74.0060, countrycode:'US', state:'New York'},
  {name:'London', lat:51.5074, lon:-0.1278, countrycode:'GB', state:''},
  {name:'Tokyo', lat:35.6762, lon:139.6503, countrycode:'JP', state:'Tokyo'},
  {name:'São Paulo', lat:-23.5505, lon:-46.6333, countrycode:'BR', state:'São Paulo'}
]);
const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const toRad=n=>n*Math.PI/180;
export function distanceKm(aLat,aLon,bLat,bLon){
  if(!finite(aLat,-90,90)||!finite(bLat,-90,90)||!finite(aLon,-180,180)||!finite(bLon,-180,180))return Infinity;
  const lat=toRad(bLat-aLat),lon=toRad(bLon-aLon);
  const h=Math.sin(lat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(lon/2)**2;
  return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function radioQuery(lat,lon,radiusKm=350){
  if(!finite(lat,-90,90)||!finite(lon,-180,180)||!finite(radiusKm,1,1000))
    throw new RangeError('Invalid station discovery coordinates/radius');
  const q=new URLSearchParams({
    geo_lat:String(lat),geo_long:String(lon),geo_distance:String(Math.round(radiusKm*1000)),
    has_geo_info:'true',is_https:'true',hidebroken:'true',limit:'150',
    order:'votes',reverse:'true'
  });
  return '/json/stations/search?'+q.toString();
}
// This fallback uses only parameters documented by Radio Browser: it is a
// regional candidate search, NOT a geo-radius search. Results are still
// independently checked for real coordinates and haversine radius.
export function radioRegionalQuery(place){
  if(!place || !/^[A-Z]{2}$/.test(place.countrycode||''))return null;
  const q=new URLSearchParams({
    countrycode:place.countrycode,has_geo_info:'true',is_https:'true',
    hidebroken:'true',limit:'1000',order:'votes',reverse:'true'
  });
  if(typeof place.state==='string' && place.state.length>0 && place.state.length<=70)q.set('state',place.state);
  return '/json/stations/search?'+q.toString();
}
function safeStreamUrl(raw){
  try{
    const url=new URL(raw);
    return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;
  }catch{return null;}
}
export function normalizeRadioStations(rows,lat,lon,radiusKm=350){
  if(!Array.isArray(rows))throw new TypeError('Station response must be an array');
  const seen=new Set(),stations=[];
  for(const raw of rows){
    if(!raw||typeof raw!=='object'||typeof raw.stationuuid!=='string'||!(/^[0-9a-f-]{20,50}$/i.test(raw.stationuuid))||seen.has(raw.stationuuid))continue;
    const slat=raw.geo_lat==null?NaN:Number(raw.geo_lat),slon=raw.geo_long==null?NaN:Number(raw.geo_long);
    if(!finite(slat,-90,90)||!finite(slon,-180,180))continue;
    const km=distanceKm(lat,lon,slat,slon);
    if(km>radiusKm)continue;
    const stream=safeStreamUrl(raw.url_resolved)||safeStreamUrl(raw.url);
    if(!stream||Number(raw.lastcheckok)!==1)continue;
    const name=String(raw.name||'').trim().slice(0,100);
    if(!name)continue;
    seen.add(raw.stationuuid);
    stations.push({id:raw.stationuuid,name,stream,lat:slat,lon:slon,distanceKm:Math.round(km),
      country:String(raw.countrycode||'').slice(0,2),region:String(raw.state||'').slice(0,70),
      tags:String(raw.tags||'').slice(0,100),codec:String(raw.codec||'').slice(0,20),
      votes:Number(raw.votes)||0});
  }
  return stations.sort((a,b)=>a.distanceKm-b.distanceKm||b.votes-a.votes||a.name.localeCompare(b.name)).slice(0,24);
}
export function pointFromMap(x,y,width,height){
  if(!finite(x,0,width)||!finite(y,0,height)||!finite(width,1,100000)||!finite(height,1,100000))throw new RangeError('Invalid map pointer');
  return {lat:Math.max(-85,Math.min(85,90-180*y/height)),lon:Math.max(-180,Math.min(180,360*x/width-180))};
}
export function pointToMap(lat,lon,width,height){
  if(!finite(lat,-90,90)||!finite(lon,-180,180))throw new RangeError('Invalid station coordinates');
  return {x:(lon+180)/360*width,y:(90-lat)/180*height};
}
