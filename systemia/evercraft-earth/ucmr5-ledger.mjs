// Evercraft Earth / EPA UCMR 5 evidence-ledger import
// Source: EPA UCMR 5 official tab-separated occurrence files (not pre-geocoded).
// Usage: node systemia/evercraft-earth/ucmr5-ledger.mjs source.txt output.json --state WA --analytes PFOA,PFOS --name YAKIMA
// No synthetic coordinates. No conversion of non-detects to zero. Does not calculate compliance.
import {createReadStream} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SOURCE_URL='https://www.epa.gov/dwucmr/occurrence-data-unregulated-contaminant-monitoring-rule';
export const FIELDS=[
 'PWSID','PWSName','FacilityID','SamplePointID','SamplePointType',
 'CollectionDate','SampleID','Contaminant','MRL','Units','MethodID',
 'AnalyticalResultsSign','AnalyticalResultValue','State'
];
const numericPattern=/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
function positiveNumber(raw,label){
 const v=String(raw??'').trim();
 if(!numericPattern.test(v)||!Number.isFinite(Number(v))||Number(v)<=0)throw Error(label+' must be a positive numeric value');
 return Number(v);
}
function epaDate(raw){
 const found=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(raw??'').trim());
 if(!found)throw Error('Invalid EPA CollectionDate (expected M/D/YYYY)');
 const [,month,day,year]=found;
 const d=new Date(Date.UTC(+year,+month-1,+day));
 if(d.getUTCFullYear()!==+year||d.getUTCMonth()!==+month-1||d.getUTCDate()!==+day)throw Error('Invalid calendar date');
 return d.toISOString().slice(0,10);
}
function required(v,name){
 const x=String(v??'').trim();if(!x)throw Error('Missing '+name);return x;
}
export function rowToRecord(row,line){
 for(const col of FIELDS)if(!(col in row))throw Error('Missing required header '+col);
 const sign=required(row.AnalyticalResultsSign,'AnalyticalResultsSign');
 if(!['=','<'].includes(sign))throw Error('Unknown AnalyticalResultsSign '+JSON.stringify(sign));
 const mrl=positiveNumber(row.MRL,'MRL');
 const raw=String(row.AnalyticalResultValue??'').trim();
 let value=null;
 if(sign==='='){
  value=positiveNumber(raw,'AnalyticalResultValue');
  if(value<mrl-1e-12)throw Error('Quantified result below listed MRL: needs review');
 }else if(raw!=='')throw Error('Below-MRL row contains numeric result: needs review');
 const unit=required(row.Units,'Units');
 const ids=['PWSID','FacilityID','SamplePointID','SampleID'].map(k=>required(row[k],k));
 const name=required(row.PWSName,'PWSName'),analyte=required(row.Contaminant,'Contaminant');
 const date=epaDate(row.CollectionDate);
 if(row.SamplePointType!=='EP')throw Error('Unexpected sample point type: '+row.SamplePointType);
 return {
  id:[...ids,analyte,date,line].join('|'),
  pws_id:ids[0],pws_name:name,facility_id:ids[1],sample_point_id:ids[2],sample_id:ids[3],
  sample_point_type:'EP',sample_location:'entry_point_to_distribution',
  contaminant:analyte,observed_at:date,
  result_status:sign==='='?'quantified':'below_reporting_limit',
  value,reporting_limit:mrl,unit,method_id:required(row.MethodID,'MethodID'),
  state:required(row.State,'State'),source_row:line,
  latitude:null,longitude:null,geolocation_status:'not_geocoded'
 };
}
export function makeLedger(records,meta){
 const quantified=records.filter(r=>r.result_status==='quantified').length;
 return {
  schema:'evercraft.earth.ucmr5-evidence-ledger.v1',
  created_at:new Date().toISOString(),
  source:{publisher:'US Environmental Protection Agency',name:'UCMR 5 occurrence data',url:SOURCE_URL,
   original_file_sha256:meta.sha256,source_file:meta.file_name,original_records_inspected:meta.inspected},
  scope:{state:meta.state,analytes:meta.analytes,name_contains:meta.name||null,
   selection_note:'PWSName text matching is not county, address, ZIP or service-area geolocation.'},
  limitations:[
   'All records are water-system entry-point measurements, not household tap readings.',
   'No sample-point coordinates are present in this ledger. Do not draw map points without independently sourced precise locations.',
   'Below-reporting-limit is not zero, and the reporting limit is not a health threshold.',
   'Selected rows are not a complete enumeration of systems unless source file and all filters establish that coverage.',
   'No independent validation of EPA reporting, compliance determinations, or public-health risk is performed.'
  ],
  counts:{matched:records.length,quantified,below_reporting_limit:records.length-quantified,without_coordinates:records.length},
  records
 };
}
export async function importUcmrTsv(input,{state='WA',analytes=['PFOA','PFOS'],name='',maxRecords=200000}={}){
 const stream=createReadStream(input);
 const sha=createHash('sha256');
 stream.on('data',chunk=>sha.update(chunk));
 const rl=createInterface({input:stream,crlfDelay:Infinity});
 let columns=null,seen=0,line=0;
 const results=[];
 const selected=new Set(analytes.map(x=>x.trim().toUpperCase()));
 const filterState=String(state).trim().toUpperCase(),filterName=String(name).trim().toUpperCase();
 try{
  for await(const raw of rl){
   line++;
   if(!raw.trim())continue;
   const cells=raw.replace(/\r$/,'').split('\t');
   if(!columns){
    columns=cells;
    if(new Set(columns).size!==columns.length)throw Error('Duplicate EPA TSV headers');
    for(const col of FIELDS)if(!columns.includes(col))throw Error('EPA source missing column '+col);
    continue;
   }
   seen++;
   if(cells.length!==columns.length)throw Error('Row '+line+' does not match EPA TSV header count');
   const row=Object.fromEntries(columns.map((c,i)=>[c,cells[i]]));
   if(filterState&&String(row.State).toUpperCase()!==filterState)continue;
   if(filterName&&!String(row.PWSName).toUpperCase().includes(filterName))continue;
   if(selected.size&&!selected.has(String(row.Contaminant).toUpperCase()))continue;
   try{results.push(rowToRecord(row,line));}
   catch(e){throw Error('Row '+line+': '+e.message);}
   if(results.length>maxRecords)throw Error('Matched records exceed --maxRecords safety limit');
  }
 }finally{rl.close();}
 if(!columns)throw Error('Empty EPA source file');
 if(!results.length)throw Error('No matching records. No output was written; check source coverage and filters.');
 return makeLedger(results,{sha256:sha.digest('hex'),file_name:input.split(/[\\/]/).at(-1),inspected:seen,state:filterState||'ALL',analytes:[...selected],name:filterName});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [input,output,...options]=process.argv.slice(2);
 if(!input||!output){console.error('Usage: node ucmr5-ledger.mjs source.txt output.json --state WA --analytes PFOA,PFOS --name YAKIMA');process.exitCode=2;}
 else{
  try{
   const flags={};for(let i=0;i<options.length;i+=2){
    if(!['--state','--analytes','--name'].includes(options[i])||!options[i+1])throw Error('Unknown or incomplete option '+options[i]);
    flags[options[i].slice(2)]=options[i+1];
   }
   const ledger=await importUcmrTsv(input,{state:flags.state??'WA',
    analytes:flags.analytes?flags.analytes.split(','):['PFOA','PFOS'],name:flags.name??''});
   await writeFile(output,JSON.stringify(ledger,null,2)+'\n',{flag:'wx'});
   console.log('Wrote '+ledger.counts.matched+' EPA rows. '+ledger.counts.quantified+' quantified, '+ledger.counts.below_reporting_limit+' below reporting limit.');
   console.log('No coordinates were added. Source subset not independently verified.');
  }catch(e){console.error(e.message);process.exitCode=1;}
 }
}
