// Evercraft Watershed Intelligence | official NRCS Washington SNOTEL basin update report.
// Source-only, read-only, not an independent basin calculation or customer release.
export const NRCS_WA_BASIN_REPORT_URL =
  'https://wcc.sc.egov.usda.gov/reports/UpdateReport.html?format=SNOTEL%20Snowpack%20Update%20Report&report=Washington';
export const NRCS_WA_BASINS = Object.freeze([
  {id:'upper-yakima', label:'UPPER YAKIMA'},
  {id:'naches',label:'NACHES'},
  {id:'lower-yakima',label:'LOWER YAKIMA'}
]);
export const NRCS_NORMALS_PERIOD='1991-2020';

function asDate(text) {
  if(typeof text!=='string'||!/^\d{4}-\d\d-\d\d$/.test(text)) throw new TypeError('invalid report date');
  const d=new Date(text+'T00:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==text) throw new TypeError('invalid report calendar date');
  return text;
}
function entities(text) {
  return text.replace(/&(?:nbsp|#160|#xA0);/gi,' ')
    .replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi,(_,hex,dec)=>{
      const n=parseInt(hex||dec,hex?16:10);
      return n>0&&n<=0x10ffff ? String.fromCodePoint(n) : '';
    });
}
function htmlRows(raw) {
  // Treat upstream HTML only as data. Never evaluate scripts, styles, or event attributes.
  const plain=entities(raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'')
    .replace(/<\/(?:tr|p|div|h[1-6]|table|caption|th)>/gi,'\n')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/t[dh]>/gi,' | ')
    .replace(/<[^>]*>/g,' ')
    .replace(/\u00a0/g,' '));
  return plain.split(/\r?\n/g).map(line=>line.replace(/\s+/g,' ').replace(/^[| ]+|[| ]+$/g,'').trim()).filter(Boolean);
}
function reportDate(rows) {
  const text=rows.slice(0,40).join(' ');
  const found=/first reading of the day[^]*?\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i.exec(text);
  if(!found) throw new TypeError('NRCS report observation date missing');
  const month=['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(found[1].toLowerCase())+1;
  return asDate(found[4]+'-'+String(month).padStart(2,'0')+'-'+found[2].padStart(2,'0'));
}
function indexRow(rows, start, end, label) {
  const reportPart=rows.slice(start+1,end);
  // Exactly one Basin Index in this named section; never accept a station's ratio.
  const matches=[];
  for(let i=0;i<reportPart.length;i++) {
    const line=reportPart[i];
    if(/Basin\s+Index\s*\(%\)/i.test(line)) {
      const following=[line,...reportPart.slice(i+1,i+3)].join(' ');
      const m=/Basin\s+Index\s*\(%\)\s*(?:\|\s*)?(\d{1,5})(\.\d+)?\s*(\*)?/i.exec(following);
      if(!m) throw new TypeError('NRCS '+label+' basin index unreadable');
      matches.push({value:Number(m[1]+(m[2]||'')),star:m[3]==='*'});
    }
  }
  if(matches.length!==1) throw new TypeError('NRCS '+label+' basin index ambiguous or missing');
  const result=matches[0];
  if(!Number.isFinite(result.value)||result.value<0||result.value>10000) throw new TypeError('NRCS basin index outside review bounds');
  return result;
}
export function parseNrcsWashingtonBasinReport(html,{asOf=new Date().toISOString()}={}){
  if(typeof html!=='string'||html.length<200||html.length>2500000) throw new TypeError('NRCS HTML response out of bounds');
  const lines=htmlRows(html);
  const prefix=lines.slice(0,40).join(' ');
  if(!/Washington SNOTEL Snowpack Update Report/i.test(prefix)||
    !/Provisional data, subject to revision/i.test(prefix)) throw new TypeError('unexpected NRCS report identity or missing provisional disclaimer');
  if(!lines.some(l=>/Basin\s+Index\s*\(%\)/i.test(l))) throw new TypeError('NRCS report contains no basin indices');
  const sourceDate=reportDate(lines), collected=new Date(asOf);
  if(!Number.isFinite(collected.getTime())) throw new TypeError('invalid asOf time');
  const delta=(Date.parse(collected.toISOString().slice(0,10)+'T00:00:00Z')-
    Date.parse(sourceDate+'T00:00:00Z'))/86400000;
  if(delta< -1||delta>2) throw new TypeError('NRCS official basin report stale or future-dated');
  const positions=NRCS_WA_BASINS.map(b=>{
    const matches=lines.map((line,i)=>line.toUpperCase()===b.label?i:-1).filter(i=>i>=0);
    if(matches.length!==1) throw new TypeError('NRCS basin heading missing or duplicated: '+b.label);
    return {...b,start:matches[0]};
  });
  if(positions.some((x,i)=>i>0&&x.start<=positions[i-1].start))throw new TypeError('NRCS basin order unexpected');
  const nextHeading=lines.findIndex((line,i)=>i>positions[2].start && /^[A-Z][A-Z, ]{4,}$/.test(line) && line!=='BASIN INDEX');
  const stop=nextHeading>0?nextHeading:lines.length;
  const basins=positions.map((b,i)=>{
    const end=i+1<positions.length ? positions[i+1].start : stop;
    const idx=indexRow(lines,b.start,end,b.id);
    return {
      id:b.id, name:b.label,
      value_percent:idx.value,
      warning_flag:idx.star,
      condition:idx.star?'potentially_unrepresentative':'provisional',
      observation_date:sourceDate,
      reference_period:NRCS_NORMALS_PERIOD,
      source_family:'usda-nrcs-official-basin-update',
      metric:'basin_swe_index_percent_of_median',
      provenance:NRCS_WA_BASIN_REPORT_URL
    };
  });
  return {
    schema:'evercraft.research.nrcs-basin-index.v1',
    source:'NRCS Washington SNOTEL Snowpack Update Report',
    source_url:NRCS_WA_BASIN_REPORT_URL,
    observed_date:sourceDate,
    collected_at:collected.toISOString(),
    reference_period:NRCS_NORMALS_PERIOD,
    basins,
    all_basins_warned:basins.every(b=>b.warning_flag),
    method:'NRCS: 100 * sum(valid station current SWE) / sum(corresponding station medians), with official exclusions.',
    warning_interpretation:'NRCS * indicates analysis may not validly represent conditions; early-season daily medians may be very small.',
    station_roster_from_source:'official_predefined_report',
    not_an_independent_recalculation:true,
    seasonal_outlook_verified:false,
    flood_or_hazard_state:'not_assessed',
    publication_authorized:false
  };
}
export async function fetchNrcsWashingtonBasinReport({fetchImpl=globalThis.fetch,asOf=new Date().toISOString()}={}){
  if(typeof fetchImpl!=='function')throw new TypeError('fetch required');
  const resp=await fetchImpl(NRCS_WA_BASIN_REPORT_URL,{
    headers:{Accept:'text/html','User-Agent':'Evercraft-Watershed-Research/0.4 (https://github.com/jgaethle10/forge-operator)'}
  });
  if(!resp?.ok)throw new Error('official NRCS basin report HTTP '+String(resp?.status??'unknown'));
  if(resp.url) {
    const u=new URL(resp.url);
    if(u.protocol!=='https:'||u.hostname!=='wcc.sc.egov.usda.gov'||!u.pathname.startsWith('/reports/UpdateReport.html'))
      throw new TypeError('NRCS report redirected outside its official host');
  }
  const source=await resp.text();
  return parseNrcsWashingtonBasinReport(source,{asOf});
}
