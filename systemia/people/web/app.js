const root=document.getElementById('app');
const path=window.location.pathname;
const esc=(v)=>String(v??'').replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const api=async(url,options={})=>{
  const response=await fetch(url,{cache:'no-store',...options,headers:{'content-type':'application/json',...(options.headers||{})}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||body?.ok===false)throw new Error(body?.error||'Request failed');
  return body;
};
const button=(label,cls='btn',attrs='')=>`<button class="${cls}" ${attrs}>${esc(label)}</button>`;

function errorBox(error){return error?`<div class="error">${esc(error)}</div>`:''}

async function consentPortal(){
  const token=new URLSearchParams(location.search).get('token')||'';
  root.innerHTML=`<main class="shell centered"><section class="card narrow stack"><div class="kicker">EVERCRAFT PEOPLE LAYER · OWNED RUNTIME</div><h1>Opening private invitation…</h1></section></main>`;
  try{
    const data=await api('/api/people/consent/inspect?token='+encodeURIComponent(token));
    root.innerHTML=`
      <main class="shell centered"><section class="card narrow stack">
        <div class="kicker">EVERCRAFT PEOPLE LAYER · OWNED RUNTIME</div>
        <h1>${esc(data.brain.display_name)}, this brain belongs to you.</h1>
        <p>This portable intelligence layer belongs to the person, not a team, sponsor, employer, agent, or software platform.</p>
        <div class="stats">
          <div class="stat"><span>Ownership</span><strong>Person sovereign</strong></div>
          <div class="stat"><span>Portability</span><strong>${esc(data.brain.portability_state)}</strong></div>
          <div class="stat"><span>Assurance</span><strong>${esc(data.brain.identity_assurance)}</strong></div>
        </div>
        <div class="stack">${(data.promises||[]).map(x=>`<div class="promise">✓ ${esc(x)}</div>`).join('')}</div>
        <label class="check"><input id="own" type="checkbox"> <span>I understand this brain is intended to remain mine and portable.</span></label>
        <label class="check"><input id="scopes" type="checkbox"> <span>I consent to the requested scopes: ${esc((data.invite.scopes||[]).join(', '))}.</span></label>
        <input id="confirm" class="input" placeholder='Type "I ACCEPT"' autocomplete="off">
        <button id="accept" class="btn">Accept and create my consent receipt</button>
        <div id="result"></div>
        <div class="footer-note">Policy ${esc(data.invite.policy_version)} · expires ${esc(new Date(data.invite.expires_at).toLocaleString())}</div>
      </section></main>`;
    document.getElementById('accept').onclick=async()=>{
      const result=document.getElementById('result');
      try{
        const body=await api('/api/people/consent/accept',{method:'POST',body:JSON.stringify({
          token,
          accept_ownership:document.getElementById('own').checked,
          accept_scopes:document.getElementById('scopes').checked,
          confirmation_text:document.getElementById('confirm').value,
        })});
        result.className='success';
        result.textContent='Consent receipt created. Current assurance: '+body.brain.identity_assurance+'.';
      }catch(error){result.className='error';result.textContent=error.message}
    };
  }catch(error){
    root.innerHTML=`<main class="shell centered"><section class="card narrow stack"><div class="kicker">EVERCRAFT PEOPLE LAYER</div><h1>Invitation unavailable.</h1>${errorBox(error.message)}</section></main>`;
  }
}

async function verifyPortal(){
  const token=new URLSearchParams(location.search).get('token')||'';
  root.innerHTML=`<main class="shell centered"><section class="card narrow stack"><div class="kicker">EVERCRAFT PEOPLE LAYER · EMAIL IDENTITY</div><h1>Opening verification…</h1></section></main>`;
  try{
    const data=await api('/api/people/verify-email/inspect?token='+encodeURIComponent(token));
    root.innerHTML=`
      <main class="shell centered"><section class="card narrow stack">
        <div class="kicker">EVERCRAFT PEOPLE LAYER · EMAIL IDENTITY</div>
        <h1>${data.already_verified?'Email ownership verified.':esc(data.person.display_name)+', prove this mailbox is yours.'}</h1>
        <p>Challenge destination: <strong>${esc(data.email_hint)}</strong>. Successful redemption upgrades this brain to <code>verified_email</code> without creating a Systemia operator account.</p>
        ${data.already_verified?'<div class="success">This challenge has already been redeemed.</div>':`
          <input id="confirm" class="input" placeholder='Type "VERIFY MY EMAIL"' autocomplete="off">
          <button id="verify" class="btn">Verify my email</button>
          <div id="result"></div>
        `}
        <div class="footer-note">Expires ${esc(new Date(data.expires_at).toLocaleString())}</div>
      </section></main>`;
    if(!data.already_verified){
      document.getElementById('verify').onclick=async()=>{
        const result=document.getElementById('result');
        try{
          const body=await api('/api/people/verify-email/verify',{method:'POST',body:JSON.stringify({token,confirmation_text:document.getElementById('confirm').value})});
          result.className='success';
          result.textContent='Email ownership verified. Current assurance: '+body.brain.identity_assurance+'.';
        }catch(error){result.className='error';result.textContent=error.message}
      };
    }
  }catch(error){
    root.innerHTML=`<main class="shell centered"><section class="card narrow stack"><div class="kicker">EVERCRAFT PEOPLE LAYER</div><h1>Verification unavailable.</h1>${errorBox(error.message)}</section></main>`;
  }
}

function tokenGate(){
  root.innerHTML=`
    <main class="shell centered"><section class="card narrow stack">
      <div class="kicker">SYSTEMIA · PEOPLE LAYER</div>
      <h1>Owned runtime access</h1>
      <p>This is the private operator cockpit running on Forge/Systemia. The admin token stays in this browser session only.</p>
      <input id="admin-token" class="input" type="password" placeholder="People admin token" autocomplete="off">
      <button id="unlock" class="btn">Unlock cockpit</button>
    </section></main>`;
  document.getElementById('unlock').onclick=()=>{
    const token=document.getElementById('admin-token').value.trim();
    if(token){sessionStorage.setItem('evercraft_people_admin_token',token);operatorPortal()}
  };
}

async function operatorPortal(){
  const token=sessionStorage.getItem('evercraft_people_admin_token')||'';
  if(!token)return tokenGate();
  root.innerHTML=`<main class="shell"><div class="card">Loading owned People Layer…</div></main>`;
  try{
    const data=await api('/api/people/brains',{headers:{authorization:'Bearer '+token}});
    const brains=data.brains||[];
    let selected=brains[0]||null;

    function render(){
      root.innerHTML=`
        <main class="shell">
          <header class="head">
            <div><div class="kicker">EVERCRAFT · SYSTEMIA · OWNED RUNTIME</div><h1>People Layer</h1><p>Portable intelligence belongs to the person. Relationships receive explicit scopes, never ownership by proximity.</p></div>
            <div class="badges"><span class="badge good">Forge owned</span><span class="badge">Base44 hot path: none</span><button id="lock" class="btn quiet">Lock</button></div>
          </header>
          <section class="layout">
            <aside class="stack">
              <div class="card"><div class="title">Brains</div><div class="list">
                ${brains.length?brains.map(b=>`<button class="brain ${selected?.brain_key===b.brain_key?'active':''}" data-brain="${esc(b.brain_key)}"><strong>${esc(b.display_name)}</strong><span>${esc(b.person_type)} · ${esc(b.sport_or_domain||'domain open')}</span><small>${esc(b.consent_state)} · ${esc(b.identity_assurance)}</small></button>`).join(''):'<div class="muted">No owned People brains yet.</div>'}
              </div></div>
              <form id="create-brain" class="card stack">
                <div class="title">Provision pilot brain</div>
                <input name="display_name" class="input" placeholder="Person name" required>
                <div class="two"><select name="person_type" class="input">${['athlete','creator','superfan','coach','staff','other'].map(x=>`<option>${x}</option>`).join('')}</select><input name="sport_or_domain" class="input" placeholder="Sport / domain"></div>
                <input name="anchor_organization" class="input" placeholder="Current team / community">
                <textarea name="goals" class="input" rows="4" placeholder="Goals, one per line"></textarea>
                <button class="btn">Create owned brain</button>
              </form>
            </aside>
            <section id="detail" class="stack">${selected?detail(selected):'<div class="card muted">Create a brain to open the cockpit.</div>'}</section>
          </section>
        </main>`;
      bind();
    }

    function detail(b){
      return `
        <div class="card">
          <div class="profile"><div><div class="badges"><span class="badge">${esc(b.person_type)}</span><span class="badge good">${esc(b.ownership_model)}</span><span class="badge">${esc(b.portability_state)}</span></div><h2>${esc(b.display_name)}</h2><p>${esc(b.sport_or_domain||'Domain open')}${b.anchor_organization?' · '+esc(b.anchor_organization):''}</p></div><div class="status"><span>Consent</span><strong>${esc(b.consent_state)}</strong><small>${esc(b.identity_assurance)}</small></div></div>
          <div class="principles"><article><strong>Person sovereign</strong><p>The brain follows the person across organizations and career stages.</p></article><article><strong>Scoped access</strong><p>No relationship inherits blanket access.</p></article><article><strong>Discovery ≠ authority</strong><p>Opportunity discovery cannot silently send, book, charge, or disclose.</p></article></div>
        </div>
        <div class="card stack">
          <div class="title">Ownership controls</div>
          <div class="actions"><button id="invite" class="btn">Create 48-hour consent invite</button><button id="export" class="btn quiet">Export brain</button><button id="delete-request" class="btn danger">Request deletion</button></div>
          <div id="invite-result"></div>
          <div class="divider"></div>
          <div class="title">Verified email identity</div>
          <p class="muted">Raw email is hashed and discarded from People state. Verification remains separate from Systemia operator identity.</p>
          <div class="linkbox"><input id="email" class="input" type="email" placeholder="Pilot email address"><button id="email-challenge" class="btn quiet" ${b.consent_state!=='consented'?'disabled':''}>Create 30-minute verification</button></div>
          <div id="email-result"></div>
        </div>`;
    }

    async function reload(){
      const fresh=await api('/api/people/brains',{headers:{authorization:'Bearer '+token}});
      brains.splice(0,brains.length,...(fresh.brains||[]));
      selected=brains.find(x=>x.brain_key===selected?.brain_key)||brains[0]||null;
      render();
    }

    function bind(){
      document.getElementById('lock').onclick=()=>{sessionStorage.removeItem('evercraft_people_admin_token');tokenGate()};
      document.querySelectorAll('[data-brain]').forEach(el=>el.onclick=()=>{selected=brains.find(x=>x.brain_key===el.dataset.brain)||selected;render()});
      document.getElementById('create-brain').onsubmit=async(event)=>{
        event.preventDefault();
        const fd=new FormData(event.currentTarget);
        try{
          const body=await api('/api/people/brains',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({
            display_name:fd.get('display_name'),person_type:fd.get('person_type'),sport_or_domain:fd.get('sport_or_domain'),anchor_organization:fd.get('anchor_organization'),goals:String(fd.get('goals')||'').split('\n').map(x=>x.trim()).filter(Boolean)
          })});
          selected=body.brain;
          await reload();
        }catch(error){alert(error.message)}
      };
      if(!selected)return;
      document.getElementById('invite').onclick=async()=>{
        const out=document.getElementById('invite-result');
        try{
          const body=await api('/api/people/brains/'+encodeURIComponent(selected.brain_key)+'/invite',{method:'POST',headers:{authorization:'Bearer '+token},body:'{}'});
          const url=location.origin+body.invite.consent_path;
          out.innerHTML=`<div class="linkbox"><input class="input" value="${esc(url)}" readonly><button class="btn quiet" id="copy-invite">Copy</button></div>`;
          document.getElementById('copy-invite').onclick=()=>navigator.clipboard?.writeText(url);
          await reload();
        }catch(error){out.innerHTML=errorBox(error.message)}
      };
      document.getElementById('export').onclick=async()=>{
        try{
          const body=await api('/api/people/brains/'+encodeURIComponent(selected.brain_key)+'/export',{headers:{authorization:'Bearer '+token}});
          const blob=new Blob([JSON.stringify(body.export.package,null,2)],{type:'application/json'});
          const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download=selected.brain_key+'.json';a.click();URL.revokeObjectURL(href);
        }catch(error){alert(error.message)}
      };
      document.getElementById('delete-request').onclick=async()=>{
        try{
          const body=await api('/api/people/brains/'+encodeURIComponent(selected.brain_key)+'/delete-request',{method:'POST',headers:{authorization:'Bearer '+token},body:'{}'});
          alert('Delete request state: '+body.request.status+'. Final destruction still requires exact owner confirmation.');
          await reload();
        }catch(error){alert(error.message)}
      };
      document.getElementById('email-challenge').onclick=async()=>{
        const out=document.getElementById('email-result');
        try{
          const body=await api('/api/people/brains/'+encodeURIComponent(selected.brain_key)+'/email-challenge',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({email:document.getElementById('email').value})});
          const url=location.origin+body.challenge.verification_path;
          out.innerHTML=`<div class="linkbox"><input class="input" value="${esc(url)}" readonly><button class="btn quiet" id="copy-verify">Copy</button></div>`;
          document.getElementById('copy-verify').onclick=()=>navigator.clipboard?.writeText(url);
        }catch(error){out.innerHTML=errorBox(error.message)}
      };
    }
    render();
  }catch(error){
    if(/unauthorized/i.test(error.message)){sessionStorage.removeItem('evercraft_people_admin_token');tokenGate();return}
    root.innerHTML=`<main class="shell centered"><section class="card narrow stack"><h1>People Layer unavailable.</h1>${errorBox(error.message)}</section></main>`;
  }
}

if(path.startsWith('/people/consent'))consentPortal();
else if(path.startsWith('/people/verify-email'))verifyPortal();
else operatorPortal();
