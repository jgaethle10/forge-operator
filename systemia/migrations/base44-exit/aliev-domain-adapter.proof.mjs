import assert from 'node:assert/strict';
import { adaptLegacyAliEvEntity, normalizeUsState } from './aliev-domain-adapter.mjs';

assert.equal(normalizeUsState('Washington'),'WA');
assert.equal(normalizeUsState('wa'),'WA');
assert.equal(normalizeUsState('New York'),'NY');
assert.equal(normalizeUsState(''),'');

const chargers=adaptLegacyAliEvEntity({
  entityName:'EVNationalChargePoint',
  rows:[
    {id:'old',external_id:'portseattle:old',station_name:'Old',address:'17801 International Blvd, SeaTac, WA 98188',data_status:'retired'},
    {id:'live',external_id:'PORT-OF-SEATTLE:SEA-GARAGE:L2:94',station_name:'SEA Airport Parking Garage Level 2 EV Charging',address:'17801 International Blvd, SeaTac, WA 98188',latitude:47.4475,longitude:-122.3080,ports:94,data_status:'verified',source_url:'https://example.test/sea'}
  ]
});
assert.equal(chargers.domain,'charging_inventory');
assert.equal(chargers.accepted,1);
assert.equal(chargers.excluded,1);
assert.equal(chargers.records[0].state,'WA');
assert.equal(chargers.records[0].postal_code,'98188');
assert.equal(chargers.exclusions[0].reason,'retired_charging_inventory');

const usage=adaptLegacyAliEvEntity({
  entityName:'EVObservedUsageAggregate',
  rows:[{
    id:'usage-1',aggregate_key:'site:2026-08',station_external_id:'PORT-OF-SEATTLE:SEA-GARAGE:L2:94',
    charging_sessions_count:88,period_start:'2026-08-01',period_granularity:'month',
    data_status:'verified',source_url:'https://example.test/sessions'
  }]
});
assert.equal(usage.domain,'observed_sessions');
assert.equal(usage.records[0].station_external_id,'PORT-OF-SEATTLE:SEA-GARAGE:L2:94');
assert.equal(usage.records[0].charging_sessions_count,88);
assert.match(usage.records[0].session_semantics,/not unique vehicles/i);

const stock=adaptLegacyAliEvEntity({
  entityName:'EVStateStockApproxAggregate',
  rows:[{
    id:'wa-stock',aggregate_key:'us:WA:2025:afdc',state_name:'Washington',reference_year:2025,
    bev_count_rounded:236400,phev_count_rounded:57100,total_light_duty_vehicles_rounded:6876900,
    source_name:'AFDC',source_url:'https://example.test/stock'
  }]
});
assert.equal(stock.domain,'local_ev_stock');
assert.equal(stock.records[0].state,'WA');
assert.equal(stock.records[0].bev_count,236400);
assert.equal(stock.records[0].phev_count,57100);

const nevi=adaptLegacyAliEvEntity({
  entityName:'WashingtonNEVIAwardSite',
  rows:[{id:'nevi-1',city:'Toppenish',corridor:'US-97',awardee:'Example',status:'awarded_pipeline',minimum_ports:4}]
});
assert.equal(nevi.domain,'deep_market_evidence');
assert.equal(nevi.records[0].state,'WA');
assert.equal(nevi.records[0].operational_status,'not_asserted_operational');
assert.match(nevi.records[0].guardrail,/must not be promoted/i);

const tariff=adaptLegacyAliEvEntity({
  entityName:'EVOpsTariff',
  rows:[{id:'rate-1',state:'WA',utility_name:'Example Utility',rate_name:'EV-1',energy_rate_per_kwh:null,demand_charge_per_kw:7}]
});
assert.equal(tariff.domain,'utility_tariff');
assert.equal(tariff.records[0].energy_rate_per_kwh,null);
assert.equal(tariff.records[0].tariff_assignment_status,'UNCONFIRMED');

for(const result of [chargers,usage,stock,nevi,tariff]){
  for(const row of result.records){
    assert.equal(row.migration_lineage.source_platform,'base44');
    assert.equal(row.migration_lineage.source_entity,result.source_entity);
    assert.ok(row.record_key.startsWith('legacy:'));
  }
}

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.aliev.legacy-domain-adapter-proof.v1',
  retired_chargers_excluded:true,
  station_linkage_preserved:true,
  state_names_normalized:true,
  nevi_pipeline_not_promoted_to_operating:true,
  tariff_null_not_zero:true,
  migration_lineage_preserved:true
},null,2));
