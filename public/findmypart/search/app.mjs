// FindMyPart source-link preview. Buyer controls every search; no hidden scraping or fabricated inventory.
const sources=[
 {name:'eBay',base:'https://www.ebay.com/sch/i.html?_nkw='},
 {name:'Google Shopping',base:'https://www.google.com/search?tbm=shop&q='},
 {name:'Google web search',base:'https://www.google.com/search?q='},
 {name:'Bing web search',base:'https://www.bing.com/search?q='}
];
const form=document.querySelector('#search-form'),input=document.querySelector('#part-query');
const results=document.querySelector('#results'),description=document.querySelector('#query-description'),container=document.querySelector('#source-results');
function render(query){
 container.replaceChildren();
 for(const source of sources){
  const box=document.createElement('article');box.className='source';
  const title=document.createElement('h3');title.textContent=source.name;
  const text=document.createElement('p');text.textContent='Search '+source.name+' for this exact phrase.';
  const anchor=document.createElement('a');anchor.textContent='View external results';anchor.href=source.base+encodeURIComponent(query);anchor.target='_blank';anchor.rel='noopener noreferrer';
  box.append(title,text,anchor);container.append(box);
 }
 description.textContent='Part search: “'+query+'”';results.hidden=false;
}
form.addEventListener('submit',event=>{
 event.preventDefault();
 const q=input.value.trim().replace(/\s+/g,' ');
 if(q.length<3||q.length>180){input.setCustomValidity('Enter at least three characters.');input.reportValidity();return}
 input.setCustomValidity('');render(q);
});
input.addEventListener('input',()=>input.setCustomValidity(''));
