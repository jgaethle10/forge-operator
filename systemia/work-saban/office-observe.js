/* Work Saban Observer Mode: a local-only presentation layer over existing office.
 * No agent scheduling, synthetic events, external calls or payment actions.
 */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const entry=$('office-visit-open');
  const exit=$('office-visit-close');
  const inspector=$('office-inspector-jump');
  const returnCamera=$('office-camera-return');
  const details=$('office-details');
  const office=$('office');
  const viewport=$('office-scene');
  const panel=office?.querySelector('.office-inspector');
  if(!entry||!exit||!inspector||!returnCamera||!details||!office||!viewport||!panel)return;
  let active=false;
  let prior=null;
  const interactiveSelector='button:not(:disabled):not([hidden]),[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])';
  function focusables(){
    return [...office.querySelectorAll(interactiveSelector)].filter(el=>{
      const style=getComputedStyle(el);
      return style.display!=='none'&&style.visibility!=='hidden'&&el.getClientRects().length>0;
    });
  }
  function setScreenLock(locked){
    document.documentElement.classList.toggle('office-observe-open',locked);
    document.body.classList.toggle('office-observe-open',locked);
  }
  function enter(){
    if(active)return;
    active=true;
    prior={
      details:details.open,
      threeD:$('office-3d-toggle')?.getAttribute('aria-pressed')==='true',
      focus:document.activeElement
    };
    details.open=true;
    setScreenLock(true);
    office.setAttribute('role','dialog');
    office.setAttribute('aria-modal','true');
    office.setAttribute('aria-label','Work Saban office observation');
    entry.setAttribute('aria-expanded','true');
    exit.hidden=false;
    inspector.hidden=false;
    returnCamera.hidden=false;
    office.scrollTop=0;
    exit.focus({preventScroll:true});
    Promise.resolve(window.WorkSabanOffice?.ready).then(()=>{
      if(!active)return;
      window.WorkSaban3D?.setEnabled(true);
      viewport.classList.add('has-spatial-view');
      office.scrollTop=0;
    }).catch(()=>{
      // The existing office failure UI remains authoritative; never fake a scene.
      if(active)$('office-mode').textContent='PREVIEW UNAVAILABLE';
    });
  }
  function leave(){
    if(!active)return;
    active=false;
    setScreenLock(false);
    office.removeAttribute('role');
    office.removeAttribute('aria-modal');
    office.setAttribute('aria-label','Work Saban local visual office');
    entry.setAttribute('aria-expanded','false');
    exit.hidden=true;
    inspector.hidden=true;
    returnCamera.hidden=true;
    if(prior){
      details.open=prior.details;
      // Restore the viewer's previous 2D/3D choice on exit.
      window.WorkSaban3D?.setEnabled(prior.threeD);
      viewport.classList.toggle('has-spatial-view',prior.threeD);
    }
    const restore=prior?.focus?.isConnected?prior.focus:entry;
    prior=null;
    restore.focus({preventScroll:true});
  }
  entry.addEventListener('click',enter);
  exit.addEventListener('click',leave);
  inspector.addEventListener('click',()=>{
    if(!active)return;
    panel.scrollIntoView({block:'start',behavior:'auto'});
    const name=$('office-agent-name');
    name.setAttribute('tabindex','-1');
    name.focus({preventScroll:true});
  });
  returnCamera.addEventListener('click',()=>{
    if(!active)return;
    viewport.scrollIntoView({block:'start',behavior:'auto'});
    $('spatial-viewport')?.focus({preventScroll:true});
  });
  document.addEventListener('keydown',event=>{
    if(!active)return;
    if(event.key==='Escape'){
      event.preventDefault();
      leave();
      return;
    }
    if(event.key!=='Tab')return;
    const items=focusables();
    if(!items.length){event.preventDefault();exit.focus();return;}
    const first=items[0],last=items[items.length-1];
    if(event.shiftKey&&(document.activeElement===first||!office.contains(document.activeElement))){
      event.preventDefault();last.focus();
    }else if(!event.shiftKey&&(document.activeElement===last||!office.contains(document.activeElement))){
      event.preventDefault();first.focus();
    }
  });
  window.WorkSabanObserver={enter,leave,isOpen:()=>active};
})();
