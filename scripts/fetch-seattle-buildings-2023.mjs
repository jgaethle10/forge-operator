// Build-time ONLY. Fetch a bounded subset of City of Seattle 2023 building outlines,
// reduce geographic polygons to axis-aligned rectangles for a low-end mobile renderer.
// Height values are NOT sourced: the game assigns synthetic heights separately.
// Official endpoint: https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/Building_Outlines_2023/FeatureServer/0
import {writeFileSync,mkdirSync} from 'node:fs';
const ORIGIN={lat:47.610,lon:-122.340};
const xFor=lon=>(lon-ORIGIN.lon)*111320*Math.cos(ORIGIN.lat*Math.PI/180);
const zFor=lat=>(lat-ORIGIN.lat)*111320;
const rectangles=[];
let fetched=0,skipped=0;
const endpoint='https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/Building_Outlines_2023/FeatureServer/0/query';
for(let offset=0;offset<6000;offset+=1000){
 const q=new URLSearchParams({
  where:'1=1',outFields:'OBJECTID',returnGeometry:'true',
  geometry:'-122.359,47.596,-122.323,47.627',
  geometryType:'esriGeometryEnvelope',spatialRel:'esriSpatialRelIntersects',
  inSR:'4326',outSR:'4326',f:'geojson',
  resultOffset:String(offset),resultRecordCount:'1000',orderByFields:'OBJECTID ASC'
 });
 const response=await fetch(endpoint+'?'+q.toString(),{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Seattle_city_GIS_HTTP_'+response.status);
 const data=await response.json();
 if(data.error)throw Error('Seattle_GIS_error_'+JSON.stringify(data.error).slice(0,250));
 const features=data.features||[];
 fetched+=features.length;
 for(const item of features){
  const g=item.geometry;
  if(!g||!['Polygon','MultiPolygon'].includes(g.type)){skipped++;continue;}
  const rings=g.type==='Polygon'?g.coordinates:g.coordinates.flat();
  let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
  for(const ring of rings)for(const point of ring){
   if(!Array.isArray(point)||point.length<2)continue;
   const [lon,lat]=point;if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
   west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat);
  }
  if(!Number.isFinite(west)){skipped++;continue;}
  const x=(xFor(west)+xFor(east))/2,z=(zFor(south)+zFor(north))/2;
  const width=xFor(east)-xFor(west),depth=zFor(north)-zFor(south);
  if(width<3||depth<3||width>270||depth>270||x < -1900||x > 1900||z < -1700||z > 1900){skipped++;continue;}
  rectangles.push([Math.round(x),Math.round(z),Math.max(3,Math.round(width)),Math.max(3,Math.round(depth))]);
 }
 if(features.length<1000)break;
}
if(rectangles.length<300)throw Error('Seattle_GIS_insufficient_coverage_'+rectangles.length);
rectangles.sort((a,b)=>{const a0=a[0]*a[0]+a[1]*a[1],b0=b[0]*b[0]+b[1]*b[1];return a0-b0;});
const subset=rectangles.filter((r,i)=>i<1200||Math.hypot(r[0],r[1])<1600).slice(0,1800);
const payload={schema:'evercraft.worlds.seattle.city-outlines-2023.v1',source:'City of Seattle, Building Outlines 2023',source_url:endpoint.split('/query')[0],
  attribution:'City of Seattle GIS Open Data; individual footprints simplified to rectangles. No actual building heights, roof shapes or collision certification.',
  bbox_wgs84:[-122.359,47.596,-122.323,47.627],origin:ORIGIN,units:'meters',geometry_type:'axis_aligned_footprint_bbox',
  heights:'UNVERIFIED_SYNTHETIC',total_footprints:fetched,retained:subset.length,rects:subset};
const text=JSON.stringify(payload);
mkdirSync('public/worlds/flight/data',{recursive:true});
writeFileSync('public/worlds/flight/data/seattle-buildings-2023.json',text+'\n');
console.log('SEATTLE_GIS_CAPTURE_META '+JSON.stringify({fetched,skipped,retained:subset.length,bytes:text.length}));
console.log('SEATTLE_GIS_JSON_BEGIN'+text+'SEATTLE_GIS_JSON_END');
