/**
 * Read-only research view. Lives under the existing Evercraft Worlds site.
 * No calls to the canonical world's save, render, movement or entity APIs.
 */
import {sourceInspectionPacket} from './source-review-workbench.mjs';
const base='./yakima-1960/';
const read=async file=>{
  const response=await fetch(base+file,{cache:'no-store'});
  if(!response.ok)throw Error('Source record unavailable ('+response.status+')');
  return response.json();
};
const tag=(name,cls,content)=>{
  const x=document.createElement(name);
  if(cls)x.className=cls;
  if(content!==undefined)x.textContent=String(content);
  return x;
};
const sourceName={6:'A.E. Larson Building',15:'Capitol Theatre'};
const captions={
 'named-landmark':'Archive staff report this landmark looks unchanged, but nobody has approved 1960 geometry.',
 'unidentified-neighbor-inventory':'The archive confirms changes nearby. Individual structures must be identified using reviewed originals.'
};
async function start(){
 const status=document.getElementById('loading');
 try{
  const [queue,ledger,acquisition]=await Promise.all([
    read('source-review-queue.v1.json'),read('evidence.v1.json'),read('csun-1960-acquisition.v1.json')
  ]);
  const packet=sourceInspectionPacket(queue,ledger,acquisition);
  const cards=document.getElementById('sheets');
  for(const source of packet.primarySheets){
   const card=tag('article','sheet');
   card.append(tag('span','chip','Library of Congress · 1952'));
   card.append(tag('h3','',sourceName[source.sheet]));
   card.append(tag('p','meta','SANBORN SHEET '+source.sheet+' · LOC VIEWER PAGE '+source.viewerPage));
   card.append(tag('p','meta','CSUN identified this sheet in its 1960-corrected volume. LOC image pixels and 1960 originals remain unreviewed.'));
   const link=tag('a','link','Examine original LOC source ↗');
   link.href=source.viewerUrl;link.target='_blank';link.rel='noopener noreferrer';
   link.setAttribute('aria-label','Open LOC 1952 sheet '+source.sheet+' for '+sourceName[source.sheet]);
   card.append(link);cards.append(card);
  }
  const list=document.getElementById('reviewQueue');
  for(const [i,ticket] of packet.reviewTickets.entries()){
   const item=tag('li');
   item.append(tag('span','number',String(i+1).padStart(2,'0')));
   const body=tag('div');
   body.append(tag('h3','',ticket.title));
   body.append(tag('p','',captions[ticket.category]||'Source inspection required'));
   item.append(body,tag('span','status','REVIEW REQUIRED'));
   list.append(item);
  }
  status.textContent='Records loaded and checked against the Timewalk source-review contract. No 1960 geometry approved.';
 }catch(e){
  status.textContent='Source ledger could not be validated or loaded. No historical accuracy claims can be made from this page. '+String(e.message||'');
  status.setAttribute('data-status','error');
 }
}
start();