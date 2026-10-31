import {analyzePartQuery,buildSourceSearches,createSavedSearch} from './engine.mjs';
import {addCandidate,removeCandidate} from './candidates.mjs';
import {recoveryResearchLinks} from './recovery-links.mjs';
// Buyer-initiated links only. No supplier listing data or invented matches.
const form=document.querySelector('#search-form');
const input=document.querySelector('#part-query');
const results=document.querySelector('#results');
const description=document.querySelector('#query-description');
const container=document.querySelector('#source-results');
let activeBrief=null;
function render(raw){
 const analysis=analyzePartQuery(raw);
 if(!analysis.valid){input.setCustomValidity(analysis.error);input.reportValidity();return}
 input.setCustomValidity('');
 const links=buildSourceSearches(analysis);
 activeBrief=createSavedSearch(analysis,links);
 container.replaceChildren();
 for(const source of links){
  const box=document.createElement('article');box.className='source';
  const title=document.createElement('h3');title.textContent=source.name;
  const detail=document.createElement('p');detail.textContent=source.category+' · External search, not a verified match';
  const anchor=document.createElement('a');anchor.textContent='Explore source';anchor.href=source.url;anchor.target='_blank';anchor.rel='noopener noreferrer';
  box.append(title,detail,anchor);container.append(box);
 }
 description.textContent='Searching for: '+analysis.query+
   (analysis.candidateNumbers.length?' · Possible part number: '+analysis.candidateNumbers.join(', '):'');
 results.hidden=false;
 drawCandidates();
 const recoveryBox=document.querySelector('#recovery-links');
 const recoverySummary=document.querySelector('#recovery-summary');
 if(recoveryBox&&recoverySummary){
  recoveryBox.replaceChildren();
  recoverySummary.textContent='Research routes only. No supplier, interchange or fabrication result has been verified.';
  for(const item of recoveryResearchLinks(analysis.query)){
   const card=document.createElement('article');card.className='source';
   const heading=document.createElement('h3');heading.textContent=item.label;
   const note=document.createElement('p');note.textContent='Explore external sources; results require independent review.';
   const link=document.createElement('a');link.href=item.url;link.target='_blank';
   link.rel='noopener noreferrer';link.textContent='Search this route';
   card.append(heading,note,link);recoveryBox.append(card);
  }
 }
 const save=document.querySelector('#save-search');
 if(save)save.hidden=false;
}
form?.addEventListener('submit',event=>{event.preventDefault();render(input.value)});
input?.addEventListener('input',()=>input.setCustomValidity(''));
document.querySelector('#save-search')?.addEventListener('click',()=>{
 if(!activeBrief)return;
 const blob=new Blob([JSON.stringify(activeBrief,null,2)+'\n'],{type:'application/json'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='findmypart-search-brief.json';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});

const candidateForm=document.querySelector('#candidate-form');
const candidateList=document.querySelector('#candidate-list');
const candidateStatus=document.querySelector('#candidate-status');
function drawCandidates(){
 if(!candidateList)return;
 candidateList.replaceChildren();
 for(const [index,candidate] of (activeBrief?.source_evidence||[]).entries()){
  const card=document.createElement('article');card.className='source';
  const heading=document.createElement('h3');heading.textContent=candidate.part_number_claim||candidate.seller_domain;
  const status=document.createElement('p');status.textContent='Buyer-entered candidate · Fitment, inventory and price unverified';
  const notes=document.createElement('p');notes.textContent=[candidate.price_claim,candidate.buyer_notes].filter(Boolean).join(' · ');
  const link=document.createElement('a');link.textContent='Open listing';link.href=candidate.source_url;link.target='_blank';link.rel='noopener noreferrer';
  const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.addEventListener('click',()=>{activeBrief=removeCandidate(activeBrief,index);drawCandidates()});
  card.append(heading,status,notes,link,document.createTextNode(' '),remove);candidateList.append(card);
 }
}
candidateForm?.addEventListener('submit',event=>{
 event.preventDefault();
 if(!activeBrief){candidateStatus.textContent='Search for a part first.';return}
 try{
  activeBrief=addCandidate(activeBrief,{
   url:document.querySelector('#candidate-url').value,
   partNumber:document.querySelector('#candidate-part').value,
   priceText:document.querySelector('#candidate-price').value,
   notes:document.querySelector('#candidate-notes').value});
  candidateStatus.textContent='Candidate saved to this search. Download the brief to keep a copy.';
  candidateForm.reset();drawCandidates();
 }catch(error){candidateStatus.textContent=error.message||'Could not save candidate.'}
});
