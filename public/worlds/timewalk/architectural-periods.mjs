/**
 * Timewalk historical building profile adapter. No renderer, geometry or physics.
 * The 1984 NRHP document identifies an alteration in 1963; this temporal
 * distinction must survive when canonical Evercraft Worlds adds a year slider.
 */
export const ARCH_PERIODS_SCHEMA='evercraft.timewalk.architectural-periods.v1';
const fail=reason=>{throw Error('timewalk_architecture_'+reason)};
const yearValid=n=>Number.isInteger(n)&&n>=1800&&n<=2100;
export function validatePeriodProfile(p,ledger){
  if(!p||p.schema!==ARCH_PERIODS_SCHEMA||p.sceneGeometry!==null||
     p.mesh!==null||p.coordinates!==null||p.rendererAuthority!=='evercraft-worlds')
    fail('invalid_profile_or_geometry_authority');
  if(!ledger||p.worldId!==ledger.worldId||
    !ledger.places?.some(x=>x.id===p.placeId))fail('wrong_world_or_place');
  if(!yearValid(p.constructionYear)||!Array.isArray(p.evidenceWindows)||p.evidenceWindows.length<2)
    fail('invalid_year_windows');
  const sources=new Set(ledger.sources.map(x=>x.id));
  if(!Array.isArray(p.sourceIds)||!p.sourceIds.length||
    p.sourceIds.some(id=>!sources.has(id)))fail('missing_sources');
  if(p.physicalDescription?.sourceId!=='nps-larson-1984-nomination'||
     !sources.has(p.physicalDescription.sourceId)||
     p.physicalDescription.exact1960DimensionsValidated!==false)
    fail('unsupported_measurement_accuracy');
  if(p.physicalDescription?.asDocumentedYear!==1984 ||
     p.physicalDescription?.heightFeetToFlagpole!==188 ||
     p.physicalDescription?.widthFeet!==65 ||
     p.physicalDescription?.lengthFeet!==130)
    fail('measurement_source_mismatch');
  if(!Array.isArray(p.historicalAlterations)||p.historicalAlterations.length!==1||
     p.historicalAlterations[0].calendarYear!==1963||
     !sources.has(p.historicalAlterations[0].sourceId))
    fail('missing_1963_remodel_provenance');
  let end=p.constructionYear-1;
  for(const w of p.evidenceWindows){
    if(!yearValid(w.startYear)||!yearValid(w.endYear)||w.startYear>end+1||
       w.startYear!==end+1||w.endYear<w.startYear||w.endYear>1984 ||
       !['year_level_uncertain','retrospectively_inferred','unresolved'].includes(w.classification))
      fail('overlapping_missing_or_overconfident_year_window');
    end=w.endYear;
  }
  if(end!==1984||p.forwardUnknownAfterYear!==1984 ||
     p.historicalAlterations[0].datePrecision!=='year_only')
    fail('unknown_later_year_or_alteration_date');
  return p;
}
/** Determine an evidence-backed appearance *cue*, never a scene mesh. */
export function resolvePeriodAppearance(p,ledger,year){
  validatePeriodProfile(p,ledger);
  if(!yearValid(year))fail('invalid_requested_year');
  let classification='unresolved',appearance='not_verified_for_year',period='unknown';
  if(year<p.constructionYear){
    classification='documented';appearance='not_yet_built';period='preconstruction';
  }else{
    const w=p.evidenceWindows.find(w=>year>=w.startYear&&year<=w.endYear);
    if(w){classification=w.classification;appearance=w.appearance;period=w.period;}
  }
  const sourceId='nps-larson-1984-nomination';
  const source=ledger.sources.find(x=>x.id===sourceId);
  return {
    schema:'evercraft.timewalk.period-appearance-cue.v1',
    worldId:p.worldId,placeId:p.placeId,requestedYear:year,
    appearance,classification,period,sourceId,sourceUrl:source.url,
    sourceObservationYear:1984,
    directlyObservedInRequestedYear:false,
    landmarkAddress:p.location.address,
    accurateHistoricalGeometry:false,
    approvedToModifyWorld:false,
    geometry:null,mesh:null,coordinateTransform:null,
    caveat:year===1960
      ? '1960 pre-1963 storefronts are supported by the 1984 nomination’s retrospective alteration history. Exact 1960 tenants, appearance and dimensions are not established.'
      : 'Appearance is a source-linked period cue, not a measured year-specific reconstruction.'
  };
}
