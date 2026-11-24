// AD STORY STUDIO -> Fallen Studios. A local-only, voluntary handoff.
// This module never submits a lead, creates an order or charges a customer.
import {storeFallenIdea} from '../../studio-brief-handoff.mjs';

const FORMATS=new Set([
  'Vertical 9:16, 15 seconds',
  'Landscape 16:9, 15 seconds',
  'Square 1:1, 15 seconds'
]);
const LIMITS=Object.freeze({brand:120,audience:180,offer:220,cta:180});
export function composeAdStoryCommercialIdea(input){
  if(!input||typeof input!=='object')return {ok:false,reason:'missing_fields'};
  const fields={};
  for(const [key,max] of Object.entries(LIMITS)){
    if(typeof input[key]!=='string')return {ok:false,reason:'missing_fields'};
    const value=input[key].trim();
    if(!value||value.length>max)return {ok:false,reason:key};
    fields[key]=value;
  }
  if(!FORMATS.has(input.format))return {ok:false,reason:'format'};
  const idea=[
    'Please adapt my free 15-second Ad Story Studio treatment into a proposed 30-second Fallen Studios commercial.',
    'Business or campaign: '+fields.brand,
    'Audience: '+fields.audience,
    'Main offer or problem: '+fields.offer,
    'Desired action: '+fields.cta,
    'Visual format reference: '+input.format.replace(', 15 seconds',''),
    'Proposed opening: recognize the audience\'s problem.',
    'Proposed middle: show authentic evidence of the offer using approved materials.',
    'Proposed ending: one clear call to action.',
    'Source footage, brand rights, actual claims, timing and delivery are for written review.'
  ].join('\n');
  if(idea.length>1800)return {ok:false,reason:'too_long'};
  return {ok:true,idea};
}

if(typeof document!=='undefined'&&typeof window!=='undefined'){
  const get=id=>document.getElementById(id);
  const button=get('commission'),run=get('run'),status=get('commission-status');
  const ids=['brand','aud','offer','cta','format'];
  if(button&&run&&status&&ids.every(id=>get(id))){
    const hide=()=>{button.hidden=true; status.textContent='';};
    for(const id of ids){
      get(id).addEventListener(id==='format'?'change':'input',hide);
    }
    run.addEventListener('click',()=>{
      button.hidden=false;
      status.textContent='Your concept stays in this tab until you choose to continue.';
    });
    button.addEventListener('click',()=>{
      const candidate=composeAdStoryCommercialIdea({
        brand:get('brand').value,audience:get('aud').value,
        offer:get('offer').value,cta:get('cta').value,
        format:get('format').value
      });
      if(!candidate.ok){
        status.textContent='Add your business, audience, offer and call to action, then run the free tool again.';
        return;
      }
      try{
        const saved=storeFallenIdea(window.sessionStorage,candidate.idea);
        if(!saved.ok)throw Error('local_handoff_unavailable');
      }catch{
        status.textContent='Your browser could not save the draft locally. Copy your storyboard and paste it into the commercial inquiry instead.';
        return;
      }
      // Same-origin, same-tab. The next page asks for contact details and
      // explicit consent before any first-party network submission.
      window.location.assign('../../commercial-studio/#inquire');
    });
  }
}
