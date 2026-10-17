function escapeHtml(value=''){
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function resultCards(matches=[]){
  if(!matches.length){
    return '<div class="empty">Describe a real problem above and Fabric will find the smallest relevant Evercraft capability.</div>';
  }
  return matches.map((item)=>`
    <article class="result">
      <div class="result-top">
        <h2>${escapeHtml(item.name)}</h2>
        <span>${escapeHtml(item.commercial_state||item.state||'available')}</span>
      </div>
      <p>${escapeHtml(item.description)}</p>
      ${item.pricing?`<p class="pricing">${escapeHtml(item.pricing)}</p>`:''}
      <a href="/capabilities/${encodeURIComponent(item.public_id)}">Open capability →</a>
    </article>`
  ).join('');
}

// The public-facing product name is deliberately provisional during beta.
export const companionBetaIdentity=Object.freeze({
  workingTitle:'Visual Companion',
  stage:'beta',
  namingStatus:'working-title',
});
const companionForms=Object.freeze([
  {id:'orbit',label:'Orbit'},
  {id:'ember',label:'Ember'},
  {id:'canopy',label:'Canopy'},
]);
export function normalizeCompanionForm(value){
  const candidate=String(value||'').toLowerCase().slice(0,24);
  return companionForms.some(item=>item.id===candidate)?candidate:'orbit';
}

export function renderFabricMobileApp({
  query='',
  matches=[],
  capabilityCount=0,
  error='',
  proof=null,
  form='orbit',
}={}){
  const safeQuery=escapeHtml(query);
  const activeForm=normalizeCompanionForm(form);
  const formChoices=companionForms.map(item=>`<a class="companion-form-choice" href="/mobile?form=${item.id}" ${item.id===activeForm?'aria-current="page"':''}>${item.label}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#07101f">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Evercraft">
<link rel="manifest" href="/mobile/manifest.webmanifest">
<link rel="apple-touch-icon" href="/assets/evercraft-icon.png">
<link rel="icon" href="/assets/evercraft-icon.png">
<title>Evercraft Mobile</title>
<style>
:root{color-scheme:dark;--bg:#050914;--panel:#0c1629;--line:#203250;--text:#f7f9fc;--muted:#9fb0c8;--accent:#5fb0ff;--green:#72e7b4}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:radial-gradient(circle at 90% 0%,rgba(28,108,255,.24),transparent 28rem),var(--bg);padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
main{width:min(720px,calc(100% - 28px));margin:0 auto;padding:24px 0 48px}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;font-weight:800;font-size:18px}
.brand img{width:42px;height:42px;border-radius:12px}
.status{display:flex;align-items:center;gap:8px;margin:40px 0 12px;color:#c8d7ea;font-size:13px}.dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 15px rgba(114,231,180,.8)}
h1{font-size:clamp(42px,12vw,68px);letter-spacing:-.06em;line-height:.94;margin:12px 0 18px}
.lede{font-size:18px;line-height:1.55;color:#c6d3e4;margin:0 0 28px}
form{border:1px solid var(--line);background:rgba(12,22,41,.88);border-radius:20px;padding:14px;box-shadow:0 18px 50px rgba(0,0,0,.2)}
textarea{width:100%;min-height:118px;resize:vertical;border:0;outline:0;background:transparent;color:var(--text);font:inherit;font-size:17px;line-height:1.45;padding:8px}
textarea::placeholder{color:#7386a4}
button{width:100%;border:0;border-radius:13px;padding:14px 16px;font:inherit;font-weight:800;color:white;background:linear-gradient(135deg,#1c6cff,#5fb0ff);margin-top:8px}
.meta{display:flex;justify-content:space-between;gap:12px;margin:12px 2px 32px;color:var(--muted);font-size:12px}
.error{border:1px solid #69343a;background:#2a1116;border-radius:14px;padding:14px;margin:18px 0}
.results{display:grid;gap:12px}
.result,.empty{border:1px solid var(--line);background:rgba(12,22,41,.82);border-radius:18px;padding:18px}
.result-top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.result h2{font-size:19px;margin:0}.result-top span{font-size:11px;border:1px solid #2d4a70;border-radius:999px;padding:5px 8px;color:#bcd5f8}
.result p{color:var(--muted);line-height:1.55}.result .pricing{color:var(--text);font-weight:700}.result a{display:inline-block;margin-top:4px;color:#9ec8ff;text-decoration:none;font-weight:700}
.install{margin-top:34px;padding:18px;border:1px solid var(--line);border-radius:18px;background:rgba(8,15,28,.68)}.install h2{font-size:18px;margin:0 0 8px}.install p{color:var(--muted);line-height:1.55;margin:0}
nav{display:flex;justify-content:space-between;align-items:center}.navlink{color:var(--muted);text-decoration:none;font-size:13px}
footer{margin-top:40px;color:#71839e;font-size:12px;text-align:center}


.companion-chooser{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:13px 0 19px}
.companion-chooser .chooser-copy{font-size:12px;color:#aec2db;line-height:1.4;flex:1 1 220px}
nav.companion-forms{display:flex;gap:6px}
.companion-form-choice{text-decoration:none;color:#bed3ec;font-size:12px;font-weight:700;padding:10px 14px;border:1px solid #345271;background:#101f38;border-radius:12px}
.companion-form-choice[aria-current=page]{color:#ffffff;border-color:#9dd8f2;background:#1a426b}
.presence[data-form=ember]{background:radial-gradient(ellipse at 75% 35%,rgba(255,127,65,.34),transparent 42%),linear-gradient(140deg,#342017,#130d17 70%);border-color:#674730}
.presence[data-form=ember] .presence-core{background:radial-gradient(circle at 32% 22%,#fffce6 0%,#ffdc8f 13%,#ff854d 42%,#ae2859 70%,#250a24 100%);box-shadow:0 0 18px #ffbb65,0 0 70px #ee824d8c}
.presence[data-form=ember] .presence-orbit{border-color:#ffbd7b66}
.presence[data-form=ember] .presence h1 span{color:#ffd39d}
.presence[data-form=canopy]{background:radial-gradient(ellipse at 75% 35%,rgba(43,229,183,.30),transparent 42%),linear-gradient(140deg,#113531,#0a161d 70%);border-color:#316f61}
.presence[data-form=canopy] .presence-core{background:radial-gradient(circle at 32% 22%,#e0fff6 0%,#9bffe8 13%,#22cba9 42%,#15767a 70%,#08202e 100%);box-shadow:0 0 18px #6affd1,0 0 70px #2ac9b58c}
.presence[data-form=canopy] .presence-orbit{border-color:#67eedc66}
.presence[data-form=canopy] .presence h1 span{color:#9bffe8}
/* Presence is deliberately CSS-only until a consented persona/agent runtime exists. */
.presence{position:relative;isolation:isolate;overflow:hidden;display:grid;align-items:center;grid-template-columns:minmax(0,1.16fr) minmax(0,.84fr);gap:12px;margin:32px 0 30px;padding:30px;border-radius:28px;border:1px solid #28466b;background:radial-gradient(ellipse at 75% 35%,rgba(63,84,246,.34),transparent 42%),linear-gradient(140deg,#101e38,#07101f 70%);box-shadow:0 30px 90px #0008, inset 0 1px rgba(235,246,255,.14)}
.presence::before{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(116,158,207,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(116,158,207,.035) 1px,transparent 1px);background-size:30px 30px;mask-image:linear-gradient(90deg,transparent,#000)}
.presence-copy,.presence-visual{position:relative;z-index:1}
.presence-tag{display:inline-flex;align-items:center;gap:7px;border:1px solid #426a9b;padding:6px 10px;border-radius:99px;font-weight:750;color:#9ed5ff;font-size:10px;letter-spacing:.12em;text-transform:uppercase;background:#142c50b0}
.presence-tag::before{content:"";width:6px;height:6px;border-radius:50%;background:#72e7b4}
.presence h1{font-size:clamp(35px,6.3vw,61px);line-height:.99;letter-spacing:-.065em;margin:20px 0 14px}
.presence h1 span{color:#91cdff}
.presence p{max-width:38ch;color:#c5d3e9;line-height:1.6;font-size:15px}
.presence-facts{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}
.presence-facts span{border:1px solid #385172;background:#0d203b;padding:7px 10px;border-radius:9px;font-size:11px;color:#c9dffb}
.presence-visual{min-height:305px;display:grid;place-items:center;filter:drop-shadow(0 0 24px #2b74ee55)}
.presence-orbit{position:absolute;width:280px;height:280px;border-radius:50%;border:1px solid #5ac7ff55;box-shadow:0 0 38px #2879fb22,inset 0 0 38px #2879fb1b;animation:presence-spin 22s linear infinite}
.presence-orbit::before,.presence-orbit::after{content:"";position:absolute;border-radius:50%;border:1px solid #91a8ff77;inset:24px 0;transform:rotate(58deg)}
.presence-orbit::after{transform:rotate(-58deg);border-color:#9e8dff78}
.presence-orbit-secondary{width:223px;height:223px;border-style:dashed;border-color:#669cff88;animation-direction:reverse;animation-duration:32s}
.presence-core{height:154px;width:154px;display:grid;place-items:center;position:relative;border-radius:40%;background:radial-gradient(circle at 32% 22%,#d2faff 0%,#83c8ff 13%,#6c7bff 42%,#1427a0 70%,#071334 100%);box-shadow:0 0 15px #7ba3ff,0 0 70px #546affbb,inset -18px -14px 30px #06135188;animation:presence-breathe 5s ease-in-out infinite}
.presence-core::before{content:"";position:absolute;inset:13px;border-radius:40%;border:1px solid #eef8ff55;transform:rotate(26deg)}
.presence-core span{font-size:74px;color:#f6ffff;text-shadow:0 0 20px #ffffffc2;transform:translateY(-4px)}
.presence-satellite{position:absolute;width:10px;height:10px;border-radius:50%;background:#94efff;box-shadow:0 0 20px #73e0ff;top:6px;left:50%}
.presence-label{position:absolute;bottom:-12px;left:50%;transform:translateX(-50%);white-space:nowrap;text-align:center;font-size:10px;letter-spacing:.18em;font-weight:800;color:#97c7ee}
@keyframes presence-spin{to{transform:rotate(360deg)}}
@keyframes presence-breathe{50%{border-radius:48%;transform:translateY(-9px) scale(1.025)}}
.journeys{margin:18px 0 27px}
.journeys-header{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:0 0 13px}
.journeys-header h2{margin:0;font-size:17px}
.journeys-header span{font-size:11px;color:var(--muted)}
.journeys-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.journey{position:relative;display:block;text-decoration:none;color:var(--text);padding:18px;border-radius:17px;border:1px solid #254363;background:linear-gradient(135deg,#112742ee,#0b1527);min-height:142px;transition:transform .2s,border-color .2s}
.journey:hover,.journey:focus-visible{transform:translateY(-2px);border-color:#80b7ff;outline:0}
.journey-mark{font-size:22px;display:inline-grid;place-items:center;width:40px;height:40px;border:1px solid #3a597f;border-radius:12px;background:#163457}
.journey strong{display:block;margin-top:11px;font-size:14px}
.journey small{display:block;margin-top:4px;color:#aabfdb;line-height:1.45}
.discovery-title{font-size:24px;letter-spacing:-.04em;margin:28px 0 9px}
.discovery-note{color:#b8cce5;line-height:1.55;font-size:14px;margin:0 0 13px}
@media(max-width:600px){.presence{grid-template-columns:1fr;padding:22px 20px 6px;margin-top:26px}.presence-visual{min-height:243px;grid-row:1}.presence-orbit{width:207px;height:207px}.presence-orbit-secondary{width:169px;height:169px}.presence-core{width:112px;height:112px}.presence-core span{font-size:52px}.presence-copy{grid-row:2;padding-bottom:21px}.presence h1{font-size:44px}.presence-facts{margin-top:16px}.journey{padding:14px;min-height:156px}.journeys-grid{gap:9px}}
@media(prefers-reduced-motion:reduce){.presence-orbit,.presence-core{animation:none}.journey{transition:none}}

</style>
</head>
<body>
<main>
<nav>
  <a class="brand" href="/mobile"><img src="/assets/evercraft-icon.png" alt=""><span>Evercraft</span></a>
  <a class="navlink" href="/health">Live health</a>
</nav>
<div class="status"><span class="dot"></span> Fabric capability directory</div>
<section class="presence" data-form="${activeForm}" aria-label="Evercraft visual companion beta concept">
  <div class="presence-copy">
    <div class="presence-tag">Evercraft ${companionBetaIdentity.workingTitle} · ${companionBetaIdentity.stage} · name TBD</div>
    <h1>One door.<br><span>A world of capability.</span></h1>
    <p>Pick a visual form, describe a goal, and discover relevant tools. Names and appearances are experiments. No autonomous character, private memory, or live AI Boardroom is implied.</p>
    <div class="presence-facts"><span>Owned Fabric</span><span>Grounded discovery</span><span>No silent actions</span></div>
  </div>
  <div class="presence-visual" aria-hidden="true">
    <div class="presence-orbit"><i class="presence-satellite"></i></div>
    <div class="presence-orbit presence-orbit-secondary"></div>
    <div class="presence-core"><span>✦</span></div>
    <div class="presence-label">EVERCRAFT / BETA</div>
  </div>
</section>
<div class="companion-chooser"><span class="chooser-copy">Try a visual form. These are cosmetic beta themes, not separate AI identities.</span><nav class="companion-forms" aria-label="Visual companion forms">${formChoices}</nav></div>
<section class="journeys" aria-label="Explore Evercraft pathways">
  <div class="journeys-header"><h2>Choose your starting point</h2><span>Guided discovery · no actions</span></div>
  <div class="journeys-grid"><a class="journey" href="/mobile?form=${activeForm}&q=I%20want%20help%20understanding%20maintenance%20opportunities%20for%20a%20property."><span class="journey-mark" aria-hidden="true">⌂</span><strong>Property intelligence</strong><small>Find property and maintenance capabilities →</small></a>
<a class="journey" href="/mobile?form=${activeForm}&q=I%20am%20a%20creator%20who%20wants%20to%20launch%20a%20branded%20digital%20service."><span class="journey-mark" aria-hidden="true">✳</span><strong>Creator presence</strong><small>Explore creator tools and distribution →</small></a>
<a class="journey" href="/mobile?form=${activeForm}&q=I%20need%20strategic%20business%20planning%20and%20want%20to%20evaluate%20options."><span class="journey-mark" aria-hidden="true">◇</span><strong>Business strategy</strong><small>Discover planning and operations tools →</small></a>
<a class="journey" href="/mobile?form=${activeForm}&q=I%20want%20to%20connect%20with%20useful%20local%20household%20and%20community%20services."><span class="journey-mark" aria-hidden="true">✦</span><strong>Community services</strong><small>Discover neighborhood and local support tools →</small></a></div>
</section>
<h2 class="discovery-title">Bring the problem.</h2>
<p class="discovery-note">Fabric matches your description against its public-safe capability catalog. Results are suggestions, not completed work, quotes, or bookings.</p>

<form method="post" action="/mobile">
  <input type="hidden" name="form" value="${activeForm}">
  <textarea name="q" maxlength="4000" minlength="3" required placeholder="Example: I own a commercial property and want to know whether EV charging makes sense here.">${safeQuery}</textarea>
  <button type="submit">Find the right Evercraft capability</button>
</form>
<div class="meta"><span>${Number(capabilityCount)||0} live capabilities</span><span>Read-only discovery</span></div>

${error?`<div class="error">${escapeHtml(error)}</div>`:''}
<section class="results">${resultCards(matches)}</section>
${proof?`<section class="result" aria-label="Discovery trace"><h2>What actually happened</h2><p>Fabric matching: ${escapeHtml(proof.status)} · ${Number(proof.candidates)||0} candidates</p><p>Observed ${escapeHtml(proof.observed_at)} · View ${escapeHtml(proof.display_id)}</p><p>No payment, external action, or Boardroom call was made. This temporary display is not a permanent audit record.</p></section>`:''}

<div class="install">
  <h2>Keep Evercraft on your phone</h2>
  <p>On iPhone, open this page in Safari, tap Share, then choose <strong>Add to Home Screen</strong>. It launches as its own Evercraft window while staying connected to the owned Fabric.</p>
</div>
<footer>Evercraft LLC · Systemia/Fabric · no silent checkout</footer>
</main>
</body>
</html>`;
}

export function fabricMobileManifest(){
  return {
    name:'Evercraft',
    short_name:'Evercraft',
    description:'Phone-first access to the Evercraft/Systemia capability fabric.',
    start_url:'/mobile',
    scope:'/',
    display:'standalone',
    background_color:'#050914',
    theme_color:'#07101f',
    icons:[
      {
        src:'/assets/evercraft-icon.png',
        sizes:'any',
        type:'image/png',
        purpose:'any maskable',
      },
    ],
  };
}
