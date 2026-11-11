import {
  SNAPSHOT_PATH,validateEvidence,formatNumber,sourceAgeLabel,shortDate,ratioLabel,isOfficialSource
} from './model.mjs';

// Browser-only read of a pinned, review-only historical evidence file.
// No automatic sensors, external JS, geolocation, personal data, payments or publishing.
const $=id=>document.getElementById(id);
const el=(name,className,text)=>{
  const node=document.createElement(name);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=String(text);
  return node;
};
const put=(parent,...children)=>{for(const child of children)parent.append(child);return parent;};
const strong=text=>el('b','',text);
const span=(text,klass='')=>el('span',klass,text);
const small=text=>el('p','',text);

function officialLink(url,text='Source ↗') {
  const link=el('a','',text);
  if(isOfficialSource(url)){
    link.href=url;
    link.target='_blank';
    link.rel='noopener noreferrer';
  }else{
    link.textContent='Source unavailable';
    link.removeAttribute('href');
  }
  return link;
}
function metricRow(label,value) {
  const row=el('div','');
  put(row,span(label),strong(value));
  return row;
}
function blockInto(id,build){
  const target=$(id);
  target.replaceChildren();
  build(target);
}

function renderBasins(source){
  blockInto('basin-cards',parent=>{
    for(const basin of source.nrcs.basins){
      const card=el('article','basin');
      const heading=el('div','basin-head');
      put(heading,span(basin.name),span(basin.warning_flag?'NRCS caution':'Provisional',basin.warning_flag?'caution':'pill'));
      const number=el('div','value');
      put(number,document.createTextNode(formatNumber(basin.index_percent)+'%'));
      if(basin.warning_flag)number.append(el('small','','*'));
      const track=el('div','track');
      track.setAttribute('aria-hidden','true');
      const bar=el('div','bar');
      bar.style.width=Math.min(100,(basin.index_percent/250)*100).toFixed(1)+'%';
      track.append(bar);
      put(card,heading,number,track,small(
        basin.warning_flag?'NRCS flags this early-season index as potentially unrepresentative.':'Provisional source-reported index.'
      ));
      parent.append(card);
    }
  });
  $('basin-note').textContent=source.nrcs.warning+
    ' The three basins are separate official indices, not one Evercraft regional average.';
  $('basin-source').href=source.nrcs.source_url;
}
function renderSnow(source){
  blockInto('snow-list',parent=>{
    for(const station of source.snow.stations){
      const card=el('article','data-tile');
      const top=el('div','overline');
      put(top,span('NRCS / SNOTEL'),span(shortDate(station.observed_on)));
      const metric=el('div','reading');
      put(metric,document.createTextNode(formatNumber(station.swe_in,1)+' '),span('in SWE'));
      const meta=el('div','tile-meta');
      put(meta,metricRow('Snow depth',formatNumber(station.depth_in,1)+' in'),
        metricRow('1991–2020 median',formatNumber(station.median_in,1)+' in'));
      const footer=el('div','tile-footer');
      put(footer,span(ratioLabel(station)+' · '),officialLink(station.source_url,'Original readings ↗'));
      const pill=el('span','pill '+(station.ratio_percent===null?'held':''),
        station.ratio_percent===null?'Ratio withheld':'Station comparison');
      put(card,top,el('h3','',station.name),metric,pill,meta,footer);
      parent.append(card);
    }
  });
}
function renderRivers(source){
  blockInto('river-list',parent=>{
    for(const g of source.rivers.sites){
      const card=el('article','data-tile');
      const top=el('div','overline');
      put(top,span('USGS / DISCHARGE'),span(g.id.replace('USGS-','')));
      const metric=el('div','reading');
      put(metric,document.createTextNode(formatNumber(g.discharge_cfs)+' '),span('cfs'));
      const footer=el('div','tile-footer');
      put(footer,span('Recorded '+shortDate(g.observed_at)+' · '),officialLink(g.source_url,'Source ↗'));
      put(card,top,el('h3','',g.name),metric,footer);
      parent.append(card);
    }
  });
}
function renderReservoirs(source){
  $('reservoir-total').textContent=formatNumber(source.reservoirs.derived_provisional_sum_af,2)+' acre-feet';
  blockInto('reservoir-list',parent=>{
    for(const r of source.reservoirs.sites){
      const card=el('article','data-tile');
      const top=el('div','overline');
      put(top,span('USBR RISE / '+r.id),span(shortDate(r.observed_on)));
      const metric=el('div','reading');
      put(metric,document.createTextNode(formatNumber(r.storage_af,2)+' '),span('acre-feet'));
      const footer=el('div','tile-footer');
      put(footer,span('Provisional · reporting timezone unresolved · '),
        officialLink(r.source_url,'RISE record ↗'));
      put(card,top,el('h3','',r.name+' Reservoir'),metric,footer);
      parent.append(card);
    }
  });
}
function renderEvidence(source){
  const names=[
    ['Official basin indices','USDA NRCS Washington snowpack update',source.nrcs.source_url,'nrcs_basin'],
    ['Station SWE and depth','USDA NRCS AWDB daily monitoring',source.snow.stations[0].source_url,'water_usgs_nrcs'],
    ['Historical SWE medians','USDA NRCS 1991–2020 station medians',source.snow.stations[0].source_url,'nrcs_station_medians'],
    ['River discharge','USGS public water observations',source.rivers.sites[0].source_url,'water_usgs_nrcs'],
    ['Reservoir storage','Bureau of Reclamation RISE',source.reservoirs.sites[0].source_url,'usbr_reservoir'],
    ['Collection receipt','Read-only GitHub source artifact',source.source_run_url,null]
  ];
  blockInto('source-ledger',parent=>{
    for(const [title,subtitle,url,hashKey] of names){
      const card=el('article','');
      const digest=hashKey?source.evidence_sha256[hashKey].slice(0,16)+'…':'Workflow run '+source.source_artifact_id;
      put(card,strong(title),small(subtitle),
        small('Evidence receipt: '+digest),officialLink(url,'View original source ↗'));
      parent.append(card);
    }
  });
  blockInto('limitations-list',parent=>{
    for(const note of source.limitations)parent.append(el('li','',note));
  });
}

export function renderWatershed(source){
  const check=validateEvidence(source);
  if(!check.valid)throw new Error('Evidence cannot be displayed: '+check.problems.join(', '));
  $('evidence-date').textContent='NRCS basin report '+shortDate(source.nrcs.observed_on);
  $('source-age').textContent=sourceAgeLabel(source.source_collected_at);
  $('notice-content').textContent=source.status_message+
    ' Observation times differ by source, and the NRCS basin warnings are not optional.';
  renderBasins(source);
  renderSnow(source);
  renderRivers(source);
  renderReservoirs(source);
  renderEvidence(source);
  $('dashboard').hidden=false;
  $('load-error').hidden=true;
}
export async function loadWatershed(fetchImpl=fetch){
  const response=await fetchImpl(SNAPSHOT_PATH,{cache:'no-store'});
  if(!response.ok)throw new Error('Evidence source HTTP '+response.status);
  const snapshot=await response.json();
  renderWatershed(snapshot);
}
if(typeof document!=='undefined'){
  loadWatershed().catch(error=>{
    const alert=$('load-error');
    if(alert){alert.hidden=false;alert.textContent='The archived evidence could not be verified. Measurements are hidden; use official NRCS, USGS and USBR sources instead.';}
    const section=$('dashboard');
    if(section)section.hidden=true;
    console.error('Watershed evidence held:',error?.message||'unknown error');
  });
}
