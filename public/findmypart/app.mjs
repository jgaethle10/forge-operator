// FindMyPart no-friction first-party intake. No trackers, checkout, or account creation.
const form=document.querySelector('#part-request-form');
const status=document.querySelector('#part-request-status');
const submit=form?.querySelector('button[type="submit"]');
if(form&&status&&submit){
 form.addEventListener('submit',async(event)=>{
  event.preventDefault();
  if(!form.reportValidity())return;
  const values=new FormData(form);
  const payload={
   part_description:String(values.get('part_description')||'').trim(),
   equipment_context:String(values.get('equipment_context')||'').trim(),
   email:String(values.get('email')||'').trim(),
   consent:values.get('consent')==='yes',
   website:String(values.get('website')||''),
  };
  if(!payload.consent){status.textContent='Please confirm that we can use your details to reply about this part.';return}
  submit.disabled=true;
  status.textContent='Sending your part request securely…';
  try{
   const response=await fetch('/api/findmypart/inquiry',{
    method:'POST',headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify(payload),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000),
   });
   const result=await response.json();
   if(!response.ok||result?.received!==true||!/^FMP-[A-F0-9]{24}$/.test(result.reference||''))throw Error('not_confirmed_received');
   form.reset();
   form.hidden=true;
   status.textContent='Request received. Reference: '+result.reference+'. We’ll review your part details before discussing payment.';
   status.dataset.state='received';
  }catch{
   status.textContent='We could not confirm receipt. Nothing has been charged. You can retry or use the email option below.';
   status.dataset.state='unconfirmed';
   submit.disabled=false;
  }
 });
}
