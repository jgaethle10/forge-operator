/** Evercraft Aqua RC12: one-meter observational baseline.
 * Passive, offline screening only. No sensor authentication, leak detection,
 * irrigation-efficiency calculation, water-savings or ROI inference.
 */
export const FIELDS = Object.freeze(['date','meter_id','cumulative_reading','units','pump_kwh_since_previous','observation_kind']);
export const UNITS = Object.freeze({L:1,US_GAL:3.785411784,M3:1000});
const MAX_ROWS = 370;
export class EvidenceHold extends Error { constructor(message){super('HOLD: '+message);this.name='EvidenceHold';} }
function finiteDecimal(x,name,{optional=false}={}) {
  if(optional && x==='')return null;
  if(typeof x!=='string'|| !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(x.trim()))throw new EvidenceHold(name+' is missing, negative or not a nonnegative decimal');
  const n=Number(x);
  if(!Number.isFinite(n)||n>Number.MAX_SAFE_INTEGER)throw new EvidenceHold(name+' is not a safe finite number');
  return n;
}
function parseDate(s){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new EvidenceHold('date format must be YYYY-MM-DD');
  const d=new Date(s+'T12:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw new EvidenceHold('invalid calendar date '+s);
  return d;
}
function csvRows(t){
  if(typeof t!=='string'||t.length>1_000_000||!t.trim())throw new EvidenceHold('CSV missing or too large');
  t=t.replace(/^\uFEFF/,'');
  let rows=[],row=[],field='',mode='start';
  function finish(){row.push(field);if(row.length!==1||row[0]!=='')rows.push(row);row=[];field='';mode='start';}
  for(let i=0;i<t.length;i++){
    const c=t[i];
    if(mode==='quoted'){if(c==='"' && t[i+1]==='"'){field+='"';i++;}else if(c==='"')mode='afterQuote';else field+=c;}
    else if(c==='"'){if(mode!=='start')throw new EvidenceHold('malformed CSV quotes');mode='quoted';}
    else if(c===','){row.push(field);field='';mode='start';}
    else if(c==='\r'||c==='\n'){if(c==='\r'&&t[i+1]==='\n')i++;finish();}
    else {if(mode==='afterQuote'||c==='\0')throw new EvidenceHold('invalid CSV character');field+=c;mode='plain';}
  }
  if(mode==='quoted')throw new EvidenceHold('unterminated quoted field');
  if(field!==''||row.length)finish();
  if(!rows.length||rows[0].join('|')!==FIELDS.join('|'))throw new EvidenceHold('CSV headers must match the Aqua single-meter template');
  if(rows.length-1<15)throw new EvidenceHold('need 15 consecutive daily totalizer readings for a 14-day baseline');
  if(rows.length-1>MAX_ROWS)throw new EvidenceHold('max 370 daily rows per baseline');
  return rows.slice(1).map((cells,i)=>{
    if(cells.length!==FIELDS.length)throw new EvidenceHold('CSV row '+(i+2)+' has wrong number of fields');
    return Object.fromEntries(FIELDS.map((f,j)=>[f,cells[j]]));
  });
}
function round(n,decimals=3){return Math.round((n+Number.EPSILON)*10**decimals)/10**decimals;}
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

export function analyzeSingleMeter(text,{allowBuiltInDemo=false}={}){
  const raw=csvRows(text);let prev=null,intervals=[],unknownEnergy=0,totalKwh=0,origin=null,unit=null,id=null;
  for(const [i,row] of raw.entries()){
    const dt=parseDate(row.date);
    if(!row.meter_id?.trim()||row.meter_id.length>60)throw new EvidenceHold('valid meter identifier required');
    if(!Object.hasOwn(UNITS,row.units))throw new EvidenceHold('units must be L, US_GAL, or M3');
    if(!['OPERATOR_SUPPLIED_READING','SYNTHETIC_DEMONSTRATION'].includes(row.observation_kind))throw new EvidenceHold('unrecognized observation kind');
    if(!origin)origin=row.observation_kind;
    if(row.observation_kind!==origin)throw new EvidenceHold('mixed observation provenance');
    if(!id)id=row.meter_id;
    if(!unit)unit=row.units;
    if(id!==row.meter_id || unit!==row.units)throw new EvidenceHold('meter or units changed during baseline');
    if(origin==='SYNTHETIC_DEMONSTRATION' && !allowBuiltInDemo)throw new EvidenceHold('demonstration CSV cannot be admitted as site observations');
    if(origin!=='SYNTHETIC_DEMONSTRATION' && /(?:DEMO|SYNTH|TEST|FICTION)/i.test(id))throw new EvidenceHold('fictional meter identifier in operator observations');
    const reading=finiteDecimal(row.cumulative_reading,'cumulative meter totalizer');
    const kwh=finiteDecimal(row.pump_kwh_since_previous,'pump energy',{optional:true});
    if(i===0 && kwh!==null)throw new EvidenceHold('first row energy must be blank (no prior interval)');
    if(prev){
      if(dt.getTime()-prev.date.getTime()!==86400000)throw new EvidenceHold('dates must be consecutive; missing/duplicate day');
      if(reading<prev.reading)throw new EvidenceHold('totalizer rollover/reset cannot be silently interpreted');
      const waterL=(reading-prev.reading)*UNITS[unit];
      if(!Number.isFinite(waterL)||waterL>Number.MAX_SAFE_INTEGER)throw new EvidenceHold('unsafe converted interval volume');
      if(kwh===null)unknownEnergy++;else totalKwh+=kwh;
      intervals.push({ending_date:row.date,source_withdrawal_l:round(waterL),pump_kwh:kwh});
    }
    prev={date:dt,reading};
  }
  const totalL=(Number(raw.at(-1).cumulative_reading)-Number(raw[0].cumulative_reading))*UNITS[unit];
  if(!Number.isFinite(totalL)||totalL>Number.MAX_SAFE_INTEGER)throw new EvidenceHold('unsafe overall volume');
  if(unknownEnergy>0)totalKwh=null;
  return {
    schema:'evercraft.aqua.single-meter-baseline.v1',
    source_integrity_sha256:sha256Hex(text),
    source_integrity_note:'SHA-256 of decoded input text. Integrity only; not proof of site origin or sensor calibration.',
    evidence_state:origin==='SYNTHETIC_DEMONSTRATION'?'SYNTHETIC_DEMONSTRATION':'OPERATOR_SUPPLIED_UNVERIFIED',
    physically_verified:false,calibration_verified:false,source_authorized:false,
    leak_verified:false,water_savings_verified:false,irrigation_efficiency_measured:false,
    meter_id:id,units:unit,reading_count:raw.length,interval_count:intervals.length,
    from:raw[0].date,to:raw.at(-1).date,
    total_source_withdrawal_l:round(totalL),mean_daily_withdrawal_l:round(totalL/intervals.length),
    pump_energy_kwh:totalKwh===null?null:round(totalKwh),energy_intervals_missing:unknownEnergy,
    energy_kwh_per_m3:totalKwh===null || totalL===0?null:round(totalKwh/(totalL/1000),4),
    daily_intervals:intervals,
    advisory:'SINGLE METER ONLY: this is a source-withdrawal baseline. No downstream usage, losses, leaks, savings, water rights or crop performance can be inferred.',
    next_proof:'Independently authenticate meter calibration, sampling times, unit, source boundary, operator consent and site context. Compare a separately reviewed treatment vs baseline before any savings claim.'
  };
}
export function demoCSV(){
 const out=[FIELDS.join(',')],start=Date.UTC(2025,0,1);let total=10000;
 for(let i=0;i<15;i++){
  if(i>0)total+=(i%4===0?750:1000);
  out.push([new Date(start+i*86400000).toISOString().slice(0,10),'SYNTHETIC_SOURCE_001',total,'L',i?4.25:'','SYNTHETIC_DEMONSTRATION'].join(','));
 }
 return out.join('\n')+'\n';
}
export function templateCSV(){
 const out=[FIELDS.join(',')];
 const today=new Date();today.setHours(12,0,0,0);
 const start=new Date(today);start.setDate(start.getDate()-14);
 for(let i=0;i<15;i++){
   const dt=new Date(start);dt.setDate(start.getDate()+i);
   const day=[dt.getFullYear(),String(dt.getMonth()+1).padStart(2,'0'),String(dt.getDate()).padStart(2,'0')].join('-');
   out.push([day,'','','L','','OPERATOR_SUPPLIED_READING'].join(','));
 }
 return out.join('\n')+'\n';
}