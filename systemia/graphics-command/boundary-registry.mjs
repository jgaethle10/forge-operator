import { WASHINGTON_STATE_OUTLINE } from './assets/washington-state-outline.mjs';

const ASSETS=new Map([
  [WASHINGTON_STATE_OUTLINE.id,WASHINGTON_STATE_OUTLINE],
]);

export function getGeoBoundary(id){
  return ASSETS.get(String(id||'').trim()) || null;
}

export function geoBoundaryProvenance(id){
  const asset=getGeoBoundary(id);
  if(!asset) return null;
  return {
    id:asset.id,
    name:asset.name,
    abbreviation:asset.abbreviation,
    geometryType:asset.geometryType,
    sourceRef:asset.provenance.sourceRef,
    upstream:asset.provenance.upstream,
    rightsState:asset.provenance.rightsState,
    license:asset.provenance.license,
    sourceSha256:asset.provenance.sourceSha256,
    transform:asset.provenance.transform,
  };
}
