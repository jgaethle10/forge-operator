import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {rowToRecord,importUcmrTsv,makeLedger,FIELDS} from './ucmr5-ledger.mjs';

function row(overrides={}){
 return {PWSID:'WA1234567',PWSName:'YAKIMA TEST SYSTEM',FacilityID:'FAC001',SamplePointID:'EP001',
  SamplePointType:'EP',CollectionDate:'10/9/2025',SampleID:'S001',Contaminant:'PFOS',MRL:'0.004',
  Units:'µg/L',MethodID:'EPA 533',AnalyticalResultsSign:'=',AnalyticalResultValue:'0.010',State:'WA',...overrides};
}
test('quantified EPA readings retain exact unit, date, method, source row and no invented coordinates',()=>{
 const x=rowToRecord(row(),2);
 assert.equal(x.result_status,'quantified');assert.equal(x.value,0.01);
 assert.equal(x.observed_at,'2025-10-09');assert.equal(x.unit,'µg/L');
 assert.equal(x.source_row,2);assert.equal(x.latitude,null);assert.equal(x.longitude,null);
 assert.equal(x.sample_location,'entry_point_to_distribution');
});
test('EPA below-reporting-limit result remains censored instead of becoming zero',()=>{
 const x=rowToRecord(row({AnalyticalResultsSign:'<',AnalyticalResultValue:''}),3);
 assert.equal(x.result_status,'below_reporting_limit');assert.equal(x.value,null);
 assert.equal(x.reporting_limit,0.004);
});
test('rejects malformed, contradictory and unexpected EPA results',()=>{
 const cases=[
  {AnalyticalResultsSign:'?',AnalyticalResultValue:'0.01'},
  {AnalyticalResultsSign:'<',AnalyticalResultValue:'0.002'},
  {AnalyticalResultsSign:'=',AnalyticalResultValue:''},
  {AnalyticalResultsSign:'=',AnalyticalResultValue:'0.001'},
  {SamplePointType:'RW'},
  {CollectionDate:'2/30/2025'},
  {Units:''},
  {SamplePointID:''}
 ];
 for(const r of cases)assert.throws(()=>rowToRecord(row(r),2),undefined,JSON.stringify(r));
});
test('tab-delimited EPA source filters by state and name without guessing county or coordinates',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'evercraft-ucmr5-'));
 try{
  const path=join(dir,'ucmr5.txt');
  const values=[row(),row({PWSID:'WA2222222',PWSName:'SEATTLE TEST',SampleID:'S002'}),
    row({AnalyticalResultsSign:'<',AnalyticalResultValue:'',SampleID:'S003'})];
  await writeFile(path,[FIELDS.join('\t'),...values.map(v=>FIELDS.map(k=>v[k]).join('\t'))].join('\n'),'utf8');
  const ledger=await importUcmrTsv(path,{state:'WA',name:'YAKIMA',analytes:['PFOS']});
  assert.equal(ledger.counts.matched,2);
  assert.equal(ledger.counts.quantified,1);
  assert.equal(ledger.counts.below_reporting_limit,1);
  assert.equal(ledger.counts.without_coordinates,2);
  assert.equal(ledger.source.original_records_inspected,3);
  assert.match(ledger.source.original_file_sha256,/^[a-f0-9]{64}$/);
  assert.equal(ledger.scope.name_contains,'YAKIMA');
  assert.match(ledger.scope.selection_note,/not county/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('an empty subset cannot be mistaken for zero detections',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'evercraft-empty-'));
 try{
  const path=join(dir,'ucmr5.txt');
  await writeFile(path,[FIELDS.join('\t'),FIELDS.map(k=>row()[k]).join('\t')].join('\n'));
  await assert.rejects(importUcmrTsv(path,{state:'CA'}),/No matching records/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('ledger preserves true quantified and non-detect counts',()=>{
 const a=rowToRecord(row(),2);
 const b=rowToRecord(row({AnalyticalResultsSign:'<',AnalyticalResultValue:'',SampleID:'S002'}),3);
 const l=makeLedger([a,b],{sha256:'a'.repeat(64),file_name:'subset.txt',inspected:2,state:'WA',analytes:['PFOS'],name:'YAKIMA'});
 assert.equal(l.counts.quantified,1);assert.equal(l.counts.below_reporting_limit,1);
 assert.equal(l.records[1].value,null);
 assert.ok(l.limitations.some(x=>x.includes('not zero')));
});
