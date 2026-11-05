// No network requests, local storage, analytics, cookies, checkout or hidden enrollment.
// Human-directed founding inquiry: a draft is NOT an acknowledged application.
const states=Object.freeze({
 roster:{
  title:'Your Home Circle',subtitle:'Illustrative roles, not real members',
  rows:[['Organizer · your professional network','PRIVATE'],['Electrician · invitation pending','ASK FIRST'],['Accountant · profile opt-in','CONSENT']],
  explain:'A private, member-chosen roster begins with an intentional Home Circle.'
 },
 intro:{
  title:'Permission-first introduction',subtitle:'Illustrative consent sequence',
  rows:[['You request an introduction','REQUESTED'],['The recipient considers the request','PENDING'],['Both parties choose whether to connect','OPT IN']],
  explain:'A request is not an endorsement. Contact information is never automatically shared.'
 },
 team:{
  title:'A shared opportunity',subtitle:'Illustrative team assembly',
  rows:[['A real need starts with a member','PROPOSE'],['Members choose their contribution','VOLUNTARY'],['A team forms only through acceptance','CONSENT']],
  explain:'Opportunity Circles assemble willing collaborators without promising work or revenue.'
 }
});
const $=id=>document.getElementById(id);
document.querySelectorAll('[data-mode]').forEach(button=>{
 button.addEventListener('click',()=>{
  const mode=button.dataset.mode;
  const state=states[mode];
  if(!state)return;
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  $('demo-title').textContent=state.title;
  $('demo-subtitle').textContent=state.subtitle;
  $('demo-explainer').textContent=state.explain;
  for(let i=0;i<3;i++){
   $('demo-row'+(i+1)).textContent=state.rows[i][0];
   $('demo-label'+(i+1)).textContent=state.rows[i][1];
  }
 });
});
const form=$('circles-interest');
const status=$('form-status');
const submit=form?.querySelector('button[type="submit"]');
const FABRIC='https://fabric.systemiacommandcenters.com';
const API=(location.origin===FABRIC?'':FABRIC)+'/api/circles';
let intakeReady=false;
let requestId=crypto.randomUUID();
const field=id=>String($(id)?.value||'').trim().replace(/[\r\n]+/g,' ').slice(0,500);
const intents={
 found:'Help found a Home Circle',join:'Join a professional Circle',
 mentor:'Help mentor a Circle',partner:'Explore a business partnership'
};
function draftEmail(){
 const intent=intents[field('interest')]||intents.found;
 const lines=[
  'Hello Evercraft Circles team,','',
  'I am interested in: '+intent,
  'Name: '+field('person'),
  'Email: '+field('email'),
  'City / region: '+field('city'),
  'Professional category: '+field('profession'),
  'What I hope to build: '+(field('message')||'Not specified'),'',
  'I agree to send this information to Evercraft for a human response.',
  'I understand this is not membership approval, a subscription, or a paid transaction.'
 ];
 const subject='Evercraft Circles | Founding interest | '+intent;
 window.location.href='mailto:jessegaethle10@gmail.com?subject='+encodeURIComponent(subject)+
  '&body='+encodeURIComponent(lines.join('\n'));
 status.textContent='Your email app should open with a draft. Review it and press Send. No application was automatically transmitted or recorded.';
 status.dataset.state='email_draft';
}
function setReady(ready){
 intakeReady=ready;
 if(submit){
  submit.disabled=false;
  submit.textContent=ready?'Submit founding interest securely':'Prepare my founding-interest email';
 }
 status.textContent=ready?
  'Secure owned intake is available. You will receive a confirmation reference only after your details are stored.':
  'Secure intake has not been verified here. You can prepare an email instead; you must press Send in your email app.';
 status.dataset.state=ready?'available':'fallback';
}
async function readiness(){
 try{
  const response=await fetch(API+'/readiness',{
   method:'GET',mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',
   signal:AbortSignal.timeout(7000)
  });
  if(!response.ok)return false;
  const body=await response.json();
  return body.schema==='evercraft.circles.founding-readiness.v1'&&
   body.intake_available===true&&body.membership_live===false;
 }catch{return false}
}
if(form&&status&&submit){
 submit.disabled=true;
 status.textContent='Checking our owned secure intake…';
 void readiness().then(setReady).catch(()=>setReady(false));
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!form.reportValidity()||!$('consent').checked)return;
  if(!intakeReady)return draftEmail();
  const data={
   name:field('person'),email:field('email'),region:field('city'),
   profession:field('profession'),interest:field('interest'),
   note:field('message'),consent:true,request_id:requestId
  };
  submit.disabled=true;
  status.textContent='Submitting securely. A reference is required before we can say it was received.';
  status.dataset.state='pending';
  try{
   const response=await fetch(API+'/inquiry',{
    method:'POST',mode:'cors',credentials:'omit',redirect:'error',
    headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify(data),signal:AbortSignal.timeout(16000)
   });
   const body=await response.json().catch(()=>({}));
   if(response.status===429){
    status.textContent='Submission limit reached. Please try later or use the email alternative.';
    status.dataset.state='rate_limited';return;
   }
   if(!response.ok||body.received!==true||!/^EVC-[A-F0-9]{24}$/.test(body.reference||'')){
    throw Error('receipt_unverified');
   }
   form.reset();form.hidden=true;
   requestId=crypto.randomUUID();
   status.textContent='Founding interest received: '+body.reference+'. Evercraft will review it. No membership, invitation, or payment was created.';
   status.dataset.state='received';
  }catch{
   status.textContent='We could not verify receipt. Your details remain here. You can retry this submission, or choose the email alternative by refreshing the page. Do not assume it was submitted.';
   status.dataset.state='unconfirmed';
  }finally{if(!form.hidden)submit.disabled=false}
 });
}
