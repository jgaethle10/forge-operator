/** Evercraft Aqua Baseline RC11 | client-side measurement screening.
 * Pure computation only. Never sends data, actuates equipment, certifies calibration,
 * proves a leak, asserts water savings, or grants legal water-use permissions.
 * The operator's 'ACTUAL_RECORDED_METER' label is an unverified assertion.
 */
export const COLUMNS = Object.freeze([
  'date','source_meter_id','source_open_l','source_close_l',
  'irrigation_meter_id','irrigation_open_l','irrigation_close_l',
  'source_uncertainty_l','irrigation_uncertainty_l','pump_kwh',
  'calibration_ref','observation_kind'
]);

export class EvidenceHold extends Error {constructor(message){super(message);this.name='EvidenceHold';}}
const nonblank = x => typeof x==='string' && x.trim().length>0;
function number(x,label){
  if(typeof x!=='string'||x.trim()===''||!/^\+?(?:\d+(?:\.\d*)?|\.\d+)$/.test(x.trim()))
    throw new EvidenceHold(`${label}: nonnegative numeric reading required; unknown is not zero`);
  const value=Number(x);
  if(!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER)throw new EvidenceHold(`${label}: outside valid finite range`);
  return value;
}
function isoDate(s){
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new EvidenceHold('Date must be YYYY-MM-DD');
  const d=new Date(`${s}T00:00:00Z`);
  if(Number.isNaN(d.valueOf())||d.getUTCFullYear()<1900||d.getUTCFullYear()>2100||d.toISOString().slice(0,10)!==s)throw new EvidenceHold(`Invalid calendar date: ${s}`);
  return d;
}
function parseCSV(text){
  if(typeof text!=='string'||text.length>2_000_000)
    throw new EvidenceHold('Input must be a CSV smaller than 2 MB');
  // CSV four-state scanner. Strictly reject stray quotes after a quoted field or
  // inside unquoted text. Quoted commas, escaped quotes and CRLF are supported.
  // A leading UTF-8 BOM is permitted for Excel-exported CSVs.
  if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);
  let rows=[],row=[],field='',state='start';
  function finishRow(){
    row.push(field);
    if(row.length!==1||row[0]!=='')rows.push(row);
    row=[];field='';state='start';
  }
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(state==='quoted'){
      if(c==='"'&&text[i+1]==='"'){field+='"';i++}
      else if(c==='"')state='afterQuote';
      else field+=c;
    }else if(c==='"'){
      if(state!=='start')throw new EvidenceHold('Malformed CSV quoting');
      state='quoted';
    }else if(c===','){
      row.push(field);field='';state='start';
    }else if(c==='\n'||c==='\r'){
      if(c==='\r'&&text[i+1]==='\n')i++;
      finishRow();
    }else{
      if(state==='afterQuote')throw new EvidenceHold('Invalid character after closing CSV quote');
      if(c==='\0')throw new EvidenceHold('NUL character in CSV: HOLD');
      field+=c;state='plain';
    }
  }
  if(state==='quoted')throw new EvidenceHold('Unclosed CSV quote');
  if(field!==''||row.length)finishRow();
  if(!rows.length||rows[0].join('\0')!==COLUMNS.join('\0'))
    throw new EvidenceHold('Incorrect columns. Use the Aqua Baseline CSV template exactly.');
  return rows.slice(1).map((cells,i)=>{
    if(cells.length!==COLUMNS.length)throw new EvidenceHold(`Row ${i+2}: wrong number of columns`);
    return Object.fromEntries(COLUMNS.map((key,j)=>[key,cells[j]]));
  });
}

/** RFC-compliant SHA-256 of UTF-8 input for a source-data integrity receipt.
 * This proves only that the same bytes were audited, NOT their provenance,
 * calibration, identity or scientific validity. Offline and dependency-free.
 */
export function sha256Hex(text){
  if(typeof text!=='string')throw new EvidenceHold('SHA256 requires text');
  const raw=new TextEncoder().encode(text);
  const length=Math.ceil((raw.length+9)/64)*64;
  const padded=new Uint8Array(length);padded.set(raw);padded[raw.length]=0x80;
  const view=new DataView(padded.buffer);
  const bits=raw.length*8;
  view.setUint32(length-8,Math.floor(bits/0x100000000));
  view.setUint32(length-4,bits>>>0);
  const k=new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);
  const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const w=new Uint32Array(64),rotr=(n,b)=>((n>>>b)|(n<<(32-b)))>>>0;
  for(let base=0;base<length;base+=64){
    for(let i=0;i<16;i++)w[i]=view.getUint32(base+i*4);
    for(let i=16;i<64;i++){
      const v=w[i-15],u=w[i-2];
      const s0=rotr(v,7)^rotr(v,18)^(v>>>3),s1=rotr(u,17)^rotr(u,19)^(u>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let [a,b,c,d,e,f,g,q]=h;
    for(let i=0;i<64;i++){
      const s1=rotr(e,6)^rotr(e,11)^rotr(e,25);
      const ch=(e&f)^(~e&g);
      const t1=(q+s1+ch+k[i]+w[i])>>>0;
      const s0=rotr(a,2)^rotr(a,13)^rotr(a,22);
      const maj=(a&b)^(a&c)^(b&c);
      const t2=(s0+maj)>>>0;
      q=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    const next=[a,b,c,d,e,f,g,q];
    for(let i=0;i<8;i++)h[i]=(h[i]+next[i])>>>0;
  }
  return Array.from(h,n=>n.toString(16).padStart(8,'0')).join('');
}

function r4(x){return Math.round((x+Number.EPSILON)*1e4)/1e4}
export function auditCSV(text,{scopeReviewed=false,syntheticDemo=false}={}){
  if(typeof scopeReviewed!=='boolean'||typeof syntheticDemo!=='boolean')
    throw new EvidenceHold('Review and demo modes must be explicit Booleans');
  if(syntheticDemo&&text!==syntheticSample())
    throw new EvidenceHold('Demo mode is reserved for the exact built-in fictional sample');
  const raw=parseCSV(text);
  if(raw.length<14)throw new EvidenceHold('At least 14 consecutive daily readings required');
  if(raw.length>3660)throw new EvidenceHold('At most ten years per local upload');
  let previous=null,energy=0,inlet=0,outlet=0,uncertainty=0,days=[];
  for(const [i,row] of raw.entries()){
    const d=isoDate(row.date);
    if(previous){
      const next=new Date(previous.d.valueOf()+86_400_000);
      if(d.valueOf()!==next.valueOf())throw new EvidenceHold(`Day ${i+1}: missing, duplicate or out-of-order date`);
    }
    for(const key of ['source_meter_id','irrigation_meter_id','calibration_ref'])
      if(!nonblank(row[key]))throw new EvidenceHold(`Day ${i+1}: missing ${key}`);
    if(row.source_meter_id===row.irrigation_meter_id)throw new EvidenceHold('Inlet and irrigation meter IDs must differ');
    if(row.observation_kind!==(syntheticDemo?'SYNTHETIC_DEMONSTRATION':'ACTUAL_RECORDED_METER'))
      throw new EvidenceHold(`Day ${i+1}: recorded meter evidence required; synthetic examples must stay in demo mode.`);
    if(!syntheticDemo && /(?:SYNTHETIC_|FICTIONAL_|DEMO_)/i.test(
        row.source_meter_id+' '+row.irrigation_meter_id+' '+row.calibration_ref))
      throw new EvidenceHold(`Day ${i+1}: demo identifiers cannot be submitted as field evidence`);
    const nums={};
    for(const key of ['source_open_l','source_close_l','irrigation_open_l','irrigation_close_l','source_uncertainty_l','irrigation_uncertainty_l','pump_kwh'])
      nums[key]=number(row[key],`Day ${i+1} ${key}`);
    if(nums.source_close_l<nums.source_open_l||nums.irrigation_close_l<nums.irrigation_open_l)
      throw new EvidenceHold(`Day ${i+1}: meter reset, rollover or reversed totalizer: HOLD`);
    if(previous){
      if(row.source_meter_id!==previous.row.source_meter_id||row.irrigation_meter_id!==previous.row.irrigation_meter_id)
        throw new EvidenceHold(`Day ${i+1}: meter identity changed`);
      for(const [end,start] of [['source_close_l','source_open_l'],['irrigation_close_l','irrigation_open_l']])
        if(Math.abs(previous.nums[end]-nums[start])>1e-6)
          throw new EvidenceHold(`Day ${i+1}: meter continuity broken`);
    }
    const source=nums.source_close_l-nums.source_open_l;
    const irrigation=nums.irrigation_close_l-nums.irrigation_open_l;
    inlet+=source;outlet+=irrigation;energy+=nums.pump_kwh;
    uncertainty+=nums.source_uncertainty_l+nums.irrigation_uncertainty_l;
    days.push({date:row.date,source_l:r4(source),irrigation_l:r4(irrigation),pump_kwh:r4(nums.pump_kwh)});
    previous={d,row,nums};
  }
  // Even after a user checks scope-reviewed, actual topology and credentials remain UNVERIFIED.
  const residual=scopeReviewed?inlet-outlet:null;
  return {
    product:'Evercraft Aqua Baseline RC11',
    schema_version:'evercraft.aqua.baseline.audit.v1',
    source_integrity_sha256:sha256Hex(text),
    source_integrity_note:'Integrity hash only. It does not certify origin, sensor calibration or operator identity.',
    evidence_state:syntheticDemo?'SYNTHETIC_DEMONSTRATION':'OPERATOR_SUPPLIED_UNVERIFIED',
    authorized_to_claim_savings:false,
    authorized_to_claim_leak:false,
    period_start:days[0].date,period_end:days.at(-1).date,days:days.length,
    source_inlet_l:r4(inlet),irrigation_meter_l:r4(outlet),pump_energy_kwh:r4(energy),
    energy_kwh_per_source_m3:inlet>0?r4(energy/(inlet/1000)):null,
    uncertainty_envelope_l:r4(uncertainty),
    imbalance_status:scopeReviewed?'USER_ATTESTED_BOUNDARY_INDEPENDENT_REVIEW_REQUIRED':'NOT_EVALUATED_TOPOLOGY_UNVERIFIED',
    apparent_imbalance_l:residual===null?null:r4(residual),
    difference_outside_uncertainty_l:residual===null?null:r4(Math.max(0,Math.abs(residual)-uncertainty)),
    days_data:days,
    methods:['Daily totalizer deltas in liters; 14+ consecutive days; pump-energy readings in kWh',
      'Sum of daily stated absolute meter uncertainties used as conservative envelope'],
    limitations:['Data and calibration are user-supplied, not independently authenticated.',
      'Meter differences are not proven leaks or recoverable water.',
      'No observed savings, ROI, agronomic optimization or rights/quality approval.',
      'Analysis occurs entirely in this browser; this page has no upload endpoint.']
  };
}
export function syntheticSample(){
  const rows=[COLUMNS.join(',')];
  const start=Date.UTC(2025,0,1);
  for(let i=0;i<14;i++){
    const dt=new Date(start+i*86_400_000).toISOString().slice(0,10);
    rows.push([dt,'SYNTHETIC_SOURCE',i*1000,(i+1)*1000,'SYNTHETIC_IRRIGATION',i*950,(i+1)*950,
      15,15,6,'FICTIONAL_CALIBRATION','SYNTHETIC_DEMONSTRATION'].join(','));
  }
  return rows.join('\n')+'\n';
}
export function outputJSON(audit){return JSON.stringify(audit,null,2)+'\n'}