/**
 * Timewalk archival-source acquisition gate.
 * Pure data validation only. It neither contacts archives nor pays for scans.
 * Catalog coverage is NOT equivalent to a verified sheet, edition date, license,
 * georeferencing result, or 1960 reconstructed scene.
 */
export const ARCHIVE_ACQUISITION_SCHEMA="evercraft.timewalk.archive-acquisition.v1";
const fail=why=>{throw Error("timewalk_acquisition_"+why)};
const text=v=>typeof v==="string"&&v.trim().length>0;
const https=v=>typeof v==="string"&&v.startsWith("https://");
const date=v=>/^\d{4}(?:-\d{2}-\d{2})?$/.test(String(v||""));
const city=(a,b)=>["city","region","country"].every(k=>
  text(a?.[k])&&String(a[k]).toLowerCase()===String(b?.[k]||"").toLowerCase());

export function validateArchiveAcquisition(a,ledger) {
  if(!a||a.schema!==ARCHIVE_ACQUISITION_SCHEMA||!ledger||
     a.worldId!==ledger.worldId||a.selectedYear!==ledger.sceneYear)
    fail("wrong_world_or_schema");
  if(!city(a.location,ledger.location.jurisdiction))fail("wrong_city");
  const catalog=a.catalog;
  const source=ledger.sources.find(s=>s.id===a.evidenceSourceId);
  if(!source||source.rights?.status!=="catalog_metadata_only"||
     source.url!==catalog?.sourceUrl)fail("source_catalog_unverified");
  if(!Array.isArray(catalog.holdingYearsListed)||!catalog.holdingYearsListed.includes(a.selectedYear)||
     catalog.collectionEditionYear!==a.selectedYear)
    fail("no_selected_year_in_catalog");
  if(!https(catalog.sourceUrl))fail("missing_catalog_url");
  if(!a.sourceAccess||!https(a.sourceAccess.sourceUrl)||
     a.sourceAccess.email!=="sanborn@csun.edu")fail("unverified_archive_contact");
  if(!Number.isFinite(a.sourceAccess.postedVolumePullFee)||
     !Number.isFinite(a.sourceAccess.postedImagingFeePerSheet)||
     a.sourceAccess.postedVolumePullFee<0||a.sourceAccess.postedImagingFeePerSheet<0)
    fail("invalid_fee_reference");
  if(!Array.isArray(a.searchTargets)||a.searchTargets.length<2||
     a.searchTargets.some(t=>!text(t.address)||!t.address.includes("Yakima, WA")))
    fail("insufficient_block_addresses");
  if(a.catalog.holdingStatus!=="catalog_verified_not_item_inspected")
    fail("acquisition_state_not_catalog_only");
  if(a.catalog.exactCoverageConfirmed||a.catalog.originalSheetInspected||
     a.catalog.originalSheetId!==null||a.catalog.itemLocator!==null||
     a.catalog.imageOriginalUrl!==null||a.catalog.sheetUpdateDate!==null||
     a.catalog.originalImageHash!==null||a.catalog.currentGeoreferencing!==null)
    fail("cannot_assert_1960_original_from_collection_listing");
  if(a.sourceAccess.acquisitionPaid||a.sourceAccess.purchaseAuthorized||
     a.sourceAccess.publicDistributionAllowed||
     a.sourceAccess.originalMapImageEmbeddingAllowed||
     a.sourceAccess.commercialDerivedGeometryAllowed||
     a.geometryReady||a.sourceOriginalVerified||a.worldsRuntimeAuthorized)
    fail("premature_publication_purchase_or_geometry");
  if(a.sourceAccess.priorInquirySent === true && (a.sourceAccess.inquiryStatus!=="sent-awaiting-archive-response" || a.sourceAccess.replyReceived!==false))
    fail("inconsistent_inquiry_state");
  return a;
}

export function archiveInquiryPacket(acquisition,ledger) {
  const a=validateArchiveAcquisition(acquisition,ledger);
  const targets=a.searchTargets.map(t=>"- "+t.address).join("\n");
  return {
    schema:"evercraft.timewalk.archive-inquiry.v1",
    recipient:a.sourceAccess.email,
    subject:"Research inquiry: 1960 Yakima Sanborn atlas, downtown Second / Third Street sheets",
    body:[
      "Hello CSUN Sanborn Collection team,",
      "",
      "I'm researching downtown Yakima, Washington as it appeared circa 1960.",
      "Your Washington holdings index lists Yakima Sanborn editions including 1960.",
      "Could you confirm which 1960 volume and map sheet number(s) cover:",
      targets,
      "",
      "Before any paid scans, could you please advise whether the sheets cover these specific locations; how their dates or correction stamps appear; what catalog/index metadata you can share at no cost; and whether a research scan can be obtained remotely?",
      "Please also explain the available permissions for an original historical research/interactive 3D reconstruction intended for public or eventual commercial viewing, including whether independent permission from the map copyright owner would be necessary.",
      "",
      "I have seen the posted $10 volume-pull and $20-per-sheet imaging schedule. This message is only an information request, not authorization for any paid service.",
      "",
      "Thank you."
    ].join("\n"),
    sendAuthorized:false,
    feeApproved:false,
    mediaPublicationApproved:false,
    deliveryStatus:a.sourceAccess.priorInquirySent===true?"sent-awaiting-archive-response":"not-sent",
    inquiryAlreadySent:a.sourceAccess.priorInquirySent===true,
    flags:[a.sourceAccess.priorInquirySent===true?"sent-awaiting-archive-response":"not-sent","no-fee-authority","source-exact-sheet-unverified"]
  };
}

export function acquisitionReadiness(acquisition,ledger) {
  const a=validateArchiveAcquisition(acquisition,ledger);
  return {
    schema:"evercraft.timewalk.archive-readiness.v1",
    worldId:a.worldId,year:a.selectedYear,
    catalogHoldingConfirmed:true,
    exactSheetConfirmed:false,
    originalItemExamined:false,
    georeferencingAuthorized:false,
    publishOriginalMapAllowed:false,
    publicSceneAccuracyVerified:false,
    outstanding:[
      a.sourceAccess.priorInquirySent ? "Await CSUN response identifying downtown 1960 volume and sheet numbers" : "Ask archive for downtown block and 1960 sheet numbers",
      "Inspect original sheet and individual correction dates",
      "Get written public/commercial reuse permission if applicable",
      "Separate independent survey control-point verification and 1960 timeline review"
    ]
  };
}
