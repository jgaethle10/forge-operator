/* No endpoint credentials, no private data, no guesswork about merged branches. */
const link=document.getElementById('readinessLink');
const status=document.getElementById('readinessStatus');

async function checkReadiness(){
 try{
  const response=await fetch('../readiness/index.html',{
   method:'GET',cache:'no-store',credentials:'same-origin',
   headers:{'Accept':'text/html'}
  });
  const type=response.headers.get('content-type')||'';
  if(!response.ok||!type.includes('text/html'))throw Error('not_on_this_release');
  const documentText=await response.text();
  if(!documentText.includes('SOURCE-ONLY PLANNING PREVIEW')||
     !documentText.includes('NOT LIVE STATUS')||
     !documentText.includes('REIGNITE / EVERCRAFT EVENTS')||
     !documentText.includes('noindex,nofollow,noarchive'))
    throw Error('readiness_identity_not_verified');
  link.removeAttribute('aria-disabled');
  link.removeAttribute('tabindex');
  link.textContent='View next five planning priorities';
  status.textContent='Source-only readiness preview is available. It is not a live approval or permit dashboard.';
 }catch{
  link.setAttribute('aria-disabled','true');
  link.setAttribute('tabindex','-1');
  link.textContent='Readiness preview not yet on this release';
  status.textContent='The Events safety view is still on its separate review branch. Nothing is missing from your account; the two source branches have not been released together.';
 }
}
checkReadiness();
