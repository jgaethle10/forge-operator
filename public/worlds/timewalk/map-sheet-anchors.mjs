/**
 * Curator-identified historical map references for canonical Evercraft Worlds.
 * Sheet numbers and publicly linked 1952 scans are real evidence references.
 * They do not grant a 1960 scene footprint, georeferencing or media license
 * for the distinct CSUN-held 1960-corrected physical volume.
 */
import {validateArchiveAcquisition} from './archive-acquisition.mjs';

export const MAP_ANCHORS_SCHEMA='evercraft.timewalk.map-sheet-anchors.v1';
const fail=x=>{throw Error('timewalk_map_anchors_'+x)};
export function makeMapSheetAnchors(acquisition,ledger) {
 const a=validateArchiveAcquisition(acquisition,ledger);
 if(a.sourceAccess.replyReceived!==true || a.sourceAccess.archiveSheetNumbersConfirmed!==true)
   fail('archive_has_not_identified_sheets');
 const source=ledger.sources.find(x=>x.id==='loc-yakima-1952-sheets-six-fifteen');
 if(!source || source.rights?.status!=='public_domain_per_holding_institution' ||
    !source.evidencePeriod.includes('1952'))
   fail('missing_loc_1952_baseline');
 const receipt=a.curatorConfirmation;
 const permittedLandmarks=new Map([[6,'ae-larson'],[15,'capitol']]);
 for(const sheet of receipt.sheetMatches){
   if(!permittedLandmarks.has(sheet.sheetNumber) ||
      permittedLandmarks.get(sheet.sheetNumber)!==sheet.landmark ||
      !ledger.places.some(p=>p.id===sheet.landmark))
      fail('sheet_not_bound_to_named_place');
 }
 return {
   schema:MAP_ANCHORS_SCHEMA,
   targetWorld:a.worldId,
   targetYear:a.selectedYear,
   status:'archivist-identified-location-original-1960-not-inspected',
   curatorReportedVolumeCorrectedThrough:1960,
   individual1960CorrectionDateVerified:false,
   curatorReportedFootprintsMatch1952:true,
   curatorFootprintStatementScope:'two_named_landmark_buildings_only',
   correctionRoundsReported:receipt.additionalReply?.reportedCorrectionRounds??null,
   bothSheetsCarryUndatedCorrections:receipt.additionalReply?.bothSheetsHaveCorrections===true,
   surroundingBuildingsChanged:receipt.additionalReply?.surroundingBuildingsChangedBetween1952And1960===true,
   blanket1952NeighborhoodCarryForwardAllowed:false,
   individualPasteoverDatesRecoverable:false,
   independentFootprintComparisonComplete:false,
   sourceImageRights1952:'loc-online-public-domain',
   sourceImageRights1960:'unverified-separate-physical-copy',
   anchors:receipt.sheetMatches.map(sheet=>({
     id:'yakima-sanborn-'+sheet.sheetNumber,
     placeId:sheet.landmark,
     sheetNumber:sheet.sheetNumber,
     digitalEditionYear:1952,
     digitalViewerPage:sheet.locViewerPage,
     sourceId:source.id,
     viewerUrl:sheet.locViewerUrl,
     sourceStatus:'link-provided-by-archive-images-not-inspected',
     locationVerifiedByCurator:true,
     appearanceFor1960Proven:false,
     footprintFor1960IndependentlyVerified:false,
     historicCoordinates:null,
     georeferenced:false,
     extractedPolygon:null,
     imageEmbedded:false,
     original1960Inspected:false
   })),
   renderer:null,
   worldMovement:null,
   worldGeometry:null,
   realWorldNavigationAuthorized:false,
   publishing1960OriginalAllowed:false,
   accurate1960SceneAuthorized:false,
   nextReview:'Six map correction rounds, no individually dated pasteovers, nearby building changes known. Inspect LOC 1952 pixels and per-feature 1960 revisions; verify distinct CSUN rights and survey control points.'
 };
}
