import {validateDestinationRegistry,portalHref,filterDestinations} from '../world-portal.mjs';
const status=document.getElementById('portalStatus'),list=document.getElementById('portalList'),search=document.getElementById('portalSearch'),category=document.getElementById('portalCategory');
function display(destinations){
 const found=filterDestinations(destinations,search.value,category.value);
 list.replaceChildren();
 for(const d of found){
  const a=document.createElement('a');a.className='portal-entry';a.href=portalHref(d.path);
  const title=document.createElement('strong');title.textContent=d.name;
  const info=document.createElement('small');info.textContent=d.category.toUpperCase()+' · '+d.status;
  const desc=document.createElement('span');desc.textContent=d.description;
  const enter=document.createElement('b');enter.textContent='ENTER WORLD ↗';
  a.append(title,info,desc,enter);list.append(a);
 }
 status.textContent=found.length+' destination'+(found.length===1?'':'s')+' available';
 if(!found.length){const p=document.createElement('p');p.textContent='No matching worlds. Try another search.';list.append(p);}
}
try{
 const response=await fetch('../destinations.v1.json',{cache:'no-store'});
 if(!response.ok)throw Error('Registry unavailable');
 const destinations=validateDestinationRegistry(await response.json());
 const categories=[...new Set(destinations.map(d=>d.category))].sort();
 for(const value of categories){const option=document.createElement('option');option.value=value;option.textContent=value[0].toUpperCase()+value.slice(1);category.append(option);}
 search.addEventListener('input',()=>display(destinations));
 category.addEventListener('change',()=>display(destinations));
 display(destinations);
}catch(error){
 status.textContent='Live directory temporarily unavailable. Use the featured destinations above.';
 list.replaceChildren();
}
