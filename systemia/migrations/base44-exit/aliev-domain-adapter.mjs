const clean=(v)=>String(v??'').trim();
const lower=(v)=>clean(v).toLowerCase();
const clone=(v)=>structuredClone(v||{});

const US_STATE_CODES={
  alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',colorado:'CO',connecticut:'CT',
  delaware:'DE',florida:'FL',georgia:'GA',hawaii:'HI',idaho:'ID',illinois:'IL',indiana:'IN',iowa:'IA',
  kansas:'KS',kentucky:'KY',louisiana:'LA',maine:'ME',maryland:'MD',massachusetts:'MA',michigan:'MI',
  minnesota:'MN',mississippi:'MS',missouri:'MO',montana:'MT',nebraska:'NE',nevada:'NV',
  'new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC',
  'north dakota':'ND',ohio:'OH',oklahoma:'OK',oregon:'OR',pennsylvania:'PA','rhode island':'RI',
  'south carolina':'SC','south dakota':'SD',tennessee:'TN',texas:'TX',utah:'UT',vermont:'VT',
  virginia:'VA',washington:'WA','west virginia':'WV',wisconsin:'WI',wyoming:'WY',
  'district of columbia':'DC'
};
const KNOWN_CODES=new Set(Object.values(US_STATE_CODES));

export const ALIEV_LEGACY_DOMAIN_MAP={
  EVNationalChargePoint:'charging_inventory',
  EVObservedUsageAggregate:'observed_sessions',
  EVTrafficProfile:'traffic_temporal',
  EVOpsTariff:'utility_tariff',
  EVStateStockApproxAggregate:'local_ev_stock',
  RivetMarketEvidence:'deep_market_evidence',
  RivetExternalEvidence:'deep_market_evidence',
  RivetSiteBenchmark:'deep_market_evidence',
  RivetUtilityProgramEvidence:'deep_market_evidence',
  WashingtonNEVIAwardSite:'deep_market_evidence',
  EVOpsSourceRecord:'provenance',
};

export function normalizeUsState(value){
  const raw=clean(value);
  if(!raw)return '';
  const upper=raw.toUpperCase();
  if(KNOWN_CODES.has(upper))return upper;
  return US_STATE_CODES[lower(raw)]||'';
}
function inferUsAddressParts(address){
  const text=clean(address);
  const match=text.match(/(?:,|\s)\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/i);
  return match?{state:match[1].toUpperCase(),postal_code:match[2]}:{state:'',postal_code:''};
}
function migrationKey(entity,row,index){
  const candidates=[
    row?.external_id,row?.aggregate_key,row?.profile_key,row?.snapshot_key,
    row?.evidence_key,row?.benchmark_key,row?.station_external_id,row?.source_station_id,row?.id
  ].map(clean).filter(Boolean);
  return 'legacy:'+entity+':'+(candidates[0]||String(index));
}
function common(entity,row,index){
  const out=clone(row);
  const inferred=inferUsAddressParts(out.address);
  const normalized=normalizeUsState(out.state||out.state_code||out.state_name);
  if(normalized)out.state=normalized;
  else if(inferred.state&&!out.state)out.state=inferred.state;
  if(!clean(out.postal_code)&&inferred.postal_code)out.postal_code=inferred.postal_code;
  out.record_key=migrationKey(entity,row,index);
  out.migration_lineage={
    schema:'evercraft.aliev.legacy-lineage.v1',
    source_platform:'base44',
    source_entity:entity,
    source_record_id:clean(row?.id)||null,
    migrated_record_key:out.record_key,
  };
  return out;
}
function transform(entity,row,index){
  const out=common(entity,row,index);
  if(entity==='EVStateStockApproxAggregate'){
    out.state_name=clean(row?.state_name);
    out.state=normalizeUsState(row?.state_name||row?.state);
    out.bev_count=row?.bev_count_rounded??row?.bev_count??null;
    out.phev_count=row?.phev_count_rounded??row?.phev_count??null;
    out.total_light_duty_vehicles=row?.total_light_duty_vehicles_rounded??row?.total_light_duty_vehicles??null;
    out.evidence_state=clean(row?.evidence_state)||'STATE_LEVEL_PROXY_ONLY';
  }
  if(entity==='WashingtonNEVIAwardSite'){
    out.state='WA';
    out.evidence_state=clean(row?.evidence_state)||'AWARDED_PIPELINE_NOT_OPERATIONAL';
    out.operational_status='not_asserted_operational';
    out.guardrail='Award/funding evidence must not be promoted to operating charging inventory without separate energized-site verification.';
  }
  if(entity==='RivetUtilityProgramEvidence'){
    out.guardrail=clean(row?.eligibility_guardrail)||'Program/rate evidence is not site eligibility, tariff assignment, funding award, or observed utilization.';
  }
  if(entity==='EVOpsTariff'){
    out.tariff_assignment_status=clean(row?.tariff_assignment_status)||'UNCONFIRMED';
    out.guardrail=clean(row?.guardrail)||'Tariff record is candidate context until the exact serving utility, service class, voltage and applicability are verified.';
  }
  if(entity==='EVObservedUsageAggregate'){
    out.evidence_state=clean(row?.evidence_state)||'OBSERVED_AGGREGATE';
    out.session_semantics='Observed aggregate sessions are not unique vehicles and missing periods are not zero.';
  }
  if(entity==='EVNationalChargePoint'){
    out.evidence_state=clean(row?.evidence_state)||'PUBLIC_INVENTORY';
  }
  if(entity==='EVOpsSourceRecord'){
    out.evidence_state=clean(row?.evidence_state)||clean(row?.data_status)||'SOURCE_RECORD';
  }
  return out;
}

export function adaptLegacyAliEvEntity({entityName,rows=[]}={}){
  const domain=ALIEV_LEGACY_DOMAIN_MAP[entityName];
  if(!domain)throw new Error('unsupported_legacy_entity:'+entityName);
  if(!Array.isArray(rows))throw new Error('rows_must_be_array');
  const accepted=[],excluded=[];
  rows.forEach((row,index)=>{
    if(!row||typeof row!=='object'){
      excluded.push({index,reason:'invalid_row'});
      return;
    }
    if(entityName==='EVNationalChargePoint'&&lower(row.data_status)==='retired'){
      excluded.push({id:clean(row.id)||null,reason:'retired_charging_inventory'});
      return;
    }
    const record=transform(entityName,row,index);
    if(entityName==='EVStateStockApproxAggregate'&&!clean(record.state)){
      excluded.push({id:clean(row.id)||null,reason:'us_state_normalization_failed'});
      return;
    }
    accepted.push(record);
  });
  return {
    schema:'evercraft.aliev.legacy-domain-adapter.v1',
    source_entity:entityName,
    domain,
    submitted:rows.length,
    accepted:accepted.length,
    excluded:excluded.length,
    records:accepted,
    exclusions:excluded,
    semantics:'Migration adapter preserves evidence state and source provenance. Exclusion is explicit; missing is never zero.',
  };
}
