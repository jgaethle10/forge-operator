/* Evercraft Work Saban / Original Agent Costume Wardrobe v1.
 * Presentation-only, locally stored choices. Never mutates tasks, worker
 * receipts, the environment, agent memories, model prompts or credentials.
 * No external images, team logos, copyrighted mascot art or URLs.
 */
(function(root){
  'use strict';
  const KEY='evercraft.work-saban.costumes.v1';
  const ROLES=Object.freeze(['director','analyst','writer','designer','auditor','coordinator']);
  const PACKS=Object.freeze([
    Object.freeze({id:'classic',label:'Classic',description:'Original tiny office coworkers'}),
    Object.freeze({id:'dragons',label:'Dragons',description:'Original fantasy dragons'}),
    Object.freeze({id:'mascots',label:'Mascots',description:'Original team animal characters, not official logos'}),
    Object.freeze({id:'emoji',label:'Emoji',description:'Expressive emoji-style coworkers'}),
    Object.freeze({id:'tactical',label:'Tactical',description:'Fictional operations crew, no real insignia'})
  ]);
  const KNOWN=new Set(PACKS.map(p=>p.id));
  const ROLE_SET=new Set(ROLES);
  const SYMBOLS=Object.freeze({
    classic:Object.freeze(['','','','','','']),
    dragons:Object.freeze(['🐲','🐉','🐲','🐉','🐲','🐉']),
    mascots:Object.freeze(['🦅','🐺','🦊','🐯','🦉','🐻']),
    emoji:Object.freeze(['🧠','🔎','💬','🎨','🛡️','📦']),
    tactical:Object.freeze(['🎖️','🔭','📡','🧭','🛡️','🚁'])
  });
  const COLOR=Object.freeze({
    director:'#e5b377',analyst:'#79d3e0',writer:'#d1a2ec',
    designer:'#f3bc79',auditor:'#8fdec0',coordinator:'#9bb6ec'
  });
  const safePack=id=>KNOWN.has(id)?id:'classic';
  function safeStored(raw){
    if(typeof raw!=='string'||raw.length>2048)return null;
    try{
      const v=JSON.parse(raw);
      if(v?.schema!==1||!KNOWN.has(v.pack)||!v.overrides||
        typeof v.overrides!=='object'||Array.isArray(v.overrides))return null;
      const overrides={};
      for(const role of ROLES){
        if(KNOWN.has(v.overrides[role]))overrides[role]=v.overrides[role];
      }
      return {pack:v.pack,overrides};
    }catch{return null;}
  }
  function create({storage=null}={}){
    const saved=storage&&typeof storage.getItem==='function'
      ?(()=>{try{return safeStored(storage.getItem(KEY));}catch{return null;}})()
      :null;
    let pack=saved?.pack||'classic';
    let overrides=saved?.overrides||{};
    function persist(){
      if(!storage||typeof storage.setItem!=='function')return;
      try{storage.setItem(KEY,JSON.stringify({schema:1,pack,overrides}));}catch{}
    }
    function resolve(role){
      if(!ROLE_SET.has(role))throw Error('Unknown Work Saban costume role');
      const skin=overrides[role]||pack;
      const index=ROLES.indexOf(role);
      return Object.freeze({
        role,pack:skin,packLabel:PACKS.find(p=>p.id===skin).label,
        icon:SYMBOLS[skin][index],accent:COLOR[role],
        original:skin==='classic'
      });
    }
    function paint(node,role){
      const skin=resolve(role);
      if(!node||!node.dataset||typeof node.querySelector!=='function')
        throw Error('Costume needs an existing registered agent node');
      node.dataset.skin=skin.pack;
      node.style?.setProperty?.('--skin-accent',skin.accent);
      const glyph=node.querySelector('.spatial-costume-glyph');
      if(!glyph)throw Error('Costume glyph slot absent from agent figure');
      // Only textContent. Never interpolate an image URL or executable markup.
      glyph.textContent=skin.icon;
      glyph.setAttribute('aria-hidden','true');
      return skin;
    }
    function setPack(id){
      if(!KNOWN.has(id))throw Error('Unknown Work Saban costume pack');
      pack=id;overrides={};persist();
      return pack;
    }
    function cyclePack(){
      return setPack(PACKS[(PACKS.findIndex(p=>p.id===pack)+1)%PACKS.length].id);
    }
    function setRole(role,id){
      if(!ROLE_SET.has(role)||!KNOWN.has(id))throw Error('Unapproved role or costume');
      if(id===pack)delete overrides[role];
      else overrides[role]=id;
      persist();
      return resolve(role);
    }
    function cycleRole(role){
      if(!ROLE_SET.has(role))throw Error('Unknown Work Saban costume role');
      const current=resolve(role).pack;
      return setRole(role,PACKS[(PACKS.findIndex(p=>p.id===current)+1)%PACKS.length].id);
    }
    function snapshot(){
      return {schema:1,pack,overrides:{...overrides}};
    }
    return Object.freeze({
      resolve,paint,setPack,cyclePack,setRole,cycleRole,snapshot,
      getPack:()=>pack,getPackLabel:()=>PACKS.find(p=>p.id===pack).label
    });
  }
  root.EvercraftOfficeThemes=Object.freeze({create,PACKS,ROLES,STORAGE_KEY:KEY});
})(typeof window!=='undefined'?window:globalThis);
