import { collectUsdaSoilAtPoint } from './soil-source.mjs';
import { collectNwsPointForecast,nwsPointCoordinates } from './nws-site-forecast.mjs';

const SOURCE_IDS = Object.freeze(['USDA NRCS Soil Data Access / SSURGO','NOAA National Weather Service']);

function formatSoilMapUnits(source) {
  return (source.observation?.facts?.mapunits||[]).slice(0,6).map((row)=>({
    name:row.muname,
    survey_area_name:row.survey_area_name,
    farmland_classification:row.farmland_classification,
    survey_updated_at:row.source_updated_at||null,
    source_version:row.source_version,
    components:(row.components||[]).slice(0,3).map((c)=>({
      name:c.name,percentage:c.percent,slope_percent:c.slope_percent,major_component:c.major_component
    }))
  }));
}
function resultLine(settled,source) {
  if(settled.status==='rejected'){
    return {state:'unavailable',source,verified:false,detail:'The official source did not return verifiable data.'};
  }
  return {state:'returned',source,verified:true,detail:'The official source response was parsed with its evidence boundary.'};
}

// A single user-initiated, point-scoped snapshot combining two independently
// sourced products. Never invent a site verdict or merge this into regional signals.
export async function buildFaieSiteScan({
  latitude,longitude,fetchImpl=globalThis.fetch,
  retrievedAt=new Date().toISOString(),
  soilCollector=collectUsdaSoilAtPoint,
  weatherCollector=collectNwsPointForecast
}={}) {
  const point=nwsPointCoordinates(latitude,longitude);
  const [soilSettled,weatherSettled]=await Promise.allSettled([
    soilCollector({latitude:point.latitude,longitude:point.longitude,regionKeys:[],fetchImpl,retrievedAt}),
    weatherCollector({latitude:point.latitude,longitude:point.longitude,fetchImpl,retrievedAt})
  ]);
  const soil=soilSettled.status==='fulfilled'?soilSettled.value:null;
  const weather=weatherSettled.status==='fulfilled'?weatherSettled.value:null;
  const soilMapunits=soil?formatSoilMapUnits(soil):[];
  const soilAvailable=soilSettled.status==='fulfilled' && soilMapunits.length>0;
  const weatherAvailable=weatherSettled.status==='fulfilled'&&weather?.status==='forecast_available';
  const results=[
    {...resultLine(soilSettled,SOURCE_IDS[0]),state:soilSettled.status==='rejected'?'unavailable':soilAvailable?'mapped_data':'no_map_unit',usable_evidence:soilAvailable},
    {...resultLine(weatherSettled,SOURCE_IDS[1]),state:weatherSettled.status==='rejected'?'unavailable':weatherAvailable?'forecast_data':'forecast_freshness_unknown',usable_evidence:weatherAvailable}
  ];
  const returned=results.filter(x=>x.usable_evidence).length;
  const nextChecks=[
    'Confirm exact property boundary, ownership, zoning, and permitted use with the appropriate authority.',
    'Verify legal water rights, irrigation district allocations and actual seasonal supply for this parcel.',
    'Obtain an on-site soil assessment for the intended crops, drainage and construction requirements.',
    'Confirm utility service capacity, connection costs, energy tariffs and outage resilience with providers.',
    'Validate truck access, road restrictions, labor availability and actual local operating costs.',
    'Check long-term climate normals and historical extremes. A short forecast is not climate history.'
  ];
  if(!soilAvailable)nextChecks.unshift('Acquire or review site-specific soil survey and field evidence; no mapped unit was confirmed in this scan.');
  if(!weatherAvailable)nextChecks.unshift('Recheck the official point forecast: no current forecast was confirmed.');
  if(weather?.screening_flags?.length)nextChecks.push(
    'Review the flagged NWS forecast windows with site operators and adjust scheduling or mitigation where needed.'
  );
  return {
    schema:'evercraft.faie.site-scan.v1',
    state:returned===2?'bounded_evidence_available':returned===1?'partial_evidence':'insufficient_evidence',
    scanned_at:retrievedAt,
    coordinates:point,
    scope:'user-supplied point, not property boundaries or a whole region',
    sources_checked:SOURCE_IDS.length,
    sources_with_usable_evidence:returned,
    source_receipts:results,
    soil:{
      status:soilSettled.status==='rejected'?'unavailable':soilMapunits.length?'mapped_soil_available':'no_map_unit_found',
      source:SOURCE_IDS[0],
      evidence_state:'REPORTED',
      mapunit_count:soil?.mapunit_count??null,
      source_updated_at:soil?.observation?.facts?.source_updated_at??null,
      mapunits:soilMapunits,
      provenance_urls:soilSettled.status==='fulfilled'?
        ['https://sdmdataaccess.nrcs.usda.gov/WebServiceHelp.aspx']:[],
      warning:'Mapped soil polygons are not site soil tests or proof of suitability.'
    },
    weather:{
      status:weather?.status??'unavailable',
      source:SOURCE_IDS[1],
      evidence_state:'MODELED',
      forecast_issued_at:weather?.forecast_issued_at??null,
      forecast_freshness:weather?.forecast_freshness??'unavailable',
      forecast_office:weather?.forecast_office??null,
      periods:weather?.periods??[],
      screening_flags:weather?.screening_flags??[],
      threshold_rules:weather?.threshold_rules??null,
      provenance_urls:weather?.provenance_urls??[],
      warning:'NWS forecasts are modeled point-area projections, not observed conditions or site suitability.'
    },
    next_checks:nextChecks,
    unknowns:[
      'Actual parcel water rights, utility capacity, economics, field soil conditions and permits were not verified.',
      'Short-range weather forecasts do not establish historical freeze, drought or heat frequency.',
      ...results.filter(x=>!x.usable_evidence).map(x=>x.source+': usable evidence was not confirmed.')
    ],
    privacy:{
      public_lookup_persisted:false,
      upstream_receives_site_coordinates:true,
      automatic_publication:false
    },
    field_verification_required:true,
    site_suitability_verdict:null,
    investment_recommendation:null,
    decision_authority:false,
    publication_authority:false
  };
}
