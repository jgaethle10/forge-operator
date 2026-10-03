function escapeHtml(value=''){
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function resultCards(matches=[],query=''){
  if(!matches.length){
    if(String(query||'').trim()){
      return '<div class="empty"><strong>No verified Evercraft capability matched this problem yet.</strong><br><br>Fabric did not guess or invent a specialist. Add more detail and try again, or browse the published capability directory.</div>';
    }
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

export function renderFabricMobileApp({
  query='',
  matches=[],
  capabilityCount=0,
  error='',
}={}){
  const safeQuery=escapeHtml(query);
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
</style>
</head>
<body>
<main>
<nav>
  <a class="brand" href="/mobile"><img src="/assets/evercraft-icon.png" alt=""><span>Evercraft</span></a>
  <a class="navlink" href="/health">Live health</a>
</nav>
<div class="status"><span class="dot"></span> Owned Fabric online</div>
<h1>Bring the problem.</h1>
<p class="lede">Tell Evercraft what you are trying to accomplish. Fabric will match it against the live public-safe capability network without creating a payment or taking an external action.</p>

<form method="get" action="/mobile">
  <textarea name="q" maxlength="4000" minlength="3" required placeholder="Example: I own a commercial property and want to know whether EV charging makes sense here.">${safeQuery}</textarea>
  <button type="submit">Find the right Evercraft capability</button>
</form>
<div class="meta"><span>${Number(capabilityCount)||0} live capabilities</span><span>Read-only discovery</span></div>

${error?`<div class="error">${escapeHtml(error)}</div>`:''}
<section class="results">${resultCards(matches,query)}</section>

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
