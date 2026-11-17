// Only this optional lead form uses the owned API. The packet/PDF and photos remain browser-local.
const form=document.getElementById('closeoutInquiryForm');
const status=document.getElementById('closeoutInquiryStatus');
const sendButton=document.getElementById('closeoutInquirySend');
const readinessUrl='https://fabric.systemiacommandcenters.com/api/closeout/readiness';
const submitUrl='https://fabric.systemiacommandcenters.com/api/closeout/inquiry';
const validEmail=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
let ownedReady=false;

function show(message){status.textContent=message;}
function setReady(ready){
  ownedReady=ready===true;
  sendButton.textContent=ownedReady?'Submit private request':'Open email request';
  const mode=document.getElementById('closeoutInquiryMode');
  mode.textContent=ownedReady
    ?'Secure owned inquiry is available. No payment will be taken.'
    :'The owned request service is not confirmed available. You can open an email draft instead. Nothing sends automatically.';
}

async function checkReadiness(){
  try{
    const response=await fetch(readinessUrl,{method:'GET',mode:'cors',cache:'no-store',
      credentials:'omit',signal:AbortSignal.timeout(4500),headers:{accept:'application/json'}});
    if(!response.ok)throw new Error('unavailable');
    const data=await response.json();
    setReady(data?.intake_available===true && data?.notification_ready===true);
  }catch{
    setReady(false);
  }
}

function fields(){
  return {
    name:form.elements.namedItem('name').value.trim().slice(0,100),
    email:form.elements.namedItem('email').value.trim().slice(0,200),
    company:form.elements.namedItem('company').value.trim().slice(0,160),
    job_type:form.elements.namedItem('job_type').value,
    note:form.elements.namedItem('note').value.trim().slice(0,450),
    company_website_honey:form.elements.namedItem('company_website_honey').value,
    consent:form.elements.namedItem('consent').checked
  };
}

function openEmailDraft(details){
  const subject='Evercraft Closeout | $49 founding pilot request';
  const body=[
    'Hello Evercraft,',
    '',
    'I would like to discuss the $49 one-job Closeout pilot.',
    'Contact: '+details.name,
    'Email: '+details.email,
    'Business: '+details.company,
    'Project category: '+details.job_type,
    'Brief scope (no client private details): '+details.note,
    '',
    'Please confirm scope, secure intake, capacity, price, and delivery before any payment.',
    'No order or payment has been created by this draft.'
  ].join('\n');
  const url='mailto:jessegaethle10@gmail.com?subject='+encodeURIComponent(subject)+
    '&body='+encodeURIComponent(body);
  show('Your email app should open with a draft. Review and send it yourself. No request is recorded until you send.');
  window.location.assign(url);
}

form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!form.reportValidity())return;
  const details=fields();
  if(!validEmail.test(details.email)||details.note.length<10||!details.consent){
    show('Check your email, describe the job type briefly, and provide consent.');
    return;
  }
  if(!ownedReady){openEmailDraft(details);return;}
  sendButton.disabled=true;
  show('Submitting a scope inquiry. No payment or work order is created.');
  try{
    const response=await fetch(submitUrl,{
      method:'POST',mode:'cors',credentials:'omit',cache:'no-store',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify(details),signal:AbortSignal.timeout(12000)
    });
    const data=await response.json();
    if(response.status===201&&data?.received===true&&/^EC-CLOSEOUT-[A-F0-9]{20}$/.test(data.reference||'')){
      show('Request recorded: '+data.reference+'. Save this reference. Evercraft will review the scope. No payment or booking was made.');
      form.reset();
      return;
    }
    if(response.status===429){
      show('Too many requests from this address. Use the email option or try again later.');
    }else{
      show('The private request was not confirmed. No payment was taken. Please use the email option if you need a reply.');
    }
  }catch{
    show('Unable to confirm receipt. No payment was taken. The request might have reached the server; do not resubmit repeatedly. You can contact Evercraft by email.');
  }finally{
    sendButton.disabled=false;
  }
});

const emailFallback=document.getElementById('closeoutInquiryEmailFallback');
emailFallback.addEventListener('click',event=>{
  event.preventDefault();
  if(!form.reportValidity())return;
  openEmailDraft(fields());
});
setReady(false);
void checkReadiness();
