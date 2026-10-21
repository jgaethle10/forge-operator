import fs from 'node:fs';

const read = p => fs.readFileSync(p,'utf8');
const generator = read('base44/functions/generateQuickReport/entry.ts');
const suggestions = read('base44/functions/addressSuggestions/entry.ts');
const availability = read('base44/functions/reportAvailability/entry.ts');
const app = read('src/App.jsx');
const quotedStrings = s => [
  ...[...s.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'/g)].map(m=>m[1]),
  ...[...s.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map(m=>m[1]),
  ...[...s.matchAll(/`([^`\\]*(?:\\.[^`\\]*)*)`/g)].map(m=>m[1]),
];
const exposesUpstreamBrand = s => quotedStrings(s).some(x=>/AliEV/i.test(x));

const checks = [
  ['generator targets canonical AliEV app', generator.includes("const ALIEV_APP_ID='69b9b64d86a732029ce0db81'")],
  ['generator calls AliEV energySiteLookup', generator.includes('/functions/energySiteLookup')],
  ['generator requests bounded RIVET report snapshot profile', generator.includes("mode:'rivet_report_snapshot'")],
  ['address suggestions proxy AliEV', suggestions.includes('69b9b64d86a732029ce0db81') && suggestions.includes('/functions/addressSuggestions')],
  ['report availability checks AliEV', availability.includes('69b9b64d86a732029ce0db81') && availability.includes('/functions/energySiteLookup')],
  ['generator rejects public/redacted AliEV payloads', generator.includes('PUBLIC_DISCOVERY_REDACTED') && generator.includes('commercial_access')],
  ['generator mints a short-lived one-time source grant', generator.includes('sourceGrantToken') && generator.includes('RIVET_SOURCE_GRANT_V1') && generator.includes('sourceGrantExpiresAt')],
  ['generator binds source grant to report and address', generator.includes("headers['X-RIVET-Internal-Grant']") && generator.includes("headers['X-RIVET-Report-Id']") && generator.includes('address_norm:normAddress(reportAddress)')],
  ['generator stores the transient grant only in an existing report field', generator.includes('aliev_report_data_json:sourceGrantEnvelope') && !generator.includes('source_grant_hash:')],
  ['generator persists AliEV provenance', ['aliev_source_status','aliev_app_id','aliev_evidence_state','aliev_retrieved_at','aliev_report_data_json','aliev_source_refs'].every(x=>generator.includes(x))],
  ['RIVET customer UI does not expose upstream product branding', !exposesUpstreamBrand(app) && /Build report|Building report/.test(app)],
  ['generated customer copy does not name upstream product', !exposesUpstreamBrand(generator)],
  ['address API response copy does not name upstream product', !exposesUpstreamBrand(suggestions)],
  ['RIVET report layer has no direct WSDOT endpoint', !generator.includes('data.wsdot.wa.gov')],
  ['RIVET report layer has no direct Caltrans endpoint', !generator.includes('caltrans-gis.dot.ca.gov')],
  ['RIVET report layer has no direct AFDC/NLR endpoint', !generator.includes('developer.nlr.gov')],
  ['RIVET report layer has no direct Nominatim endpoint', !generator.includes('nominatim.openstreetmap.org')],
  ['RIVET report layer has no direct Census geocoder endpoint', !generator.includes('geocoding.geo.census.gov')],
  ['No seeded Yakima test facts remain in report code', !generator.includes('54000') && !app.includes('54000 AADT') && !generator.includes('53 mapped public charging')],
];

let failed=0;
for(const [name,ok] of checks){
  console.log((ok?'PASS ':'FAIL ')+name);
  if(!ok) failed++;
}
if(failed){
  console.error('RIVET_ALIEV_PIPELINE_CONTRACT_FAIL '+failed+'/'+checks.length);
  process.exit(1);
}
console.log('RIVET_ALIEV_PIPELINE_CONTRACT_PASS '+checks.length+'/'+checks.length);