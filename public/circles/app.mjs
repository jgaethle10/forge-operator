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
const field=id=>String($(id)?.value||'').trim().replace(/[\r\n]+/g,' ').slice(0,500);
form?.addEventListener('submit',event=>{
 event.preventDefault();
 if(!form.reportValidity()||!$('consent').checked)return;
 const messages={
  found:'Help found a Home Circle',join:'Join a professional Circle',
  mentor:'Help mentor a Circle',partner:'Explore a business partnership'
 };
 const intent=messages[field('interest')]||messages.found;
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
 const url='mailto:jessegaethle10@gmail.com?subject='+encodeURIComponent(subject)+
  '&body='+encodeURIComponent(lines.join('\n'));
 window.location.href=url;
 status.textContent='Your email app should open with a draft. Review it and press Send. No application was automatically transmitted or recorded.';
 status.dataset.state='email_draft';
});
