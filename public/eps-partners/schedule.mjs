// EPS Partner Circle personal schedule experiment only.
// No user data persistence, networking, pay calculation, lead harvesting or job authority.
export const ALLOWED_DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export const WINDOWS=Object.freeze({
 morning:'9–11 AM',midday:'12–2 PM',evening:'5–7 PM'
});
export const CIRCLES=Object.freeze({
 homeowners:'homeowners or neighbors who welcome the conversation',
 property:'property managers or landlords already in your network',
 realtors:'realtors or investors already in your network',
 businesses:'local business owners already in your network',
});
export function buildPlan({days=[],timeWindow='morning',circleType='homeowners'}={}){
 const selected=ALLOWED_DAYS.filter(day=>days.includes(day));
 const window=WINDOWS[timeWindow],circle=CIRCLES[circleType];
 if(!window||!circle)throw Error('unsupported_plan_choice');
 if(!selected.length)return 'Choose at least one day to sketch a schedule. No outreach is required.';
 const entries=selected.map(day=>day+': '+window+' | Optional conversations with '+circle+'.');
 return [
  'EPS PARTNER CIRCLE | PERSONAL WEEKLY OUTREACH IDEA',
  '',
  ...entries,
  '',
  'Ask permission before discussing services. Only share verified EPS materials after authorization.',
  'EPS handles quotes, service contracts, payments and job scheduling.',
  'No activity is assigned, recorded, submitted or compensated by this plan.',
 ].join('\n');
}
if(typeof document!=='undefined'){
 const button=document.getElementById('build-plan');
 const output=document.getElementById('schedule-output');
 const copy=document.getElementById('copy-plan');
 const copyStatus=document.getElementById('copy-status');
 let last='';
 if(button&&output&&copy){
  button.addEventListener('click',()=>{
   const days=[...document.querySelectorAll('.days input:checked')].map(x=>x.value);
   try{
    last=buildPlan({
     days,timeWindow:document.getElementById('time-window').value,
     circleType:document.getElementById('circle-type').value,
    });
    output.textContent=last;
    copy.disabled=days.length===0;
    copyStatus.textContent='';
   }catch{
    last='';output.textContent='Choose supported days and a time window.';
    copy.disabled=true;
   }
  });
  copy.addEventListener('click',async()=>{
   if(!last)return;
   try{
    await navigator.clipboard.writeText(last);
    copyStatus.textContent='Copied. No schedule was sent or saved by Evercraft.';
   }catch{
    copyStatus.textContent='Copy was unavailable. You can select the plan above and copy it manually.';
   }
  });
 }
}
