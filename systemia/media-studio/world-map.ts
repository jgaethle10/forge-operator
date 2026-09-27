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

export function projectGeo(input:{
  lat:number;
  lon:number;
  projection:'equirectangular'|'mercator';
  width:number;
  height:number;
  centerLat?:number;
  centerLon?:number;
  zoom?:number;
}):ProjectedPoint{
  const centerLon=wrapLon(input.centerLon??0);
  const centerLat=clamp(input.centerLat??0,-85,85);
  const zoom=Math.max(0.1,input.zoom??1);
  const lon=wrapLon(input.lon);
  const lat=clamp(input.lat,-85,85);

  let deltaLon=lon-centerLon;
  if(deltaLon>180) deltaLon-=360;
  if(deltaLon<-180) deltaLon+=360;

  let nx=deltaLon/360;
  let ny:number;
  if(input.projection==='mercator'){
    const merc=(deg:number)=>{
      const rad=deg*Math.PI/180;
      return Math.log(Math.tan(Math.PI/4+rad/2))/(2*Math.PI);
    };
    ny=merc(centerLat)-merc(lat);
  }else{
    ny=(centerLat-lat)/180;
  }

  const x=input.width/2+nx*input.width*zoom;
  const y=input.height/2+ny*input.height*zoom;
  return {
    x,
    y,
    visible:x>=0&&x<=input.width&&y>=0&&y<=input.height
  };
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
  progress?:number;
}){
  return splitAntimeridian(route.points).map(segment=>{
    const projected=segment.map(point=>projectGeo({...input,...point}));
    return trimProjectedRoute(projected,input.progress??1);
  });
}
