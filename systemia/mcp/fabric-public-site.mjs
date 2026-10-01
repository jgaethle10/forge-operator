function escapeHtml(value='') {
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

const shell=(title,body)=>`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#07101f">
<title>${escapeHtml(title)}</title>
<meta name="description" content="Evercraft Fabric routes plain-language problems to the smallest relevant Evercraft capability while preserving authorization, provenance, and human control.">
<link rel="icon" href="/assets/evercraft-icon.png">
<style>
:root{
  color-scheme:dark;
  --bg:#050914;
  --panel:#0b1324;
  --panel2:#0e1930;
  --line:#203250;
  --text:#f7f9fc;
  --muted:#9fb0c8;
  --blue:#55a7ff;
  --blue2:#1c6cff;
  --green:#72e7b4;
}
*{box-sizing:border-box}
body{
  margin:0;
  min-height:100vh;
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  color:var(--text);
  background:
    radial-gradient(circle at 85% 5%,rgba(28,108,255,.23),transparent 30rem),
    radial-gradient(circle at 5% 80%,rgba(85,167,255,.12),transparent 28rem),
    var(--bg);
}
a{color:inherit}
.wrap{width:min(1120px,calc(100% - 36px));margin:0 auto}
nav{display:flex;align-items:center;justify-content:space-between;padding:24px 0}
.brand{display:flex;gap:12px;align-items:center;text-decoration:none;font-weight:750;letter-spacing:-.02em}
.brand img{width:36px;height:36px;border-radius:10px;box-shadow:0 10px 28px rgba(28,108,255,.26)}
.navlinks{display:flex;gap:18px;color:var(--muted);font-size:14px}
.navlinks a{text-decoration:none}.navlinks a:hover{color:var(--text)}
.hero{padding:84px 0 52px;max-width:860px}
.kicker{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:rgba(11,19,36,.72);padding:8px 12px;border-radius:999px;color:#c9d7ea;font-size:13px}
.dot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 16px rgba(114,231,180,.75)}
h1{font-size:clamp(48px,8vw,90px);line-height:.95;letter-spacing:-.065em;margin:22px 0 24px;max-width:880px}
.lede{font-size:clamp(18px,2.4vw,25px);line-height:1.5;color:#c4d1e3;max-width:790px}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;padding:12px 16px;text-decoration:none;font-weight:720;border:1px solid var(--line);background:#101b31}
.btn.primary{background:linear-gradient(135deg,var(--blue2),var(--blue));border-color:transparent}
.btn:hover{transform:translateY(-1px)}
.trust{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:34px 0 76px}
.trust div,.card,.prompt,.doc{
  border:1px solid var(--line);
  background:linear-gradient(180deg,rgba(14,25,48,.82),rgba(9,16,30,.82));
  box-shadow:0 18px 50px rgba(0,0,0,.18);
}
.trust div{padding:16px;border-radius:14px}.trust strong{display:block;font-size:18px}.trust span{color:var(--muted);font-size:13px}
section{padding:34px 0 70px}
.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:12px;color:#8ebfff;font-weight:800}
h2{font-size:clamp(30px,4.5vw,52px);letter-spacing:-.04em;margin:10px 0 14px}
.sub{color:var(--muted);max-width:720px;line-height:1.65}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:28px}
.card,.prompt{padding:20px;border-radius:16px}
.card h3,.prompt h3{margin:0 0 8px;font-size:18px}
.card p,.prompt p{margin:0;color:var(--muted);line-height:1.55}
.prompts{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:28px}
.prompt code{display:block;margin-top:14px;white-space:normal;color:#dce8f8;font-family:inherit;font-size:15px}
.capability-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin:26px 0 70px}
.capability{padding:18px;border:1px solid var(--line);border-radius:15px;background:rgba(11,19,36,.72)}
.capability h3{margin:0 0 7px;font-size:17px}.capability p{margin:0;color:var(--muted);line-height:1.5;font-size:14px}
.badge{display:inline-block;margin-top:12px;border:1px solid #2a4369;background:#0d1a30;color:#bcd5f8;padding:5px 8px;border-radius:999px;font-size:11px}
.price{margin-top:14px!important;color:#f7f9fc!important;font-weight:700;font-size:14px!important}
.cardlinks{display:flex;gap:12px;flex-wrap:wrap;margin-top:14px}
.docs-link{display:inline-block;color:#9ec8ff;font-size:13px;text-decoration:none}
.detail-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:16px;margin:28px 0 70px}
.detail-panel{border:1px solid var(--line);background:linear-gradient(180deg,rgba(14,25,48,.82),rgba(9,16,30,.82));border-radius:16px;padding:22px}
.detail-panel h2{font-size:24px;margin:0 0 12px}.detail-panel p,.detail-panel li{color:var(--muted);line-height:1.6}
.detail-panel ul{padding-left:20px}.detail-panel .strong{color:var(--text);font-weight:750}
.connection-list{display:grid;gap:10px;margin-top:16px}.connection{border:1px solid var(--line);border-radius:12px;padding:12px;text-decoration:none;background:rgba(5,9,20,.42)}
.connection span{display:block;color:var(--muted);font-size:12px;margin-top:3px}
.doc{padding:30px;border-radius:18px;margin:30px 0 70px}
.doc h1{font-size:42px;line-height:1.06;letter-spacing:-.045em;margin:0 0 22px}
.doc h2{font-size:24px;margin:28px 0 10px}.doc p,.doc li{color:#c0cee0;line-height:1.7}.doc ul{padding-left:22px}
footer{border-top:1px solid var(--line);padding:30px 0 48px;color:var(--muted);font-size:13px}
.footerline{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap}.footerlinks{display:flex;gap:14px}.footerlinks a{text-decoration:none}
@media(max-width:780px){
  .navlinks{display:none}.hero{padding-top:48px}.trust{grid-template-columns:repeat(2,1fr)}
  .grid,.prompts,.capability-grid,.detail-grid{grid-template-columns:1fr}
}
</style>
</head>
<body>
<div class="wrap">
<nav>
  <a class="brand" href="/"><img src="/assets/evercraft-icon.png" alt=""><span>Evercraft Fabric</span></a>
  <div class="navlinks"><a href="/capabilities">Capabilities</a><a href="/support">Support</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
</nav>
${body}
<footer><div class="footerline"><span>Evercraft LLC · Public-safe capability routing</span><span class="footerlinks"><a href="/health">System health</a><a href="/support">Support</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></span></div></footer>
</div>
</body>
</html>`;

function inlineMarkdown(value){
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g,'<a href="$2" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/\`([^\`]+)\`/g,'<code>$1</code>');
}

export function renderMarkdownDocument(title,markdown){
  const lines=String(markdown||'').split(/\r?\n/);
  const out=[];
  let listOpen=false;
  for(const raw of lines){
    const line=raw.trim();
    if(!line){
      if(listOpen){out.push('</ul>');listOpen=false;}
      continue;
    }
    if(line.startsWith('# ')){
      if(listOpen){out.push('</ul>');listOpen=false;}
      out.push('<h1>'+inlineMarkdown(line.slice(2))+'</h1>');
    }else if(line.startsWith('## ')){
      if(listOpen){out.push('</ul>');listOpen=false;}
      out.push('<h2>'+inlineMarkdown(line.slice(3))+'</h2>');
    }else if(line.startsWith('- ')){
      if(!listOpen){out.push('<ul>');listOpen=true;}
      out.push('<li>'+inlineMarkdown(line.slice(2))+'</li>');
    }else{
      if(listOpen){out.push('</ul>');listOpen=false;}
      out.push('<p>'+inlineMarkdown(line)+'</p>');
    }
  }
  if(listOpen) out.push('</ul>');
  return shell(title,'<main class="doc">'+out.join('')+'</main>');
}

export function renderOpenAiPluginHome(){
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#07101f">
<title>Evercraft Website Inspector</title>
<meta name="description" content="Bounded, read-only inspection of an authorized public website with evidence-backed HTTP and on-page signals.">
<link rel="icon" href="/assets/evercraft-icon.png">
<style>
:root{color-scheme:dark;--bg:#050914;--panel:#0b1324;--line:#203250;--text:#f7f9fc;--muted:#a9b8cc;--blue:#55a7ff;--green:#72e7b4}
*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:radial-gradient(circle at 80% 8%,rgba(28,108,255,.22),transparent 30rem),var(--bg)}
main{width:min(940px,calc(100% - 36px));margin:0 auto;padding:28px 0 70px}
nav{display:flex;align-items:center;justify-content:space-between;padding:10px 0 62px}.brand{display:flex;gap:12px;align-items:center;text-decoration:none;font-weight:760}.brand img{width:36px;height:36px;border-radius:10px}.links{display:flex;gap:16px}.links a{text-decoration:none;color:var(--muted);font-size:14px}
.kicker{display:inline-flex;gap:8px;align-items:center;border:1px solid var(--line);background:rgba(11,19,36,.78);padding:8px 12px;border-radius:999px;color:#cad8e9;font-size:13px}.dot{width:7px;height:7px;border-radius:50%;background:var(--green)}
h1{font-size:clamp(48px,8vw,84px);line-height:.98;letter-spacing:-.06em;margin:22px 0}.lede{font-size:clamp(18px,2.4vw,24px);line-height:1.55;color:#c7d3e3;max-width:780px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:44px}.card{border:1px solid var(--line);background:linear-gradient(180deg,rgba(14,25,48,.82),rgba(9,16,30,.82));border-radius:16px;padding:20px}.card h2{font-size:18px;margin:0 0 9px}.card p{color:var(--muted);line-height:1.6;margin:0}
.boundary{margin-top:18px;border:1px solid var(--line);border-radius:16px;padding:22px;background:rgba(11,19,36,.72)}.boundary strong{display:block;margin-bottom:8px}.boundary p{color:var(--muted);line-height:1.65;margin:0}
footer{border-top:1px solid var(--line);margin-top:58px;padding-top:24px;color:var(--muted);font-size:13px}
@media(max-width:760px){.grid{grid-template-columns:1fr}.links{display:none}}
</style>
</head>
<body>
<main>
<nav><a class="brand" href="/openai"><img src="/assets/evercraft-icon.png" alt=""><span>Evercraft</span></a><div class="links"><a href="/openai/support">Support</a><a href="/openai/privacy">Privacy</a><a href="/openai/terms">Terms</a></div></nav>
<section>
  <div class="kicker"><span class="dot"></span> Public ChatGPT & Codex tool</div>
  <h1>Inspect the site.<br>Keep the claims bounded.</h1>
  <p class="lede">Evercraft inspects a public website you own, administer, or have permission to review and returns evidence-backed HTTP and on-page signals. It is read-only and deliberately limited.</p>
</section>
<section class="grid">
  <article class="card"><h2>Observed signals</h2><p>HTTP status, title, description, viewport, robots, canonical URL, headings, image-alt gaps, forms, JSON-LD presence, and a basic contact signal.</p></article>
  <article class="card"><h2>Authorization first</h2><p>The public tool runs only when the user confirms they own, administer, or have permission to inspect the website.</p></article>
  <article class="card"><h2>No hidden commerce</h2><p>The public plugin does not sell, promote, initiate, or facilitate purchases of digital products or services.</p></article>
</section>
<section class="boundary"><strong>What this is not</strong><p>It is not a full crawl, Core Web Vitals lab test, accessibility certification, security audit, penetration test, ranking guarantee, private-network scanner, payment flow, or website editor.</p></section>
<footer>Evercraft LLC · <a href="/openai/support">Support</a> · <a href="/openai/privacy">Privacy</a> · <a href="/openai/terms">Terms</a></footer>
</main>
</body>
</html>`;
}

export function renderOpenAiPolicyDocument(title,markdown){
  const lines=String(markdown||'').split(/\r?\n/);
  const out=[];
  let listOpen=false;
  for(const raw of lines){
    const line=raw.trim();
    if(!line){
      if(listOpen){out.push('</ul>');listOpen=false;}
      continue;
    }
    if(line.startsWith('# ')){
      if(listOpen){out.push('</ul>');listOpen=false;}
      out.push('<h1>'+inlineMarkdown(line.slice(2))+'</h1>');
    }else if(line.startsWith('## ')){
      if(listOpen){out.push('</ul>');listOpen=false;}
      out.push('<h2>'+inlineMarkdown(line.slice(3))+'</h2>');
    }else if(line.startsWith('- ')){
      if(!listOpen){out.push('<ul>');listOpen=true;}
      out.push('<li>'+inlineMarkdown(line.slice(2))+'</li>');
    }else{
      if(listOpen){out.push('</ul>');listOpen=false;}
      out.push('<p>'+inlineMarkdown(line)+'</p>');
    }
  }
  if(listOpen) out.push('</ul>');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#07101f"><title>${escapeHtml(title)}</title>
<style>:root{color-scheme:dark;--bg:#050914;--panel:#0b1324;--line:#203250;--text:#f7f9fc;--muted:#b5c3d6}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(820px,calc(100% - 36px));margin:0 auto;padding:28px 0 70px}nav{padding:12px 0 48px}nav a{color:var(--text);text-decoration:none;font-weight:760}.doc{border:1px solid var(--line);background:var(--panel);border-radius:18px;padding:28px}.doc h1{font-size:38px;letter-spacing:-.04em}.doc h2{margin-top:30px}.doc p,.doc li{color:var(--muted);line-height:1.7}.doc a{color:#9ec8ff}footer{margin-top:30px;color:var(--muted);font-size:13px}footer a{color:inherit}</style></head>
<body><main><nav><a href="/openai">← Evercraft Website Inspector</a></nav><article class="doc">${out.join('')}</article><footer><a href="/openai">Inspector home</a></footer></main></body></html>`;
}

export function renderFabricHome({capabilityCount=0,capabilities=[]}={}){
  const count=Array.isArray(capabilities)&&capabilities.length
    ? capabilities.length
    : Number(capabilityCount)||0;
  const featured=(Array.isArray(capabilities)?capabilities:[])
    .filter((item)=>item.commercial_state==='sell_now'&&item.pricing)
    .slice(0,6);
  const featuredMarkup=featured.length
    ? featured.map((item)=>{
        const problem=item.use_when?.[0]||item.description;
        return `<article class="card"><h3><a href="/capabilities/${encodeURIComponent(item.public_id)}" style="text-decoration:none">${escapeHtml(item.name)}</a></h3><p>${escapeHtml(problem)}</p><p class="price">${escapeHtml(item.pricing)}</p><div class="cardlinks"><a class="docs-link" href="/capabilities/${encodeURIComponent(item.public_id)}">See what it does →</a></div></article>`;
      }).join('')
    : '<article class="card"><h3>Capability catalog</h3><p>Current commercial state is available through the live directory.</p></article>';
  return shell('Evercraft Fabric',`
<main>
  <section class="hero">
    <div class="kicker"><span class="dot"></span> Evercraft Fabric is online</div>
    <h1>Bring the problem.<br>Fabric finds the path.</h1>
    <p class="lede">One permission-aware front door into Evercraft. Describe what you are trying to accomplish in plain language and Fabric routes you to the smallest relevant capability without turning discovery into authority.</p>
    <div class="actions"><a class="btn primary" href="/capabilities">Explore ${count} capabilities</a><a class="btn" href="/health">View live health</a></div>
  </section>

  <div class="trust">
    <div><strong>${count}</strong><span>public-safe capabilities</span></div>
    <div><strong>Read only</strong><span>discovery by default</span></div>
    <div><strong>No silent checkout</strong><span>human confirmation stays in control</span></div>
    <div><strong>Evidence aware</strong><span>state and provenance stay explicit</span></div>
  </div>

  <section>
    <div class="eyebrow">How it works</div>
    <h2>Problem first. Product second.</h2>
    <p class="sub">You should not need to memorize a software catalog. Fabric interprets the job, compares it with current published capability metadata, and returns the safest useful route it can actually support.</p>
    <div class="grid">
      <article class="card"><h3>1. Describe the problem</h3><p>Use normal language. Start with the work, not an Evercraft product name.</p></article>
      <article class="card"><h3>2. Match the specialist</h3><p>Fabric ranks current capabilities and favors the narrowest truthful fit.</p></article>
      <article class="card"><h3>3. Continue deliberately</h3><p>Connection options stay explicit. Discovery alone never creates payment or external action.</p></article>
    </div>
  </section>

  <section>
    <div class="eyebrow">Available now</div>
    <h2>Useful work, not a software scavenger hunt.</h2>
    <p class="sub">These are current public capabilities whose catalog state says they can be sold now. The offer and pricing shown here come from the same runtime metadata agents see.</p>
    <div class="grid">${featuredMarkup}</div>
  </section>

  <section>
    <div class="eyebrow">Try asking</div>
    <h2>Real problems are the interface.</h2>
    <div class="prompts">
      <article class="prompt"><h3>Hard-to-find parts</h3><p>Route an obsolete component problem to the relevant sourcing capability.</p><code>“I need a discontinued hydraulic valve that normal suppliers cannot locate.”</code></article>
      <article class="prompt"><h3>EV infrastructure</h3><p>Find the right site-intelligence path for a commercial property.</p><code>“Is this property a good place for EV charging?”</code></article>
      <article class="prompt"><h3>Website conversion</h3><p>Find the bounded audit surface when traffic is not becoming leads.</p><code>“My website gets traffic but almost nobody contacts us.”</code></article>
      <article class="prompt"><h3>Large evidence review</h3><p>Route long-form media and document evidence to an evidence-aware workflow.</p><code>“I have hours of video and need a trustworthy timeline and transcript.”</code></article>
    </div>
  </section>
</main>`);
}

export function renderCapabilities(capabilities=[]){
  const cards=capabilities.map((item)=>{
    const docs=(item.connections||[]).find((connection)=>connection.type==='docs');
    const detail='/capabilities/'+encodeURIComponent(item.public_id);
    const commercial=item.commercial_state||item.state;
    return `<article class="capability">
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.description)}</p>
      ${item.pricing?`<p class="price">${escapeHtml(item.pricing)}</p>`:''}
      <span class="badge">${escapeHtml(commercial)}</span>
      <div class="cardlinks"><a class="docs-link" href="${detail}">View capability →</a>${docs?.url?`<a class="docs-link" href="${escapeHtml(docs.url)}" rel="noreferrer">Machine guide ↗</a>`:''}</div>
    </article>`;
  }).join('');
  return shell('Evercraft Fabric Capabilities',`
<main>
  <section class="hero">
    <div class="eyebrow">Capability directory</div>
    <h1>What Fabric can route today.</h1>
    <p class="lede">${capabilities.length} public-safe capabilities. Current offer, availability and authority states come directly from the runtime catalog instead of marketing copy that can drift away from the product.</p>
  </section>
  <div class="capability-grid">${cards}</div>
</main>`);
}

export function renderCapabilityDetail(item){
  const docs=(item.connections||[]).filter((connection)=>connection.type==='docs');
  const useWhen=(item.use_when||[]).slice(0,10);
  const commercial=item.commercial_state||item.state;
  const entry=item.entry_paid_offer||null;
  const entryPrice=entry?.price||(
    Number.isFinite(entry?.price_usd_normalized) ? '$'+entry.price_usd_normalized : ''
  );
  const resources=docs.length
    ? `<div class="connection-list">${docs.map((connection)=>`<a class="connection" href="${escapeHtml(connection.url)}" rel="noreferrer"><strong>${escapeHtml(connection.label)}</strong><span>${escapeHtml(connection.type)} · ${escapeHtml(connection.state)}</span></a>`).join('')}</div>`
    : '<p>No separate public documentation route is represented for this capability yet.</p>';
  const prompts=useWhen.length
    ? `<ul>${useWhen.map((value)=>`<li>“${escapeHtml(value)}”</li>`).join('')}</ul>`
    : '<p>This capability is currently discovered from its published problem description.</p>';
  const startState=item.start_url_state||'not_declared';
  return shell(item.name+` · Evercraft Fabric`,`
<main>
  <section class="hero">
    <div class="eyebrow">Evercraft capability</div>
    <h1>${escapeHtml(item.name)}</h1>
    <p class="lede">${escapeHtml(item.description)}</p>
    <div class="actions"><a class="btn primary" href="/capabilities">Browse all capabilities</a><a class="btn" href="/health">Verify Fabric health</a></div>
  </section>
  <div class="detail-grid">
    <section class="detail-panel">
      <h2>When this is the right tool</h2>
      ${prompts}
    </section>
    <section class="detail-panel">
      <h2>Current offer</h2>
      ${item.pricing?`<p class="strong">${escapeHtml(item.pricing)}</p>`:'<p>No fixed public price is currently represented by Fabric.</p>'}
      ${entry?`<p><strong>Easiest published entry:</strong> ${escapeHtml(entry.name)}${entryPrice?' · '+escapeHtml(entryPrice):''}</p>`:''}
      <p><strong>Commercial state:</strong> ${escapeHtml(commercial)}</p>
      <p><strong>Machine state:</strong> ${escapeHtml(item.state)}</p>
      <p><strong>Verified start-path state:</strong> ${escapeHtml(startState)}</p>
      <p>Discovery itself does not create a charge, paid engagement, deployment, message, or other external action. Fabric will not invent a checkout or start route that the catalog has not verified.</p>
    </section>
    <section class="detail-panel">
      <h2>Continue deliberately</h2>
      <p>For an AI or agent, use capability ID <code>${escapeHtml(item.public_id)}</code> through Evercraft Fabric. A paid or human continuation is exposed only when the capability publishes a verified start path.</p>
      ${resources}
    </section>
    <section class="detail-panel">
      <h2>Why the door is trustworthy</h2>
      <p>This page is rendered from the same live public-safe capability metadata Fabric exposes to agents. If availability, pricing, or routing state changes in the catalog, this surface changes with it.</p>
      <p><a class="docs-link" href="/capabilities/${encodeURIComponent(item.public_id)}.json">Machine-readable capability JSON →</a></p>
    </section>
  </div>
</main>`);
}
