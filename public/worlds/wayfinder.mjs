import {buildWayfinderEntries} from './wayfinder-core.mjs';

// An opt-in, DOM-isolated navigation layer. No game input, saved scene, or personal data is transferred.
if(!document.querySelector('[data-evercraft-wayfinder]')){
 const host=document.createElement('div');
 host.dataset.evercraftWayfinder='v1';
 host.setAttribute('aria-label','Evercraft Worlds Wayfinder');
 const root=host.attachShadow({mode:'open'});
 const style=document.createElement('style');
 style.textContent=`
 :host{position:fixed;right:max(10px,env(safe-area-inset-right));bottom:calc(132px + env(safe-area-inset-bottom));z-index:9100;pointer-events:none;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#eaffff;max-width:calc(100vw - 20px)}
 button,a{font:inherit}button{cursor:pointer}
 .toggle{display:block;pointer-events:auto;margin-left:auto;padding:10px 14px;border:1px solid #c8ead08a;background:#092838ed;color:#fff4d6;border-radius:999px;box-shadow:0 5px 23px #010e1bbd;font-size:12px;font-weight:800;letter-spacing:.04em;touch-action:manipulation}
 .toggle:focus-visible,.panel a:focus-visible,.close:focus-visible{outline:3px solid #f2c58c;outline-offset:3px}
 .panel{pointer-events:auto;position:absolute;right:0;bottom:calc(100% + 10px);width:min(346px,calc(100vw - 24px));max-height:min(62dvh,560px);overflow-y:auto;overscroll-behavior:contain;border:1px solid #7fb9bc80;border-radius:15px;background:#061c2af2;box-shadow:0 15px 50px #000b;backdrop-filter:blur(17px);padding:15px}
 [hidden]{display:none!important}.head{display:flex;align-items:center;justify-content:space-between;gap:12px}.name{font-size:11px;font-weight:900;letter-spacing:.14em;color:#ffdaa6}.close{border:1px solid #ffffff51;background:#163a48;color:#fff;padding:4px 9px;border-radius:7px;font-size:18px;line-height:1.2}
 .subtitle{font-size:12px;color:#aecbd5;line-height:1.5;margin:12px 0}
 .next{border:1px solid #ebc78d9c;background:#664a2d55;display:grid;padding:13px;gap:5px;border-radius:9px;text-decoration:none;color:#fff;line-height:1.35}
 .next b{font-size:14px}.next span{font-size:10px;color:#f4d8ab;font-weight:800;letter-spacing:.12em}
 .index{font-size:10px;font-weight:900;letter-spacing:.1em;color:#a3d4d4;margin:16px 0 8px}
 .entries{display:grid;gap:5px}.entries a,.entries span{display:flex;justify-content:space-between;gap:10px;padding:9px 10px;color:#dceef2;border:1px solid #ffffff1d;border-radius:7px;text-decoration:none;font-size:12px;background:#0f2d3d}.entries a:hover{border-color:#f7ce9b}.entries span{opacity:.65}.entries small{color:#b1ced2;font-size:9px;text-transform:uppercase}
 .foot{font-size:10px;line-height:1.55;color:#a1bdc8;border-top:1px solid #ffffff26;margin-top:12px;padding-top:10px}.hub{display:block;font-size:11px;color:#ffdbab;margin-top:10px}
 @media(max-width:750px){:host{bottom:calc(168px + env(safe-area-inset-bottom))}.toggle{font-size:11px;padding:9px 12px}.panel{max-height:min(57dvh,480px)}}
 @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
 `;
 const toggle=document.createElement('button');toggle.type='button';toggle.className='toggle';toggle.textContent='✦ Worlds';toggle.setAttribute('aria-label','Open Evercraft Worlds Wayfinder');toggle.setAttribute('aria-expanded','false');
 const panel=document.createElement('nav');panel.className='panel';panel.hidden=true;panel.setAttribute('aria-label','Choose an Evercraft world');
 const head=document.createElement('div');head.className='head';
 const name=document.createElement('strong');name.className='name';name.textContent='EVERCRAFT WORLDS';
 const close=document.createElement('button');close.type='button';close.className='close';close.textContent='×';close.setAttribute('aria-label','Close Worlds Wayfinder');
 head.append(name,close);
 const subtitle=document.createElement('p');subtitle.className='subtitle';subtitle.textContent='Explore another destination without leaving the Evercraft universe.';
 const contents=document.createElement('div');
 const foot=document.createElement('p');foot.className='foot';foot.textContent='Worlds are separate experiences for now. Travel does not move your character, saves, or personal information.';
 const hub=document.createElement('a');hub.className='hub';hub.href='/worlds/gateway/';hub.textContent='See the full Worlds Gateway ↗';
 panel.append(head,subtitle,contents,foot,hub);root.append(style,panel,toggle);document.body.append(host);
 const hide=()=>{panel.hidden=true;toggle.setAttribute('aria-expanded','false')};
 const show=()=>{panel.hidden=false;toggle.setAttribute('aria-expanded','true');close.focus()};
 const line=(text,cls)=>{const el=document.createElement('div');el.className=cls;el.textContent=text;return el};
 let loaded=false;
 async function fill(){
  if(loaded)return;
  contents.replaceChildren(line('Connecting the Worlds directory…','subtitle'));
  try{
   const res=await fetch('/worlds/destinations.v1.json',{cache:'no-store',credentials:'same-origin'});
   if(!res.ok)throw Error('Worlds directory unavailable');
   const data=buildWayfinderEntries(await res.json(),location.pathname,location.hash);
   contents.replaceChildren();
   if(data.active)subtitle.textContent='Now exploring: '+data.active.name;
   if(data.recommended){
    const a=document.createElement('a');a.className='next';a.href=data.recommended.path;
    const kicker=line('SUGGESTED NEXT WORLD','');
    kicker.style.fontSize='10px';kicker.style.fontWeight='800';kicker.style.color='#f4d8ab';
    const title=document.createElement('b');title.textContent=data.recommended.name+' ↗';
    const label=line(data.description,'');label.style.fontSize='11px';
    a.append(kicker,title,label);contents.append(a);
   }
   contents.append(line('ALL DESTINATIONS','index'));
   const entries=document.createElement('div');entries.className='entries';
   for(const d of data.entries){
    const item=document.createElement(d.active?'span':'a');
    if(!d.active)item.href=d.path;
    const title=document.createElement('b');title.textContent=d.name;
    const category=document.createElement('small');category.textContent=d.active?'Here':d.category;
    item.append(title,category);entries.append(item);
   }
   contents.append(entries);loaded=true;
  }catch{
   contents.replaceChildren(line('The directory is not available here yet. You can still open the Worlds Gateway.','subtitle'));
  }
 }
 toggle.addEventListener('click',async()=>{if(!panel.hidden){hide();return}show();await fill()});
 close.addEventListener('click',()=>{hide();toggle.focus()});
 host.addEventListener('pointerdown',event=>event.stopPropagation());
 host.addEventListener('click',event=>event.stopPropagation());
 document.addEventListener('pointerdown',event=>{if(!panel.hidden&&!event.composedPath().includes(host))hide()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){hide();toggle.focus()}});
}
