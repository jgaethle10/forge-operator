import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,normalizeCsv} from './normalize-csv.mjs';

const columns={site_id:'Site ID',name:'Site',observed_at:'Date',latitude:'Lat',longitude:'Lon',value:'Value'};
const mapping={columns,fixed:{topic:'pfas',metric:'PFOS',unit:'ng/L',source_name:'Illustrative test publisher',source_url:'https://example.org/test-record'}};
const header='Site ID,Site,Date,Lat,Lon,Value';
const good=[header,'S001,"Station, One",2023-01-01,46.6,-120.5,12','S001,"Station, One",2025-01-01,46.6,-120.5,8'].join('\r\n');
const go=(csv,config=mapping)=>normalizeCsv(csv,config,'0'.repeat(64));

test('CSV parser handles BOM, quoted comma and multiline cells',()=>{
 const rows=parseCsv('\uFEFFid,label\r\n1,"hello, world"\r\n2,"two\nlines"');
 assert.deepEqual(rows,[['id','label'],['1','hello, world'],['2','two\nlines']]);
});
test('normalized measurements are numeric, dated, located and provenance-linked',()=>{
 const result=go(good);
 assert.equal(result.features.length,2);
 assert.equal(result.features[1].properties.value,8);
 assert.deepEqual(result.features[0].geometry.coordinates,[-120.5,46.6]);
 assert.equal(result.features[0].properties.provenance.csv_row,2);
 assert.equal(result.metadata.independently_verified,false);
});
test('does not coerce non-detect or blank measurement to zero',()=>{
 for(const raw of ['ND','', '<4','not detected']){
  assert.throws(()=>go(header+'\nS001,Station,2025-01-01,46.6,-120.5,'+raw),/Normalization blocked/);
 }
});
test('does not silently merge two measurements at same site/date',()=>{
 assert.throws(()=>go([header,'S001,Station,2025-01-01,46.6,-120.5,8','S001,Station,2025-01-01,46.6,-120.5,10'].join('\n')),/Normalization blocked/);
});
test('rejects invalid dates, missing coordinates and non-HTTPS evidence',()=>{
 assert.throws(()=>go(header+'\nS001,Station,2025-02-30,46.6,-120.5,8'),/Normalization blocked/);
 assert.throws(()=>go(header+'\nS001,Station,2025-01-01,,-120.5,8'),/Normalization blocked/);
 assert.throws(()=>go(good,{...mapping,fixed:{...mapping.fixed,source_url:'http://example.org'}}),/Normalization blocked/);
});
test('qualifier codes must have explicit allowlist and reject censored results',()=>{
 const csv=header+',Qualifier\nS001,Station,2025-01-01,46.6,-120.5,4,ND';
 assert.throws(()=>go(csv,{...mapping,columns:{...columns,qualifier:'Qualifier'}}),/Qualifiers need/);
 assert.throws(()=>go(csv,{...mapping,columns:{...columns,qualifier:'Qualifier'},allowed_qualifiers:['']}),/Normalization blocked/);
});
