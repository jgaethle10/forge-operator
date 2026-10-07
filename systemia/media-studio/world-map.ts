import type { GeoRoute } from './visual-stage.js';

export interface ProjectedPoint {
  x:number;
  y:number;
  visible:boolean;
}

function clamp(value:number,min:number,max:number){
  return Math.max(min,Math.min(max,value));
}

function wrapLon(lon:number){
  let value=((lon+180)%360+360)%360-180;
  if(value===-180 && lon>0) value=180;
  return value;
}

export interface GeoFitBounds {
  north:number;
  south:number;
  east:number;
  west:number;
  paddingPct?:number;
}

function mercatorY(deg:number){
  const rad=clamp(deg,-85,85)*Math.PI/180;
  return Math.log(Math.tan(Math.PI/4+rad/2))/(2*Math.PI);
}

export function projectGeo(input:{
  lat:number;
  lon:number;
  projection:'equirectangular'|'mercator';
  width:number;
  height:number;
  centerLat?:number;
  centerLon?:number;
  zoom?:number;
  fitBounds?:GeoFitBounds;
}):ProjectedPoint{
  const lon=wrapLon(input.lon);
  const lat=clamp(input.lat,-85,85);

  if(input.fitBounds){
    const bounds=input.fitBounds;
    const padding=clamp(bounds.paddingPct??0.08,0,0.44);
    const west=wrapLon(bounds.west);
    const east=wrapLon(bounds.east);
    let lonSpan=east-west;
    if(lonSpan<=0) lonSpan+=360;
    const centerLon=wrapLon(west+lonSpan/2);
    let deltaLon=lon-centerLon;
    if(deltaLon>180) deltaLon-=360;
    if(deltaLon<-180) deltaLon+=360;
    const nx=deltaLon/360;

    const north=clamp(bounds.north,-85,85);
    const south=clamp(bounds.south,-85,85);
    const yNorth=input.projection==='mercator'?mercatorY(north):-north/180;
    const ySouth=input.projection==='mercator'?mercatorY(south):-south/180;
    const yCenter=(yNorth+ySouth)/2;
    const pointY=input.projection==='mercator'?mercatorY(lat):-lat/180;
    const ny=yCenter-pointY;

    const xNorm=Math.max(0.000001,lonSpan/360);
    const yNorm=Math.max(0.000001,Math.abs(yNorth-ySouth));
    const usableWidth=input.width*(1-padding*2);
    const usableHeight=input.height*(1-padding*2);
    const pixelsPerNorm=Math.min(usableWidth/xNorm,usableHeight/yNorm);
    const x=input.width/2+nx*pixelsPerNorm;
    const y=input.height/2+ny*pixelsPerNorm;
    return {x,y,visible:x>=0&&x<=input.width&&y>=0&&y<=input.height};
  }

  const centerLon=wrapLon(input.centerLon??0);
  const centerLat=clamp(input.centerLat??0,-85,85);
  const zoom=Math.max(0.1,input.zoom??1);
  let deltaLon=lon-centerLon;
  if(deltaLon>180) deltaLon-=360;
  if(deltaLon<-180) deltaLon+=360;
  const nx=deltaLon/360;
  const ny=input.projection==='mercator'
    ? mercatorY(centerLat)-mercatorY(lat)
    : (centerLat-lat)/180;
  const scale=Math.min(input.width,input.height);
  const x=input.width/2+nx*scale*zoom;
  const y=input.height/2+ny*scale*zoom;
  return {x,y,visible:x>=0&&x<=input.width&&y>=0&&y<=input.height};
}

export function splitAntimeridian(points:Array<{lat:number;lon:number}>){
  if(points.length<2) return points.length?[points]:[];
  const segments:Array<Array<{lat:number;lon:number}>>=[[points[0]]];
  for(let index=1;index<points.length;index+=1){
    const prev=points[index-1];
    const next=points[index];
    if(Math.abs(wrapLon(next.lon)-wrapLon(prev.lon))>180){
      segments.push([next]);
    }else{
      segments[segments.length-1].push(next);
    }
  }
  return segments.filter(segment=>segment.length>0);
}

function routeLengths(points:Array<{x:number;y:number}>){
  const lengths:number[]=[0];
  let total=0;
  for(let index=1;index<points.length;index+=1){
    const dx=points[index].x-points[index-1].x;
    const dy=points[index].y-points[index-1].y;
    total+=Math.hypot(dx,dy);
    lengths.push(total);
  }
  return {lengths,total};
}

export function trimProjectedRoute(points:Array<{x:number;y:number}>,progress:number){
  if(points.length<=1) return points;
  const p=clamp(progress,0,1);
  if(p>=1) return points;
  if(p<=0) return [points[0]];
  const {lengths,total}=routeLengths(points);
  const target=total*p;
  const output=[points[0]];
  for(let index=1;index<points.length;index+=1){
    if(lengths[index]<=target){
      output.push(points[index]);
      continue;
    }
    const prevLen=lengths[index-1];
    const span=lengths[index]-prevLen;
    const local=span<=0?0:(target-prevLen)/span;
    output.push({
      x:points[index-1].x+(points[index].x-points[index-1].x)*local,
      y:points[index-1].y+(points[index].y-points[index-1].y)*local
    });
    break;
  }
  return output;
}

export function projectRoute(route:GeoRoute,input:{
  projection:'equirectangular'|'mercator';
  width:number;
  height:number;
  centerLat?:number;
  centerLon?:number;
  zoom?:number;
  fitBounds?:GeoFitBounds;
  progress?:number;
}){
  return splitAntimeridian(route.points).map(segment=>{
    const projected=segment.map(point=>projectGeo({...input,...point}));
    return trimProjectedRoute(projected,input.progress??1);
  });
}
