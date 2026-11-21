/**
 * Evercraft Timewalk / museum drawings source intake.
 * Index metadata is not an examined architectural original, measured plan,
 * verified as-built condition, publication license, or 1960 city model.
 * This adapter changes no canonical Worlds engine state.
 */
export const ARCHIVE_DRAWING_SCHEMA='evercraft.timewalk.archive-drawing-catalog.v1';
const fail=reason=>{throw Error('timewalk_drawings_'+reason)};
const safe=s=>typeof s==='string'&&s.trim().length>0;
const https=s=>safe(s)&&s.startsWith('https://');

export function validateDrawingCatalog(catalog,ledger) {
  if(!catalog||catalog.schema!==ARCHIVE_DRAWING_SCHEMA||!ledger||
     catalog.worldId!==ledger.worldId)fail('schema_or_world');
  const owner=catalog.archive;
  const source=ledger.sources.find(x=>x.id===owner?.catalogSourceId);
  if(!source||source.rights?.status!=='catalog_metadata_only'||
     source.url!==owner.catalogUrl||!https(owner.catalogUrl)||
     owner.email!=='john@yvmuseum.org')fail('unverified_archive_catalog');
  if(owner.inquirySent!==true||owner.replyReceived!==false||
     owner.purchaseAuthorized!==false||owner.paid!==false)
    fail('unverified_or_paid_archive_status');
  if(!Array.isArray(catalog.catalogItems)||catalog.catalogItems.length<3)
    fail('catalog_items_missing');
  const ids=new Set(),places=new Set(ledger.places.map(x=>x.id));
  for(const item of catalog.catalogItems) {
    if(!safe(item.id)||ids.has(item.id)||!places.has(item.placeId)||
       !safe(item.title)||!safe(item.catalogLocation)||item.catalogAccession!=='0096-085')
      fail('invalid_catalog_item');
    ids.add(item.id);
    if(item.inspectionStatus!=='catalog-only'||item.archiveItemConfirmed!==false||
       item.geometrySourceApproved!==false||item.historicallyBuiltAsDrawn!==null||
       item.unchangedBy1960!==null)
      fail('uninspected_plan_claiming_1960_authority');
    if(!Array.isArray(item.listedSheetGroups)||item.listedSheetGroups.some(g=>!safe(g.type)||!safe(g.range)))
      fail('invalid_sheet_index');
    if(!item.rights||item.rights.itemReviewed!==false||
       item.rights.publicReproductionAllowed!==false||
       item.rights.commercialDerivativeAllowed!==false)
      fail('item_rights_not_proven');
    if(item.originalDesignYear!==null &&
       (!Number.isInteger(item.originalDesignYear)||item.originalDesignYear>1960))
      fail('invalid_original_design_year');
  }
  const must=['larson-office-july1930','larson-linen-tracings-july1930','capitol-alterations-june1930'];
  if(must.some(id=>!ids.has(id)))fail('essential_original_index_missing');
  const permission=catalog.outputAuthority;
  if(!permission||permission.canPublishArchivalImages!==false||
     permission.canUseAsBuilt1960Geometry!==false||
     permission.canOverwriteWorldsScene!==false)fail('unapproved_render_or_rights');
  return catalog;
}

/** Maps the verified catalog *entries*, NOT the drawings, to a reversible review queue. */
export function makeDrawingResearchQueue(catalog,ledger) {
  validateDrawingCatalog(catalog,ledger);
  return {
    schema:'evercraft.timewalk.drawing-review-queue.v1',
    worldId:catalog.worldId,
    archive:catalog.archive.name,
    inquiryStatus:'sent-awaiting-archivist',
    sourceIndexUrl:catalog.archive.catalogUrl,
    items:catalog.catalogItems.map(x=>({
      id:x.id,placeId:x.placeId,title:x.title,
      catalogAccession:x.catalogAccession,catalogLocation:x.catalogLocation,
      indexedSheetGroups:x.listedSheetGroups.map(g=>({...g})),
      originalDesignYear:x.originalDesignYear,
      originalInspected:false,
      actualAsBuiltYear1960Verified:false,
      publicAndCommercialReuseApproved:false,
      workflowState:'awaiting_archive_confirmation',
      requestedEvidence:[
        'Confirm physical holdings, titles and dates',
        'Check drawings for proposed versus as-built status and later revisions',
        'Obtain access and copyright/derivative-use terms',
        'Only after review compare against 1960 images and historic building records'
      ]
    })),
    unresolvedItemCount:catalog.catalogItems.length,
    allowableActions:['read_catalog','request_no_fee_lookup','record_archivist_reply'],
    geometry:null,originalImages:[],
    renderer:null,worldsAuthority:false,
    readyForProduction:false
  };
}
