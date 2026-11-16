/** Only current-run, cryptographically source-linked, non-owner WA permit points can enter map. */
import {auditGeojsonCollection} from './spatial-integrity.mjs';
import {LAND_SOURCE_CATALOG} from './land-context.mjs';
const FIELDS=['OBJECTID','PERMIT_NO','COUNTY','COMMODITY'];
const SHA=/^[a-f0-9]{64}$/;
export function verifiedMapPermitLayer({wgsSourceSha256,permits,receipt}={}){
 const expected=LAND_SOURCE_CATALOG.washingtonSurfacePermits.url;
 if(!SHA.test(String(wgsSourceSha256??''))||
    receipt?.schema!=='evercraft.evermaps.permit-point-overlay-receipt.v1'||
    receipt?.state!=='point_geometry_overlay_verified'||
    receipt?.county!=='Grant'||receipt.geologic_source_sha256!==wgsSourceSha256||
    receipt.source!==expected||!SHA.test(String(receipt.permit_source_sha256??''))||
    receipt.site_recommendation_allowed!==false||
    receipt.land_title_verified!==false||
    !Number.isSafeInteger(receipt.permit_count)||receipt.permit_count<0)
  throw Error('Verified same-run permit overlay receipt required');
 if(permits?.type!=='FeatureCollection'||!Array.isArray(permits.features)||
    permits.features.length!==receipt.permit_count||
    permits.metadata?.complete!==true||
    permits.metadata?.source!==expected||
    permits.metadata?.sha256_source_features!==receipt.permit_source_sha256||
    permits.metadata?.source_count_before!==receipt.permit_count||
    permits.metadata?.source_count_after!==receipt.permit_count)
  throw Error('Missing or mismatched WA permit collection');
 const audit=auditGeojsonCollection(permits,{sourceLabel:'WA DNR approximate permit locations'});
 if(!audit.valid_for_mapping||audit.sha256_source_features!==receipt.permit_source_sha256)
  throw Error('WA permit geometry SHA-256 mismatch');
 const ids=new Set(),features=[];
 for(const f of permits.features){
  const p=f?.properties,loc=f?.geometry?.coordinates,oid=p?.OBJECTID;
  if(!Number.isSafeInteger(oid)||ids.has(oid)||p?.COUNTY!=='Grant'||
     !FIELDS.every(k=>Object.hasOwn(p,k))||
     f?.geometry?.type!=='Point'||!Array.isArray(loc)||
     loc.length<2||!loc.slice(0,2).every(Number.isFinite))
   throw Error('Invalid or duplicate permit map point');
  ids.add(oid);
  // Explicit allowlist discards all unsolicited applicant, operator, address
  // or other publisher attributes before they reach browser source.
  features.push({type:'Feature',properties:Object.fromEntries(FIELDS.map(k=>[k,p[k]])),
   geometry:{type:'Point',coordinates:loc.slice(0,2)}});
 }
 return {type:'FeatureCollection',features};
}
