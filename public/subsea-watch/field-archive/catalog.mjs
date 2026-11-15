// Subsea Watch / Field Archive. Source ledger is first-party static metadata.
// Remote NOAA footage is requested only after an explicit Preview click.
const $=id=>document.getElementById(id);
const list=$('source-list');
const button=$('start-preview');
const status=$('preview-status');
const player=$('archive-video');
const viewer=$('viewer');
let videoSource=null;
const allowedUrl=value=>{
 try{
  const u=new URL(value);
  if(u.protocol!=='https:')return null;
  if(!/(^|\.)(noaa\.gov|msstate\.edu|gebco\.net)$/.test(u.hostname))return null;
  return u.href;
 }catch{return null;}
};
function link(label,value){
 const href=allowedUrl(value);
 if(!href)return null;
 const a=document.createElement('a');
 a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;
 return a;
}
function card(source){
 const item=document.createElement('article');item.className='source';
 const type=document.createElement('div');type.className='type';
 type.textContent=source.kind.replaceAll('_',' ');item.append(type);
 const title=document.createElement('h3');title.textContent=source.name;item.append(title);
 const detail=document.createElement('p');detail.textContent=source.verified_metadata;item.append(detail);
 const rights=document.createElement('p');rights.className='rights';
 rights.textContent='Rights / limits: '+source.rights;item.append(rights);
 const actions=document.createElement('div');actions.className='links';
 const record=link('Original record',source.source_page);if(record)actions.append(record);
 const download=link('Original file',source.download_url);if(download)actions.append(download);
 item.append(actions);
 return item;
}
async function start(){
 button.disabled=true;
 try{
  const r=await fetch('./sources.json',{cache:'no-store'});
  if(!r.ok)throw Error('Source ledger returned HTTP '+r.status);
  const data=await r.json();
  if(data.schema!=='evercraft.subsea.field_sources.v1'||!Array.isArray(data.entries))throw Error('Invalid source ledger version');
  if(data.entries.length<2||data.entries.length>30)throw Error('Unexpected ledger length');
  list.replaceChildren(...data.entries.map(card));
  const video=data.entries.find(x=>x.id==='noaa-ex2306-dive02-video'&&x.can_preview===true);
  if(!video||!allowedUrl(video.download_url))throw Error('NOAA video URL missing or untrusted');
  videoSource=allowedUrl(video.download_url);
  button.disabled=false;
  document.documentElement.dataset.fieldArchive='ledger-ready';
 }catch(e){
  status.textContent='The source ledger could not load: '+e.message+'. The original NOAA record and download links remain available above.';
  document.documentElement.dataset.fieldArchive='ledger-unavailable';
  if(!list.children.length)list.textContent='Source ledger unavailable. Use the NOAA source links in the Kodiak Seep panel.';
 }
}
button.addEventListener('click',()=>{
 if(!videoSource)return;
 // Do not associate video with a synthetic 3D track or unverified timestamp series.
 viewer.classList.add('active');
 player.src=videoSource;
 player.load();
 document.documentElement.dataset.fieldArchive='noaa-preview-requested';
 status.textContent='Requested original NOAA video; no telemetry or 3D geometry is being inferred. Use the original MP4 link if preview is unavailable.';
 const p=player.play();
 if(p&&typeof p.catch==='function')p.catch(()=>{
  status.textContent='Autoplay was blocked or NOAA is temporarily unavailable. Use the video controls or the original download link.';
 });
});
player.addEventListener('error',()=>{
 status.textContent='NOAA media could not play in this browser. The archive record and direct MP4 link are still available.';
});
start();
