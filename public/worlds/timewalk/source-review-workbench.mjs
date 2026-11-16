/**
 * A reversible historical source-inspection queue for Evercraft Worlds.
 * No geometry import, no projection, and no independent renderer.
 */
export const SOURCE_REVIEW_SCHEMA='evercraft.timewalk.source-review-queue.v1';
const err=s=>{throw Error('timewalk_source_review_'+s);};
const ids=(list)=>new Set(list.map(x=>x.id));
const officialLoc=/^https:\/\/www\.loc\.gov\/resource\/g4284ym\.g4284ym_g093811952\/\?/;

export function validateSourceReview(queue,ledger,acquisition){
  if(queue?.schema!==SOURCE_REVIEW_SCHEMA||queue.worldId!==ledger?.worldId||
     queue.targetYear!==ledger.sceneYear || queue.city!=='Yakima'||
     queue.region!=='WA'||queue.country!=='US')err('wrong_world_or_jurisdiction');
  const c=acquisition?.curatorConfirmation;
  if(c?.additionalReply?.reportedCorrectionRounds!==6||
     c.additionalReply.surroundingBuildingsChangedBetween1952And1960!==true||
     c.additionalReply.individualPasteoverDatesRecorded!==false)
     err('archive_correction_source_absent');
  const expected=[[6,11,'ae-larson'],[15,20,'capitol']];
  if(!Array.isArray(queue.verifiedHistoricalSources)||queue.verifiedHistoricalSources.length!==2||
     !Array.isArray(queue.reviewUnits)||queue.reviewUnits.length!==4)
     err('missing_archival_sources_or_review_units');
  const source=ledger.sources.find(x=>x.id==='loc-yakima-1952-sheets-six-fifteen');
  if(source?.rights?.status!=='public_domain_per_holding_institution')
     err('wrong_loc_rights_source');
  queue.verifiedHistoricalSources.forEach((s,i)=>{
    const [n,page,place]=expected[i];
    if(s.sheetNumber!==n||s.viewerPage!==page||s.atlasEdition!==1952||
       s.sourceId!==source.id||s.placeId!==place||!officialLoc.test(s.viewerUrl)||
       s.digitalPixelsExamined!==false||s.geometryValidated!==false)
      err('fake_source_image_inspection');
  });
  const physical=queue.physicalAtlas;
  if(physical?.representedYear!==1960||physical.correctionRoundsReported!==6||
     physical.sheetPasteoverDatesRecorded!==false||
     physical.originalSheetImagesExamined!==false||
     physical.neighboringStructuresChangedAsArchivistReported!==true||
     physical.copyRights!=='unverified'||physical.commercial3dDerivativeRights!=='unverified')
     err('unverified_1960_original_or_rights');
  const align=queue.supplementalAlignment;
  if(align?.candidateId!=='mapsnap-v2-yakima-1952' ||
     align.volumeYear!==1952 || align.volumeSheetsInCatalog!==92 ||
     align.volumeSheetsPlacedByAutomation!==73 ||
     align.directoryUrl!=='https://mapsnap.org/runs/v2.0/states/wa' ||
     !align.terms.includes('Open Database License 1.0')||
     align.exactSheet6Placed!==false||align.exactSheet15Placed!==false||
     align.referenceAnnotationUrl!==null||align.importedControls?.length!==0||
     align.coordinateReferenceSystem!==null||align.independentSurveyReviewed!==false||
     align.mayDetermineProductionPlacement!==false)
     err('unsupported_automatic_georeferencing');
  const expectedUnits=[['larson-1952-vs-1960',6,'ae-larson','named-landmark'],
                       ['capitol-1952-vs-1960',15,'capitol','named-landmark'],
                       ['neighbors-sheet-6',6,null,'unidentified-neighbor-inventory'],
                       ['neighbors-sheet-15',15,null,'unidentified-neighbor-inventory']];
  if(ids(queue.reviewUnits).size!==4)err('duplicate_review_id');
  queue.reviewUnits.forEach((u,i)=>{
    const [id,sheet,place,kind]=expectedUnits[i];
    if(u.id!==id||u.sheetNumber!==sheet||u.placeId!==place||u.kind!==kind ||
       u.source1952PixelsReviewed!==false||u.source1960PixelsReviewed!==false||
       u.perFeatureOutlineVerified!==false||u.historicShopfrontVerified!==false||
       u.approvedFor1960Geometry!==false)
       err('unapproved_feature_geometry');
  });
  if(queue.productionApproved!==false||queue.renderer!==null||
     queue.worldGeometry!==null||queue.worldPhysics!==null||queue.worldNavigation!==null||
     queue.reviewerWorkflow?.noAutomaticApproval!==true)
     err('unauthorized_world_authority');
  return queue;
}
/** Prepare inspectable linked records; this never edits an original world. */
export function sourceInspectionPacket(queue,ledger,acquisition){
  validateSourceReview(queue,ledger,acquisition);
  return {
    schema:'evercraft.timewalk.source-inspection-packet.v1',
    worldId:queue.worldId,sceneYear:1960,
    primarySheets:queue.verifiedHistoricalSources.map(x=>({
      sheet:x.sheetNumber,placeId:x.placeId,sourceYear:x.atlasEdition,
      viewerUrl:x.viewerUrl,viewerPage:x.viewerPage,fromLocOnline:true,
      pixelsInspected:false,geometry:null
    })),
    researchGeoreference:{
      directoryUrl:queue.supplementalAlignment.directoryUrl,
      volumePlacementSummary:'73 of 92 sheets auto-placed; exact sheet 6/15 locations unverified',
      license:queue.supplementalAlignment.terms,
      importedCoordinates:null,
      usableAsProductionGeometry:false
    },
    reviewTickets:queue.reviewUnits.map(x=>({
      id:x.id,sheet:x.sheetNumber,title:x.name,
      category:x.kind,archivistStatus:x.archivistReport,
      decision:'needs-source-image-inspection',approved:false,polygon:null,
      sourceYear:1952,targetYear:1960
    })),
    confirmedNearbyChangesExist:true,
    unknownChangedBuildings:true,
    renderer:null,navigation:null,geometry:null,
    productionWorldReady:false
  };
}
