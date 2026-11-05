import test from 'node:test';
import { formatWatershedReviewBrief } from '../systemia/research-service/watershed-review-brief.mjs';
import {compileWatershedSnapshot} from '../systemia/research-service/watershed-intelligence.mjs';
import assert from 'node:assert/strict';
import { readFileSync as readFileSyncLocal } from 'node:fs';
import {
  NRCS_WA_BASIN_REPORT_URL, parseNrcsWashingtonBasinReport, fetchNrcsWashingtonBasinReport
} from '../systemia/research-service/nrcs-basin-report.mjs';

const date='Wednesday, November 04, 2026';
function fixture({
  label=date,upper='136*',naches='214*',lower='217*',
  duplicate=false,disclaimer=true,addScript=false
}={}){
  const table=(name,val)=>'<tr><th colspan="8">'+name+'</th></tr>'+
    '<tr><td>Test site</td><td>4000</td><td>1.2</td></tr>'+
    '<tr><td>Basin Index (%)</td><td>'+val+'</td></tr>';
  return [
    '<!DOCTYPE html><html><head><title>NRCS</title></head><body>',
    addScript?'<script>const fake="LOWER YAKIMA Basin Index (%) 999";</script>':'',
    '<h1>Washington SNOTEL Snowpack Update Report</h1>',
    disclaimer?'<p>Provisional data, subject to revision</p>':'',
    '<p>Data based on the first reading of the day (typically 00:00) for '+label+'</p>',
    '<table>',table('UPPER YAKIMA',upper),table('NACHES',naches),
    table('LOWER YAKIMA',lower),duplicate?table('LOWER YAKIMA','600*'):'',
    '<tr><th>KLICKITAT</th></tr><tr><td>Basin Index (%)</td><td>250*</td></tr>',
    '</table><footer>* Analysis may not provide a valid measure of conditions.</footer>',
    '</body></html>'
  ].join('\n');
}
const options={asOf:'2026-11-04T22:30:00Z'};
test('official NRCS basin reader preserves authoritative indices and critical warning stars',()=>{
  const result=parseNrcsWashingtonBasinReport(fixture({addScript:true}),options);
  assert.equal(result.schema,'evercraft.research.nrcs-basin-index.v1');
  assert.equal(result.observed_date,'2026-11-04');
  assert.deepEqual(result.basins.map(b=>b.value_percent),[136,214,217]);
  assert.deepEqual(result.basins.map(b=>b.warning_flag),[true,true,true]);
  assert.equal(result.all_basins_warned,true);
  assert.ok(result.basins.every(b=>b.condition==='potentially_unrepresentative'));
  assert.equal(result.reference_period,'1991-2020');
  assert.equal(result.seasonal_outlook_verified,false);
  assert.equal(result.publication_authorized,false);
  assert.equal(result.not_an_independent_recalculation,true);
  assert.ok(result.method.includes('sum(valid station current SWE)'));
});
test('unflagged source indices are provisional, not authorized seasonal claims',()=>{
  const result=parseNrcsWashingtonBasinReport(fixture({upper:'93',naches:'108',lower:'102'}),options);
  assert.deepEqual(result.basins.map(b=>b.warning_flag),[false,false,false]);
  assert.equal(result.all_basins_warned,false);
  assert.equal(result.basins[0].condition,'provisional');
  assert.equal(result.publication_authorized,false);
});
test('stale, future, duplicated, invalid or non-authoritative documents fail closed',()=>{
  assert.throws(()=>parseNrcsWashingtonBasinReport(fixture({label:'Monday, October 26, 2026'}),options),/stale/);
  assert.throws(()=>parseNrcsWashingtonBasinReport(fixture({label:'Monday, November 16, 2026'}),options),/future/);
  assert.throws(()=>parseNrcsWashingtonBasinReport(fixture({duplicate:true}),options),/duplicated/);
  assert.throws(()=>parseNrcsWashingtonBasinReport(fixture({disclaimer:false}),options),/identity/);
  assert.throws(()=>parseNrcsWashingtonBasinReport(fixture({naches:'N/A'}),options),/unreadable/);
  assert.throws(()=>parseNrcsWashingtonBasinReport(fixture({upper:'99999*'}),options),/outside review/);
  assert.throws(()=>parseNrcsWashingtonBasinReport('<html><body>wrong</body></html>',options),/out of bounds|identity/);
});
test('official host-only read and HTTP errors',async()=>{
  let requested;
  const result=await fetchNrcsWashingtonBasinReport({
    asOf:options.asOf,
    fetchImpl:async(url,opts)=>{
      requested={url:new URL(url),opts};
      return {ok:true,status:200,url:'https://wcc.sc.egov.usda.gov/reports/UpdateReport.html;jsessionid=abc',
        text:async()=>fixture()};
    }
  });
  assert.equal(result.basins.length,3);
  assert.equal(requested.url.hostname,'wcc.sc.egov.usda.gov');
  assert.ok(requested.opts.headers.Accept.includes('text/html'));
  assert.equal(NRCS_WA_BASIN_REPORT_URL,requested.url.toString());
  await assert.rejects(fetchNrcsWashingtonBasinReport({
    asOf:options.asOf, fetchImpl:async()=>({ok:false,status:503})
  }),/503/);
  await assert.rejects(fetchNrcsWashingtonBasinReport({
    asOf:options.asOf,fetchImpl:async()=>({ok:true,url:'https://other.example/reports/UpdateReport.html',text:async()=>fixture()})
  }),/outside its official host/);
});

test('review draft quotes NRCS source, warning stars and never promotes basin indices to seasonal forecasts',()=>{
  const {readFileSync}=requireDummy();
  const profile=JSON.parse(readFileSync(new URL('../systemia/research-service/watershed-yakima-profile.json',import.meta.url),'utf8'));
  const snap=compileWatershedSnapshot({asOf:'2026-11-04T22:30:00Z'});
  const source=parseNrcsWashingtonBasinReport(fixture(),options);
  const report=formatWatershedReviewBrief(snap,profile,null,null,null,null,null,source,'a'.repeat(64));
  assert.ok(report.includes('Official NRCS Yakima basin indices'));
  assert.ok(report.includes('136%*'));
  assert.ok(report.includes('214%*'));
  assert.ok(report.includes('217%*'));
  assert.ok(report.includes('NRCS itself cautions') || report.includes('Analysis may not provide a valid measure'));
  assert.ok(report.includes('not a combined Yakima Basin percentage') || report.includes('combined Yakima Basin percentage'));
  assert.ok(report.includes('publication_authorized=false'));
  assert.throws(()=>formatWatershedReviewBrief(snap,profile,null,null,null,null,null,{
    ...source,all_basins_warned:false
  }),/inconsistent/);
  assert.throws(()=>formatWatershedReviewBrief(snap,profile,null,null,null,null,null,{
    ...source,source_url:'https://example.com'
  }),/invalid official/);
  const future=compileWatershedSnapshot({asOf:'2026-11-14T10:00:00Z'});
  assert.throws(()=>formatWatershedReviewBrief(future,profile,null,null,null,null,null,source),/not comparable/);
});
function requireDummy(){return {readFileSync:readFileSyncLocal};}
