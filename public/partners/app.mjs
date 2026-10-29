// Evercraft Partners: no analytics, cookies, customer checkout or automatic mail.
// A received reference exists only after first-party private durable intake.
// The email fallback always requires an explicit human Send.
const form=document.querySelector('#partner-application');
const status=document.querySelector('#send-note');
const submit=form?.querySelector('button[type="submit"]');
const fallback=document.querySelector('.fallback');
const FABRIC='https://fabric.systemiacommandcenters.com';
const base=location.origin===FABRIC?'':FABRIC;
const API=base+'/api/partners';
let applicationReady=false;
let requestId=crypto.randomUUID();
const field=id=>String(document.getElementById(id)?.value||'').trim().replace(/[\r\n]+/g,' ');
function prepareEmail() {
 const lines=[
  'Hello Evercraft Partners,','',
  'I am interested in becoming a founding distribution partner.','',
  'Name: '+field('full-name'),
  'Email: '+field('email'),
  'Area: '+field('audience'),
  'Country / region: '+field('region'),
  'Website / profile: '+(field('website')||'Not provided'),'',
  'I consent to Evercraft using these details to review and respond to my inquiry.',
  'I understand this is not a partner agreement or compensation guarantee.','',
  'Please share next steps.'
 ];
 const url='mailto:jessegaethle10@gmail.com?subject='+
  encodeURIComponent('Evercraft Partners | Founding partner interest')+
  '&body='+encodeURIComponent(lines.join('\n'));
 window.location.href=url;
 status.textContent='Your email app should open. Press Send there to complete the application. No message was sent automatically.';
 status.dataset.state='email_draft';
}
function setReady(ready) {
 applicationReady=ready;
 if(submit){
  submit.disabled=false;
  submit.textContent=ready?'Submit my application securely':'Prepare my application email';
 }
 status.textContent=ready?
  'Secure applications are available. A confirmation reference will appear here only after your information is received.':
  'Secure intake is unavailable right now. You can still prepare an application email and press Send in your mail app.';
 status.dataset.state=ready?'available':'fallback';
 fallback?.classList.toggle('request-backup-primary',!ready);
}
async function checkReadiness(){
 try{
  const response=await fetch(API+'/readiness',{method:'GET',mode:'cors',
    credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(7000)});
  if(response.ok){
   const data=await response.json();
   return data.schema==='evercraft.partners.intake-readiness.v1'&&data.intake_available===true;
  }
 }catch{}
 return false;
}
if(form&&status&&submit){
 submit.disabled=true;
 status.textContent='Checking secure application availability…';
 void checkReadiness().then(setReady).catch(()=>setReady(false));
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!form.reportValidity())return;
  if(!document.getElementById('understand').checked)return;
  if(!applicationReady){prepareEmail();return}
  const payload={
   name:field('full-name'),email:field('email'),
   audience:field('audience'),region:field('region'),
   profile:field('website'),request_id:requestId,consent:true,
   website_honey:field('website-honey'),
  };
  submit.disabled=true;
  status.textContent='Submitting securely. Please keep this page open until a reference appears…';
  status.dataset.state='pending';
  try{
   const response=await fetch(API+'/inquiry',{
    method:'POST',mode:'cors',credentials:'omit',redirect:'error',
    headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(16000),
   });
   const data=await response.json();
   if(response.status===429){
    status.textContent='Too many submissions were attempted. Please retry later or contact us by email.';
    status.dataset.state='unconfirmed';return;
   }
   if(!response.ok||data.received!==true||!/^EVP-[A-F0-9]{24}$/.test(data.reference||''))
    throw Error('not_received');
   form.reset();
   form.hidden=true;
   requestId=crypto.randomUUID();
   status.textContent='Application received. Your reference is '+data.reference+'. We will review it before discussing any partnership terms. No payment or partner account was created.';
   status.dataset.state='received';
  }catch{
   status.textContent='We could not confirm that your application was received. Your details are still here. You can retry or choose the email alternative below. Do not assume it was submitted.';
   status.dataset.state='unconfirmed';
  }finally{if(!form.hidden)submit.disabled=false}
 });
}
