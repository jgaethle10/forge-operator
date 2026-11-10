import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  validateEvidence,EVIDENCE_SCHEMA,SNAPSHOT_PATH,isOfficialSource,
  formatNumber,sourceAgeLabel,shortDate,ratioLabel
} from '../public/watershed/model.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const evidence=JSON.parse(read('public/watershed/data/yakima-2026-11-09.json'));
const page=read('public/watershed/index.html');
const app=read('public/watershed/app.mjs');
const copy=v=>structuredClone(v);

test('source-hashed archive has complete valid observations and remains unapproved',()=>{
  assert.equal(evidence.schema,EVIDENCE_SCHEMA);
  assert.equal(SNAPSHOT_PATH,'./data/yakima-2026-11-09.json');
  assert.deepEqual(validateEvidence(evidence),{valid:true,problems:[]});
  assert.equal(evidence.presentation,'ARCHIVED_EVIDENCE_PREVIEW');
  assert.equal(evidence.human_publication_approved,false);
  assert.equal(evidence.forecast_authorized,false);
  assert.equal(evidence.payment_verified,false);
  assert.equal(evidence.customer_delivery_verified,false);
  assert.equal(evidence.nrcs.basins.length,3);
  assert.ok(evidence.nrcs.basins.every(r=>r.warning_flag));
  assert.equal(evidence.nrcs.basins[0].index_percent,11);
  assert.equal(evidence.nrcs.basins[1].index_percent,109);
  assert.equal(evidence.nrcs.basins[2].index_percent,130);
  assert.equal(evidence.snow.stations.length,6);
  assert.equal(evidence.rivers.sites.length,3);
  assert.equal(evidence.reservoirs.sites.length,5);
  assert.equal(evidence.reservoirs.timezone_reconciled,false);
  assert.equal(evidence.reservoirs.official_system_total,false);
  assert.equal(evidence.reservoirs.percent_capacity,null);
  const sum=evidence.reservoirs.sites.reduce((a,r)=>a+r.storage_af,0);
  assert.ok(Math.abs(sum-evidence.reservoirs.derived_provisional_sum_af)<.005);
});

test('numeric and authority tampering are rejected before any browser display',()=>{
  const cases=[
    (x)=>{x.schema='fake';},
    (x)=>{x.human_publication_approved=true;},
    (x)=>{x.forecast_authorized=true;},
    (x)=>{x.payment_verified=true;},
    (x)=>{x.nrcs.basins[0].warning_flag='no';},
    (x)=>{x.nrcs.source_url='https://evil.example/report';},
    (x)=>{x.source_run_url='javascript:alert(1)';},
    (x)=>{x.snow.stations[0].ratio_percent=500;},
    (x)=>{x.snow.stations[0].source_url='https://wcc.sc.egov.usda.gov.evil.example/report';},
    (x)=>{x.reservoirs.sites[0].time_zone='UTC';},
    (x)=>{x.reservoirs.derived_provisional_sum_af+=1;},
    (x)=>{x.reservoirs.percent_capacity=30;},
    (x)=>{x.rivers.sites=[];},
    (x)=>{x.evidence_sha256.usbr_reservoir='short';}
  ];
  for(const tamper of cases){
    const item=copy(evidence);tamper(item);
    const result=validateEvidence(item);
    assert.equal(result.valid,false,'tamper unexpectedly accepted: '+tamper.toString());
    assert.ok(result.problems.length);
  }
});

test('official source URL allowlist blocks scripts, redirects, credentials and host confusion',()=>{
  assert.equal(isOfficialSource('https://wcc.sc.egov.usda.gov/reports/UpdateReport.html'),true);
  assert.equal(isOfficialSource('https://data.usbr.gov/catalog/8304/item/131246'),true);
  assert.equal(isOfficialSource('https://api.waterdata.usgs.gov/'),true);
  assert.equal(isOfficialSource('javascript:alert(1)'),false);
  assert.equal(isOfficialSource('http://wcc.sc.egov.usda.gov/'),false);
  assert.equal(isOfficialSource('https://wcc.sc.egov.usda.gov.evil.com/'),false);
  assert.equal(isOfficialSource('https://alice:pw@data.usbr.gov/'),false);
  assert.equal(isOfficialSource('https://example.org/'),false);
});

test('freshness, calendar days, and communication floor labels do not fabricate live trends',()=>{
  assert.equal(sourceAgeLabel('2026-11-10T02:00:00.000Z',new Date('2026-11-10T04:00:00.000Z')),'Archived 2 hours ago');
  assert.equal(sourceAgeLabel('2026-11-10T02:00:00.000Z',new Date('2026-11-13T02:00:00.000Z')),'Archived 3 days ago');
  assert.equal(shortDate('2026-11-08'),'Nov 8, 2026');
  assert.equal(formatNumber(147099.23,2),'147,099.23');
  assert.match(ratioLabel(evidence.snow.stations.find(x=>x.id==='642:WA:SNTL')),/181.2% of station median/);
  assert.match(ratioLabel(evidence.snow.stations.find(x=>x.id==='375:WA:SNTL')),/Withheld/);
});

test('mobile public preview has source provenance and request handoff, not PDF, checkout or forecast claims',()=>{
  for(const id of ['load-error','dashboard','basin-cards','snow-list','river-list','reservoir-list',
      'source-ledger','limitations-list','source-age','reservoir-total']){
    assert.ok(page.includes('id="'+id+'"'),'missing '+id);
  }
  assert.match(page,/name="viewport"/);
  assert.match(page,/noindex,nofollow/);
  assert.match(page,/Archived evidence preview/);
  assert.match(page,/not a live water forecast/i);
  assert.match(page,/href="\.\.\/research\/#start"/);
  assert.match(page,/Download snapshot JSON/);
  assert.match(page,/@media\(max-width:680px\)/);
  assert.doesNotMatch(page,/stripe\.com|buy\.stripe|guaranteed|real-time monitoring/i);
  assert.match(app,/validateEvidence\(source\)/);
  assert.match(app,/sourceAgeLabel/);
  assert.match(app,/textContent/);
  assert.match(app,/section\.hidden=true/);
  assert.doesNotMatch(app,/\.innerHTML\s*=/);
  assert.doesNotMatch(app,/localStorage|sessionStorage|navigator\.geolocation|fetch\(.+?https?:/);
});
