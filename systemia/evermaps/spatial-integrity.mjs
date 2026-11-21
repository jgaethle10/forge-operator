/** Lossless GeoJSON source-integrity audit. Bounding-box overlaps are NOT polygon intersections. */
import {createHash} from 'node:crypto';

function isCoord(c) {
  return Array.isArray(c) && c.length>=2 && c.length<=4 &&
    Number.isFinite(c[0]) && Number.isFinite(c[1]) &&
    c[0]>=-180 && c[0]<=180 && c[1]>=-90 && c[1]<=90;
}
function sameXY(a,b) {return a[0]===b[0]&&a[1]===b[1];}
function ringArea2(ring) {
  let sum=0;
  for (let j=0;j<ring.length-1;j++) sum+=ring[j][0]*ring[j+1][1]-ring[j+1][0]*ring[j][1];
  return sum;
}
function geometryWalk(geometry) {
  if (!geometry||!['Point','MultiPoint','LineString','Polygon','MultiPolygon'].includes(geometry.type)) {
    throw new Error('Unsupported or missing geometry');
  }
  const points=[];
  if (geometry.type==='Point') {
    if (!isCoord(geometry.coordinates)) throw new Error('Invalid WGS point');
    points.push(geometry.coordinates);
  } else if (geometry.type==='Polygon'||geometry.type==='MultiPolygon') {
    const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
    if (!Array.isArray(polygons)||polygons.length<1) throw new Error('Missing polygon');
    for (const polygon of polygons) {
      if (!Array.isArray(polygon)||polygon.length<1) throw new Error('Missing polygon rings');
      for (const ring of polygon) {
        if (!Array.isArray(ring)||ring.length<4||ring.length>1000000) throw new Error('Invalid ring vertex count');
        if (!ring.every(isCoord)||!sameXY(ring[0],ring[ring.length-1])) throw new Error('Ring not closed or coordinates invalid');
        if (new Set(ring.slice(0,-1).map(p=>p[0]+','+p[1])).size<3) throw new Error('Fewer than three distinct vertices');
        if (Math.abs(ringArea2(ring))<1e-13) throw new Error('Degenerate polygon ring');
        points.push(...ring);
      }
    }
  } else {
    throw new Error('Unexpected WGS line or multipoint geometry');
  }
  return points;
}

export function bboxForGeometry(geometry) {
  const points=geometryWalk(geometry);
  const box=[Infinity,Infinity,-Infinity,-Infinity];
  for (const point of points) {
    box[0]=Math.min(box[0],point[0]);box[1]=Math.min(box[1],point[1]);
    box[2]=Math.max(box[2],point[0]);box[3]=Math.max(box[3],point[1]);
  }
  return box;
}
export function bboxOverlaps(a,b) {
  return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
}
export function auditGeojsonCollection(collection,{sourceLabel='unknown'}={}) {
  if (collection?.type!=='FeatureCollection'||!Array.isArray(collection.features)) {
    throw new Error('Expected complete source FeatureCollection');
  }
  const errors=[],boxes=[],seen=new Set();
  let vertexCount=0;
  for (let i=0;i<collection.features.length;i++) {
    const f=collection.features[i];
    const id=f?.properties?.OBJECTID;
    if (!Number.isSafeInteger(id)||seen.has(id)) {
      errors.push({index:i,object_id:id??null,issue:'missing_or_duplicate_object_id'});
      continue;
    }
    seen.add(id);
    try {
      const box=bboxForGeometry(f.geometry);
      boxes.push({id,box});
      // Includes closure coordinates; an audit metric, not an estimate of distinct sample sites.
      const geom=f.geometry;
      const polygons=geom.type==='Polygon'?[geom.coordinates]:
        geom.type==='MultiPolygon'?geom.coordinates:null;
      vertexCount+=polygons?polygons.reduce((sum,poly)=>sum+poly.reduce((v,ring)=>v+ring.length,0),0):1;
    } catch(e) {
      errors.push({index:i,object_id:id,issue:String(e.message)});
    }
  }
  const stable=collection.features.slice().sort((a,b)=>a.properties.OBJECTID-b.properties.OBJECTID);
  const digest=createHash('sha256').update(JSON.stringify(stable)).digest('hex');
  return {
    source_label:sourceLabel,record_count:collection.features.length,
    unique_object_ids:seen.size,valid_geometry_count:boxes.length,invalid_count:errors.length,
    sampled_coordinate_count:vertexCount,sha256_source_features: digest,
    audited_at:new Date().toISOString(),
    valid_for_mapping:errors.length===0&&boxes.length===collection.features.length,
    geometry_errors:errors.slice(0,25),
    geometry_error_count:errors.length,
    bbox_entries:boxes
  };
}
export function auditStudyEnvelopes(resources,studies) {
  const studyBoxes=studies.bbox_entries;
  const resourceBoxes=resources.bbox_entries;
  let hasPossible=0,noPossible=0;
  const candidates=[];
  for (const resource of resourceBoxes) {
    const matchIds=studyBoxes.filter(s=>bboxOverlaps(s.box,resource.box)).map(s=>s.id);
    if (matchIds.length) hasPossible++;
    else noPossible++;
    candidates.push({resource_object_id:resource.id,possible_study_ids:matchIds});
  }
  return {
    method:'BBOX_BROAD_PHASE_ONLY',
    means:'Box overlaps may include false positives. They do NOT prove mapped-study membership or polygon intersection.',
    resource_envelopes_with_possible_study_overlap:hasPossible,
    resource_envelopes_disjoint_from_studies:noPossible,
    actual_polygon_intersection_verified:false,
    candidates
  };
}
