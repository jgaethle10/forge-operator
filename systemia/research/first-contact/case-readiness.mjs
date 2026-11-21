/** FIRST-CONTACT-001 | Claim-level source readiness, never an alien origin classifier.
 * true=affirmatively present, false=affirmatively absent, null=not established.
 */
const FIELDS=['nativeMedia','calibratedBearings','timeCalibration','observerPositions','observerAttitudes','slantRange','syncedIndependentSecondView','independentObserverPositions','rawSensorMetadata','windConditions'];
const need=(o,keys)=>keys.every(k=>o[k]===true);
export function evaluateCaseReadiness(caseRecord){
  if(!caseRecord || typeof caseRecord!=='object' || typeof caseRecord.id!=='string' || !caseRecord.id.trim()) throw new TypeError('Case id required');
  const facts=caseRecord.facts;
  if(!facts || typeof facts!=='object') throw new TypeError('Case facts object required');
  for(const [k,v] of Object.entries(facts)){
    if(!FIELDS.includes(k)) throw new TypeError('Unknown evidence field: '+k);
    if(v!==null && v!==true && v!==false) throw new TypeError('Facts must be true, false, or null: '+k);
  }
  const normalized=Object.fromEntries(FIELDS.map(k=>[k,Object.hasOwn(facts,k)?facts[k]:null]));
  const singleView=['calibratedBearings','timeCalibration','observerPositions','observerAttitudes','slantRange'];
  const dualView=['calibratedBearings','timeCalibration','observerPositions','observerAttitudes','syncedIndependentSecondView','independentObserverPositions'];
  const methods={
    single_view_3d_trajectory:need(normalized,singleView),
    dual_view_triangulation_possible:need(normalized,dualView),
    independently_replayable:need(normalized,['nativeMedia','rawSensorMetadata','timeCalibration'])
  };
  const state=methods.single_view_3d_trajectory||methods.dual_view_triangulation_possible?'GEOMETRY_INPUTS_POSSIBLE':'UNREADY_FOR_3D_MOTION';
  const missing=FIELDS.filter(k=>normalized[k]===false);
  const unknown=FIELDS.filter(k=>normalized[k]===null);
  return {id:caseRecord.id,state,methods,unknownFields:unknown,confirmedMissingFields:missing,
    extraordinaryPerformanceEstablished:false,extraterrestrialOriginEstablished:false,
    interpretation:'Readiness checks do not authenticate observations, determine object identity, estimate velocity, or establish novel propulsion',
    note:'Requires source provenance, numerical measurements and uncertainty validation separately; unknown is not absent'};
}
