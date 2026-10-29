// Work Saban narrow browser-only reporting. No Node dependencies or external requests.
// Exact integer-cents accounting only. This is not multi-agent execution or accounting advice.
export const MAX_CSV_BYTES=256*1024;
export const MAX_CSV_ROWS=2000;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const REVENUE=/^-?\d{1,9}(?:\.\d{1,2})?$/;
const byteLength=value=>new TextEncoder().encode(value).length;

function csvRecords(text){
  if(typeof text!=='string')throw new Error('Choose a CSV file.');
  if(byteLength(text)>MAX_CSV_BYTES)throw new Error('CSV exceeds the 256 KB limit.');
  const input=text.replace(/^\uFEFF/,'');
  const records=[];
  let fields=[],field='',quoted=false,afterQuote=false;
  function finish(){
    fields.push(field);
    if(fields.some(value=>value!==''))records.push(fields);
    fields=[];field='';afterQuote=false;
    if(records.length>MAX_CSV_ROWS+1)throw new Error('CSV exceeds 2,000 data rows.');
  }
  for(let i=0;i<input.length;i++){
    const ch=input[i];
    if(quoted){
      if(ch==='"'){
        if(input[i+1]==='"'){field+='"';i++;}
        else {quoted=false;afterQuote=true;}
      }else field+=ch;
      continue;
    }
    if(afterQuote && ch!==',' && ch!=='\n' && ch!=='\r')
      throw new Error('Invalid text after a closing CSV quote.');
    if(ch==='"'){
      if(field || afterQuote)throw new Error('Invalid CSV quote position.');
      quoted=true;
    }else if(ch===','){
      fields.push(field);field='';afterQuote=false;
    }else if(ch==='\r'||ch==='\n'){
      if(ch==='\r'&&input[i+1]==='\n')i++;
      finish();
    }else field+=ch;
  }
  if(quoted)throw new Error('Unclosed quoted CSV field.');
  if(field!==''||fields.length||afterQuote)finish();
  if(records.length<3)throw new Error('Provide a header and at least two sales rows.');
  return records;
}
function parseCents(raw,row){
  const val=raw.trim();
  if(!REVENUE.test(val))throw new Error('Invalid revenue on CSV row '+row+'. Use USD numbers such as 1234.50 or -20.00.');
  const negative=val.startsWith('-');
  const [whole,frac='']= (negative?val.slice(1):val).split('.');
  const cents=BigInt(whole)*100n+BigInt((frac+'00').slice(0,2));
  return negative?-cents:cents;
}
function parsedRows(text){
  const records=csvRecords(text);
  const headings=records[0].map(h=>h.trim().toLowerCase());
  if(headings.length>30||new Set(headings).size!==headings.length)
    throw new Error('CSV has too many or duplicate headers.');
  const mi=headings.indexOf('month'),ri=headings.indexOf('revenue');
  if(mi<0||ri<0)throw new Error('CSV must contain month and revenue columns.');
  const rows=records.slice(1).map((fields,i)=>{
    if(fields.length!==headings.length)throw new Error('Incorrect column count on row '+(i+2)+'.');
    const month=fields[mi].trim();
    if(!MONTH.test(month))throw new Error('Invalid month on row '+(i+2)+'. Use YYYY-MM.');
    return {month,cents:parseCents(fields[ri],i+2)};
  });
  if(rows.length>MAX_CSV_ROWS)throw new Error('CSV exceeds 2,000 data rows.');
  return rows;
}
export function formatUsd(input){
  const cents=BigInt(input),abs=cents<0n?-cents:cents;
  return (cents<0n?'-$':'$')+(abs/100n).toLocaleString('en-US')+'.'+String(abs%100n).padStart(2,'0');
}
export function analyzeSalesCsv(text){
  const rows=parsedRows(text),sums=new Map();
  for(const row of rows)sums.set(row.month,(sums.get(row.month)||0n)+row.cents);
  const months=[...sums.keys()].sort();
  if(months.length<2)throw new Error('Include at least two distinct months for a comparison.');
  const amounts=months.map(month=>({month,cents:sums.get(month).toString()}));
  const total=amounts.reduce((sum,row)=>sum+BigInt(row.cents),0n);
  const delta=sums.get(months.at(-1))-sums.get(months.at(-2));
  return {schema:'evercraft.work-saban.browser-sales.v1',rowCount:rows.length,
    months:amounts,totalCents:total.toString(),lastChangeCents:delta.toString()};
}
// Separate arithmetic reduction from original rows, checked against the report.
// Not a third-party audit, a signature, or a registered agent receipt.
export function checkSalesReport(text,summary){
  try {
    if(!summary||!Array.isArray(summary.months))return false;
    const rows=parsedRows(text);
    const check=Object.create(null);
    let grandTotal=0n;
    for(const {month,cents} of rows){
      check[month]=(check[month]??0n)+cents;
      grandTotal+=cents;
    }
    const months=Object.keys(check).sort();
    if(rows.length!==summary.rowCount||months.length<2||months.length!==summary.months.length)return false;
    if(grandTotal.toString()!==summary.totalCents)return false;
    if(!months.every((m,i)=>m===summary.months[i].month&&check[m].toString()===summary.months[i].cents))return false;
    return (check[months.at(-1)]-check[months.at(-2)]).toString()===summary.lastChangeCents;
  }catch{return false;}
}
export function salesMarkdown(summary,sourceDigest){
  if(!summary||!Array.isArray(summary.months)||!/^sha256:[a-f0-9]{64}$/.test(sourceDigest))
    throw new Error('Verified summary and source digest required.');
  const latest=BigInt(summary.lastChangeCents);
  return [
    '# Work Saban / Monthly sales report','',
    'Calculated locally in your browser from the CSV you explicitly selected.',
    'This is a deterministic arithmetic report, not an AI agent result or professional financial audit.','',
    '**Total sales:** '+formatUsd(summary.totalCents),
    '**Latest month change:** '+(latest<0n?'Down '+formatUsd(-latest):latest>0n?'Up '+formatUsd(latest):'No change'),'',
    '| Month | Revenue |','| --- | ---: |',
    ...summary.months.map(row=>'| '+row.month+' | '+formatUsd(row.cents)+' |'),'',
    'Arithmetic check: PASSED (second pass over the same source rows).',
    'Rows: '+summary.rowCount,
    'Source digest: '+sourceDigest,
    'No file content was uploaded or retained by Work Saban.',''
  ].join('\n');
}
