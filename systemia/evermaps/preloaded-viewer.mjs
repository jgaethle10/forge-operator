/**
 * Offline WGS map asset builder. Hashes all four original full-source layers
 * before embedding GeoJSON. No external basemap, owner records or source fetch.
 */
import {auditGeojsonCollection} from './spatial-integrity.mjs';
import {addNoScriptPreview} from './static-map-fallback.mjs';
const LAYERS=['resources','tests','mineHistory','studies'];
const MARKER='resetToggles();redraw();\n</script></body></html>';
export function buildPreloadedWgsViewer({template,collections,receipt}={}){
 if(receipt?.status!=='source_geometry_complete_broad_phase_only'||
    receipt?.county!=='Grant'||receipt?.source_data_completeness!==true)
  throw Error('Full verified Grant import required');
 if(typeof template!=='string'||template.split(MARKER).length!==2)
  throw Error('Known first-party viewer template marker required');
 const data={};
 for(const kind of LAYERS){
  const fc=collections?.[kind],manifest=receipt.layers?.[kind];
  if(!fc||!manifest?.complete||manifest?.fetched_features!==fc.features?.length||
      manifest?.geometry_audit?.valid_for_mapping!==true)throw Error('Missing complete '+kind+' layer');
  const audit=auditGeojsonCollection(fc,{sourceLabel:kind});
  if(!audit.valid_for_mapping||
     audit.sha256_source_features!==manifest.geometry_audit.sha256_source_features)
   throw Error('WGS '+kind+' source SHA-256 or geometry mismatch');
  data[kind]={type:'FeatureCollection',features:fc.features};
 }
 const sourceJson=JSON.stringify(data).replace(/[<>&\u2028\u2029]/g,ch=>
  ({'<':'\\u003c','>':'\\u003e','&':'\\u0026',
    '\u2028':'\\u2028','\u2029':'\\u2029'})[ch]);
 const script='// First-party offline preloaded WGS source data; loaded only after source SHA checks.\n'+
  'Object.assign(data,'+sourceJson+');\nresetToggles();onStatus();fit();\n</script></body></html>';
 const enhanced=addNoScriptPreview(template,data);
 // Replace inside the generated bootstrap script, not an earlier local-file change handler.
 const bootstrap=script.replace('resetToggles();onStatus();fit();',"resetToggles();onStatus();fit();\nconst preview=document.querySelector('#mobile-static-preview');if(preview)preview.hidden=true;\nconst controls=document.querySelector('.controls');if(controls)controls.style.display='flex';");
 return enhanced.replace(MARKER,bootstrap);
}
