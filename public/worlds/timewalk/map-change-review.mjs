/**
 * Temporal change review for Timewalk Yakima 1952 -> 1960 map evidence.
 * Never infer that all 1952 structures survived to 1960 merely because the
 * A.E. Larson Building and Capitol Theatre appeared unchanged to the archivist.
 * No geometry, movement or renderer authority in this module.
 */
import {validateArchiveAcquisition} from './archive-acquisition.mjs';
export const MAP_CHANGE_REVIEW_SCHEMA='evercraft.timewalk.map-change-review.v1';
const fail=r=>{throw Error('timewalk_map_change_'+r)};

export function makeMapChangeReview(acquisition,ledger){
  const a=validateArchiveAcquisition(acquisition,ledger);
  const report=a.curatorConfirmation?.additionalReply;
  if(!report || report.reportedCorrectionRounds!==6 ||
     report.bothSheetsHaveCorrections!==true ||
     report.surroundingBuildingsChangedBetween1952And1960!==true ||
     report.individualPasteoverDatesRecorded!==false)
    fail('missing_2026_archive_followup');
  const named=[['ae-larson',6],['capitol',15]];
  for(const [placeId,sheetNumber] of named){
    if(!ledger.places.some(p=>p.id===placeId) ||
       !a.curatorConfirmation.sheetMatches.some(s=>s.landmark===placeId&&s.sheetNumber===sheetNumber))
      fail('landmark_not_in_both_source_registers');
  }
  return {
    schema:MAP_CHANGE_REVIEW_SCHEMA,
    worldId:a.worldId,
    selectedYear:1960,
    baselineYear:1952,
    evidenceKind:'archivist_correspondence_not_direct_1960_scan',
    evidenceStatus:'provisional_research',
    correctionRoundsReported:6,
    bothSheetsCorrected:true,
    pasteoverDateGranularity:'not_recorded',
    sixRoundDatesKnown:false,
    landmarkComparisons:named.map(([placeId,sheetNumber])=>({
      placeId,sheetNumber,comparison:'appears_identical_1952_to_1960_as_reported_by_archivist',
      scope:'named_landmark_building_only',
      supportsExact1960AsBuiltGeometry:false,
      supportsFacadeOrStorefront1960:false,
      proofYearObservation:'comparison_from_1960_corrected_atlas_without_individual_pasteover_date',
      measuredPolygon:null,georeferenced:false,
      needsIndependentMapImageReview:true
    })),
    surroundingStructures:{
      knownChangesOccurred:true,
      changedStructureIds:null,
      changedStructureCount:null,
      changedYears:null,
      mappedRevisions:null,
      status:'confirmed_change_exists_specifics_unknown',
      noBlanket1952CarryForward:true,
      requiresPerStructureReview:true
    },
    licenseStatus:{
      locOnline1952:'public_domain_per_holding_institution',
      csunPhysical1960:'unresolved',
      physical1960ScanLicensed:false,
      paidAcquisitionApproved:false
    },
    intendedConsumer:'existing_evercraft_worlds_source_overlay_only',
    all1952BuildingsSuitableFor1960:false,
    productionSceneAuthorized:false,
    geometry:null,
    renderer:null,
    walkingPaths:null,
    nextAction:'Review 1952 LOC sheet images and independently inspect 1960 map revisions where licensed. Identify and compare each nearby building before adding 1960 geometry.'
  };
}

/**
 * Classify a proposed feature in the source review queue.
 * This does NOT import it as a world entity or approve rendering.
 */
export function classify1952MapFeatureFor1960(feature,review){
  if(review?.schema!==MAP_CHANGE_REVIEW_SCHEMA||
     review.productionSceneAuthorized!==false ||
     review.all1952BuildingsSuitableFor1960!==false ||
     review.surroundingStructures?.noBlanket1952CarryForward!==true)
    fail('invalid_review_authority');
  if(!feature||typeof feature.id!=='string'||!feature.id.trim()||
     feature.sourceYear!==1952 || feature.requestedYear!==1960 ||
     feature.sourceType!=='loc-online-sanborn')
    fail('invalid_feature_provenance');
  const named=review.landmarkComparisons.find(x=>x.placeId===feature.placeId);
  const isLandmark=Boolean(named);
  return {
    id:feature.id,
    sourceYear:1952,targetYear:1960,
    featurePlaceId:feature.placeId??null,
    category:isLandmark?'named_landmark_reported_unchanged':'surrounding_structure_1960_unresolved',
    evidenceConfidence:isLandmark?'archivist_report_only':'unverified_for_1960',
    sheetNumber:isLandmark?named.sheetNumber:null,
    canCopy1952FootprintInto1960:false,
    canCopy1952FacadeInto1960:false,
    currentGeometryVerified:false,
    recommendedTreatment:isLandmark?
      'review_landmark_against_original_1960_sheet_before_geometry':
      'defer_or_label_interpretive_until_per_structure_1960_comparison',
    geometry:null,
    approval:'requires_independent_review'
  };
}
