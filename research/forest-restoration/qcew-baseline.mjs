// FOREST-001: annual QCEW county baseline from locally retrieved official area CSV.
// Read only; no network or publishing. Use official area-slice or annual area file.
// https://www.bls.gov/cew/additional-resources/open-data/csv-data-slices.htm
// https://www.bls.gov/cew/classifications/aggregation/agg-level-titles.htm
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
function parse(text){
  text=text.replace(/^\uFEFF/,'');
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  const push=()=>{row.push(cell);cell='';closed=false};
  const end=()=>{push();if(row.length!==1||row[0]!=='')rows.push(row);row=[]};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;continue}
    if(c===','){push();continue}
    if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;end();continue}
    if(closed)throw Error('invalid_csv_quote');
    if(c==='"'){if(cell!=='')throw Error('invalid_csv_quote');quoted=true;continue}
    cell+=c;
  }
  if(quoted)throw Error('unterminated_csv_quote');
  if(row.length||cell!==''||closed)end();
  return rows;
}
function baseline(csv,area,year){
  if(!/^\d{5}$/.test(area)||!Number.isInteger(year)||year<2017||year>2026)throw Error('invalid_scope');
  const groups={'113':'75','115310':'78','321':'75','322':'75'};
  const measures=['annual_avg_estabs','annual_avg_emplvl','total_annual_wages'];
  const fields=['area_fips','own_code','industry_code','agglvl_code','size_code','year','qtr','disclosure_code',...measures];
  const [header,...rows]=parse(csv);
  if(!header||new Set(header).size!==header.length||!fields.every(k=>header.includes(k))||!rows.length)throw Error('invalid_header_or_empty_source');
  const hits=new Map();let scopeRows=0;
  for(const row of rows){
    if(row.length!==header.length)throw Error('malformed_row');
    const r=Object.fromEntries(header.map((k,i)=>[k,row[i].trim()]));
    if(r.area_fips!==area||r.year!==String(year)||r.qtr!=='A')throw Error('mixed_or_wrong_scope');
    scopeRows++;
    if(r.own_code!=='5'||!['','0'].includes(r.size_code)||!Object.hasOwn(groups,r.industry_code))continue;
    if(r.agglvl_code!==groups[r.industry_code])throw Error('aggregation_mismatch');
    if(hits.has(r.industry_code))throw Error('duplicate_industry');
    if(!['','N'].includes(r.disclosure_code))throw Error('unknown_disclosure_code');
    const item={industry:r.industry_code,state:r.disclosure_code==='N'?'SUPPRESSED':'REPORTED'};
    for(const k of measures){
      const raw=r[k];const n=Number(raw);
      if(item.state==='SUPPRESSED'||raw===''){item[k]=null;continue}
      if(!/^\d+$/.test(raw)||!Number.isSafeInteger(n)||n<0)throw Error('invalid_'+k);
      item[k]=n;
    }
    hits.set(r.industry_code,item);
  }
  const industries=Object.keys(groups).map(industry=>hits.get(industry)||{industry,state:'NOT_FOUND',...Object.fromEntries(measures.map(k=>[k,null]))});
  const total={};
  for(const k of measures){
    const values=industries.map(r=>r[k]), known=values.filter(v=>v!==null), sum=known.reduce((a,b)=>a+b,0);
    if(!Number.isSafeInteger(sum))throw Error('sum_overflow');
    total[k]={known_subtotal:known.length?sum:null,complete_total:known.length===industries.length?sum:null,missing_industries:industries.filter(r=>r[k]===null).map(r=>r.industry)};
  }
  return {schema:'evercraft.forest-001.qcew-baseline.v1',area_fips:area,year,ownership:'private',scope_rows:scopeRows,industries,total,incremental_jobs:null,limitations:'Covered payroll jobs, not unique workers; excludes government and uncovered self-employment. Selected industries include activity unrelated to restoration.'};
}
function test(){
  const h='area_fips,own_code,industry_code,agglvl_code,size_code,year,qtr,disclosure_code,annual_avg_estabs,annual_avg_emplvl,total_annual_wages';
  const a='53077,5,113,75,0,2025,A,,2,10,500000';
  const b='53077,5,115310,78,0,2025,A,N,0,0,0';
  const c='53077,5,321,75,0,2025,A,,1,20,1000000';
  const d='53077,5,322,75,0,2025,A,,1,0,0';
  const run=(...r)=>baseline([h,...r].join('\r\n'),'53077',2025);
  let pass=0;const ok=v=>{if(!v)throw Error('assertion_failed');pass++};
  const p=run(a,b,c,d);
  ok(p.total.annual_avg_emplvl.known_subtotal===30);
  ok(p.total.annual_avg_emplvl.complete_total===null);
  ok(p.industries.find(r=>r.industry==='115310').annual_avg_emplvl===null);
  ok(p.industries.find(r=>r.industry==='322').annual_avg_emplvl===0);
  ok(run(a,c,d).industries.find(r=>r.industry==='115310').state==='NOT_FOUND');
  ok(run(a,b.replace(',N,0,0,0',',,1,5,100'),c,d).total.annual_avg_emplvl.complete_total===35);
  ok(run(a,b,c,d,a.replace(',5,113,',',1,113,')).total.annual_avg_emplvl.known_subtotal===30);
  ok(parse('a,b\r\n"x,y","z""z"')[1][1]==='z"z');
  for(const args of [[a,a],[a.replace('53077','53037')],[a.replace(',75,',',74,')],[a.replace(',10,',',-10,')],[a+',extra'],[a.replace(',2025,',',2024,')]]){let fail=false;try{run(...args)}catch{fail=true}ok(fail)}
  return {state:'PASS',assertions:pass,scope:'synthetic CSV fixtures'};
}
try{
  const [mode,area,year,file]=process.argv.slice(2);
  if(mode==='--self-test')console.log(JSON.stringify(test()));
  else if(mode==='--file'&&file){
    if(statSync(file).size>32*1024*1024)throw Error('file_limit');
    const data=readFileSync(file);
    if(data.length>32*1024*1024)throw Error('file_limit');
    const result=baseline(new TextDecoder('utf-8',{fatal:true}).decode(data),area,Number(year));
    console.log(JSON.stringify({source_file_sha256:createHash('sha256').update(data).digest('hex'),source_identity:'operator_supplied_official_csv_not_independently_verified',result},null,2));
  }else throw Error('usage: --self-test OR --file FIPS YEAR PATH');
}catch(e){console.error(JSON.stringify({state:'HOLD',reason:e.message}));process.exitCode=1;}
