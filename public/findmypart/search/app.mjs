import {analyzePartQuery,buildSourceSearches,createSavedSearch} from './engine.mjs';
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
