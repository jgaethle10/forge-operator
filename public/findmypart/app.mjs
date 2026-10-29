// FindMyPart no-friction first-party intake. No trackers, checkout, or account creation.
const form=document.querySelector('#part-request-form');
const status=document.querySelector('#part-request-status');
const submit=form?.querySelector('button[type="submit"]');
const backup=document.querySelector('.request-backup');
async function checkIntakeReadiness(){
 let ready=false;
 try{
  const response=await fetch('/api/findmypart/readiness',{
   method:'GET',credentials:'omit',redirect:'error',cache:'no-store',
   signal:AbortSignal.timeout(7000),
  });
  if(response.ok){
   const state=await response.json();
   ready=state?.schema==='evercraft.findmypart.intake-readiness.v1'&&state.intake_available===true;
  }
 }catch{}
 if(!ready&&form&&status){
  form.hidden=true;
  status.textContent='Online requests are temporarily unavailable. Use the email option below. Nothing has been charged.';
  status.dataset.state='unconfirmed';
  backup?.classList.add('request-backup-primary');
 }
}
if(form&&status&&submit){
 void checkIntakeReadiness();
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
