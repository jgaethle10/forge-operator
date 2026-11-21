// Evercraft Earth / explicit CSV -> GeoJSON evidence normalization.
// Usage: node systemia/evercraft-earth/normalize-csv.mjs input.csv mapping.json output.geojson
// Safe by default: all rows must pass. No source/geolocation inference, ND=0 coercion, or unit conversion.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function parseCsv(text){
 text=text.replace(/^\uFEFF/,'');
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){
   if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}
   else if(ch==='"'){quoted=false;closed=true;}
   else cell+=ch;
  }else if(ch==='"'&&!cell&&!closed){quoted=true;}
  else if(ch===','){row.push(cell);cell='';closed=false;}
  else if(ch==='\r'||ch==='\n'){
   if(ch==='\r'&&text[i+1]==='\n')i++;
   row.push(cell);if(row.some(x=>x!==''))rows.push(row);
   row=[];cell='';closed=false;
  }else if(ch==='"'&&closed){throw Error('Unexpected quote after quoted cell');}
  else{if(closed&&ch!==' '&&ch!=='\t')throw Error('Unexpected text after closing quote');cell+=ch;}
 }
 if(quoted)throw Error('Unclosed CSV quote');
 row.push(cell);if(row.some(x=>x!==''))rows.push(row);
 return rows;
}
const number=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
function numeric(value,field){
 const s=String(value??'').trim();
 if(!number.test(s))throw Error(field+' is not an explicit numeric measurement');
 const n=Number(s);if(!Number.isFinite(n))throw Error(field+' is non-finite');
 return n;
}
function date(s){
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('observed_at must be YYYY-MM-DD');
 const d=new Date(s+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw Error('invalid calendar date');
 return s;
}
function https(url){
 try{const u=new URL(url);if(u.protocol!=='https:')throw Error();return u.href;}
 catch(_){throw Error('source_url must be an HTTPS evidence link');}
}
function text(value,key){if(typeof value!=='string'||!value.trim())throw Error(key+' missing');return value.trim();}
export function normalizeCsv(csv,mapping,sha){
 if(!mapping||!mapping.columns||typeof mapping.columns!=='object')throw Error('Mapping must specify columns by exact source headers');
 const source=parseCsv(csv);if(source.length<2)throw Error('CSV has no data rows');
 const headers=source[0];if(new Set(headers).size!==headers.length)throw Error('Duplicate CSV column headers');
 const c=mapping.columns,f=mapping.fixed||{},issues=[],features=[],seen=new Set();
 const needed=['site_id','name','observed_at','latitude','longitude','value'];
 for(const key of needed)if(typeof c[key]!=='string'||!headers.includes(c[key]))throw Error('Missing mapping for '+key);
 for(const key of ['topic','metric','unit','source_name','source_url']){
  if(!f[key]&&(!c[key]||!headers.includes(c[key])))throw Error('Must map or fix '+key);
 }
 if(c.qualifier&&(!headers.includes(c.qualifier)||!Array.isArray(mapping.allowed_qualifiers)))throw Error('Qualifiers need exact source column and explicit allowed_qualifiers');
 const idx=Object.fromEntries(headers.map((h,i)=>[h,i]));
 for(let i=1;i<source.length;i++){
  const cells=source[i];
  try{
   if(cells.length!==headers.length)throw Error('wrong number of columns');
   const get=k=>f[k]!==undefined?f[k]:c[k]?cells[idx[c[k]]]:undefined;
   const site_id=text(get('site_id'),'site_id');
   const topic=text(get('topic'),'topic');
   if(!['pfas','fire','land','infrastructure'].includes(topic))throw Error('unknown topic');
   const metric=text(get('metric'),'metric'),unit=text(get('unit'),'unit');
   const observed_at=date(get('observed_at'));
   if(c.qualifier){
    const qualifier=String(cells[idx[c.qualifier]]).trim();
    if(!mapping.allowed_qualifiers.includes(qualifier))throw Error('unapproved result qualifier '+JSON.stringify(qualifier));
   }
   const key=[site_id,topic,metric,unit,observed_at].join('\u001f');
   if(seen.has(key))throw Error('duplicate site/topic/metric/unit/date; requires human reconciliation');
   seen.add(key);
   const lat=numeric(get('latitude'),'latitude'),lon=numeric(get('longitude'),'longitude');
   if(Math.abs(lat)>90||Math.abs(lon)>180)throw Error('coordinates outside WGS84 range');
   features.push({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{
    site_id,name:text(get('name'),'name'),topic,metric,value:numeric(get('value'),'value'),unit,observed_at,
    source_name:text(get('source_name'),'source_name'),source_url:https(get('source_url')),
    provenance:{csv_row:i+1,source_sha256:sha,normalizer:'evercraft.earth.csv-normalizer.v1'}
   }});
  }catch(e){issues.push({csv_row:i+1,error:e.message});}
 }
 if(issues.length){const error=Error('Normalization blocked: '+issues.length+' row(s) invalid. No output written.');error.issues=issues.slice(0,20);throw error;}
 return {type:'FeatureCollection',metadata:{schema:'evercraft.earth.source-linked-observations.v1',source_sha256:sha,normalizer:'evercraft.earth.csv-normalizer.v1',rows:features.length,independently_verified:false},features};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [input,config,output]=process.argv.slice(2);
 if(!input||!config||!output){console.error('Usage: node normalize-csv.mjs input.csv mapping.json output.geojson');process.exitCode=2;}
 else{
  try{
   const csv=await readFile(input,'utf8'),mapping=JSON.parse(await readFile(config,'utf8'));
   const result=normalizeCsv(csv,mapping,createHash('sha256').update(csv).digest('hex'));
   await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
   console.log('Created '+result.features.length+' source-linked observations. NOT independently verified.');
  }catch(e){console.error(e.message);if(e.issues)console.error(JSON.stringify(e.issues,null,2));process.exitCode=1;}
 }
}
