import crypto from 'node:crypto';
function escapeHtml(value='') {
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

const PUBLIC_ORIGIN='https://fabric.systemiacommandcenters.com';
const DEFAULT_DESCRIPTION='Evercraft Fabric routes plain-language problems to the smallest relevant Evercraft capability while preserving authorization, provenance, and human control.';

const shell=(title,body,{
  description=DEFAULT_DESCRIPTION,
  canonical='',
  ogType='website',
}={})=>{
  const canonicalUrl=canonical
    ? (String(canonical).startsWith('https://')?String(canonical):PUBLIC_ORIGIN+String(canonical))
    : '';
  const socialTitle=escapeHtml(title);
  const socialDescription=escapeHtml(description);
  const socialUrl=escapeHtml(canonicalUrl||PUBLIC_ORIGIN);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#07101f">
<title>${socialTitle}</title>
<meta name="description" content="${socialDescription}">
<meta property="og:type" content="${escapeHtml(ogType)}">
<meta property="og:site_name" content="Evercraft">
<meta property="og:title" content="${socialTitle}">
<meta property="og:description" content="${socialDescription}">
<meta property="og:url" content="${socialUrl}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${socialTitle}">
<meta name="twitter:description" content="${socialDescription}">
${canonicalUrl?'<link rel="canonical" href="'+escapeHtml(canonicalUrl)+'">':''}
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
.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;padding:12px 16px;text-decoration:none;font-weight:720;border:1px solid var(--line);background:#101b31;cursor:pointer;font:inherit;color:inherit}
.btn.primary{background:linear-gradient(135deg,var(--blue2),var(--blue));border-color:transparent}
.btn:hover{transform:translateY(-1px)}
.offer-hero{padding:72px 0 30px;max-width:900px}
.offer-hero h1{max-width:900px}
.offer-price{font-size:clamp(30px,5vw,52px);font-weight:850;letter-spacing:-.045em;margin:18px 0 8px}
.offer-price-note{color:var(--muted);font-size:14px}
.offer-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:16px;margin:18px 0 70px}
.offer-panel{border:1px solid var(--line);background:linear-gradient(180deg,rgba(14,25,48,.82),rgba(9,16,30,.82));border-radius:18px;padding:24px}
.offer-panel h2{font-size:25px;margin:0 0 14px}
.offer-panel p,.offer-panel li{color:#c5d2e4;line-height:1.65}
.offer-panel ul{padding-left:20px}
.offer-panel .plain{font-size:19px;color:var(--text);font-weight:720}
.offer-steps{display:grid;gap:10px;margin-top:16px}
.offer-step{border:1px solid var(--line);border-radius:13px;padding:14px;background:rgba(5,9,20,.35)}
.offer-step strong{display:block;margin-bottom:4px}
.offer-proof{border-left:3px solid var(--green);padding:3px 0 3px 14px;color:#c8d8e9;margin-top:18px}
.checkout-form{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:30px}
.checkout-note{width:100%;color:var(--muted);font-size:13px;line-height:1.5;max-width:690px}
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
  <div class="navlinks"><a href="/offers">Offers</a><a href="/capabilities">Capabilities</a><a href="/support">Support</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
</nav>
${body}
<footer><div class="footerline"><span>Evercraft LLC · Public-safe capability routing</span><span class="footerlinks"><a href="/health">System health</a><a href="/support">Support</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></span></div></footer>
</div>
</body>
</html>`;
};

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


const OFFER_PAGE_COPY={
  'audit-center-website-audit-machine-v1':{
    slug:'website-audit',
    purchase_key:'website-audit-quick-win',
    eyebrow:'Website Audit',
    headline:"Your website is getting attention. Why isn't it getting customers?",
    lede:'Give Evercraft the public website. We inspect the evidence, surface the highest-impact problems, and tell you what to fix first.',
    promise:'A bounded public-web evidence snapshot, automated health score, and the top five prioritized fixes.',
    send:['Your website URL','What you want the site to produce: calls, leads, bookings, sales, or something else','Anything you already know is broken or frustrating'],
    get:['A public-web evidence snapshot','A website health score','The five highest-priority fixes','A clear next-step path without forcing a rebuild'],
    steps:[
      ['1. Give us the URL','No giant discovery process. Start with the site that exists today.'],
      ['2. We audit what customers can actually experience','Performance, conversion friction, discoverability, and obvious public failures are evaluated from evidence.'],
      ['3. You get the short list','The output is prioritized so you know what deserves attention first.']
    ]
  },
  'ibmi-rescue-v1':{
    slug:'ibmi-rescue',
    purchase_key:'ibmi-estate-xray',
    eyebrow:'IBM i Rescue',
    headline:"Don't touch production until you know what depends on it.",
    lede:'Evercraft maps the IBM i / AS/400 estate before an upgrade or modernization move turns an undocumented dependency into an outage.',
    promise:'Start with an IBM i Estate X-Ray. Map the estate, dependencies, jobs, integrations, risk, test needs, and rollback assumptions before production changes.',
    send:['A bounded description of the estate or workload','Known RPG, CL, COBOL, DB2, vendor, job, or integration context','The upgrade, modernization, or maintenance decision you are trying to make'],
    get:['An evidence-backed estate map','Undocumented dependency and integration risks','Testing and rollback requirements','A defensible next-step plan before production changes'],
    steps:[
      ['1. Bound the estate','Start with one estate or workload, not a giant transformation contract.'],
      ['2. Reconstruct the evidence','Map code, jobs, integrations, vendor dependencies, and business behavior.'],
      ['3. Decide with proof','Use the X-Ray to plan the change, deepen into a Proof Sprint, or stop before taking unnecessary risk.']
    ]
  },
  'legacy-rescue-lab-v1':{
    slug:'legacy-rescue',
    purchase_key:'legacy-rescue-scan',
    eyebrow:'Legacy Rescue',
    headline:'Your software is broken. Rebuilding from scratch is not the first move.',
    lede:'Evercraft inspects the system you already have, finds the real failure surface, and gives you a rescue path before you throw away working business logic.',
    promise:'A bounded Legacy Rescue Scan for broken checkouts, abandoned codebases, unreliable AI-built apps, old platforms, and systems nobody trusts enough to touch.',
    send:['The public URL, repo context, or system description you are authorized to share','What is failing now','What absolutely cannot break during the rescue'],
    get:['A bounded failure map','The highest-risk technical unknowns','A repair-vs-rebuild recommendation','A scoped rescue path with the scan fee creditable toward an authorized sprint when eligible'],
    steps:[
      ['1. Show us the failure','Broken checkout, dead form, abandoned code, unstable app, or migration risk.'],
      ['2. We map what is actually happening','The scan separates visible symptoms from the underlying rescue surface.'],
      ['3. Choose the smallest sane repair','Fix, stabilize, migrate, or rebuild only where the evidence justifies it.']
    ]
  },
  'findmypart-paid-hunt-v1':{
    slug:'findmypart',
    purchase_key:'findmypart-quick-hunt',
    eyebrow:'FindMyPart',
    headline:"Can't find the part? Give us the trail. We'll hunt it down.",
    lede:'For discontinued, obsolete, superseded, salvage, new-old-stock, aftermarket, cross-reference, blueprint, and fabrication-path searches when normal suppliers come up empty.',
    promise:'Start with a Quick Hunt, then go deeper only if the part actually requires it.',
    send:['Any part number, casting number, model, marking, dimensions, or photo details you have','What machine or assembly it belongs to','What you have already tried'],
    get:['Candidate source paths','Supersession and cross-reference leads when available','Salvage, NOS, aftermarket, blueprint, or fabrication paths when relevant','A deeper hunt only when the evidence calls for it'],
    steps:[
      ['1. Give us the clues','Even partial markings and machine context can narrow the search.'],
      ['2. We search beyond the obvious shelf','Cross references, obsolete inventory, donors, salvage, and alternate production paths are in scope.'],
      ['3. You get the trail','We return the best sourcing path we can substantiate instead of pretending missing evidence is certainty.']
    ]
  }
};

export function offerSlugForCapability(publicId){
  return OFFER_PAGE_COPY[String(publicId||'')]?.slug||null;
}

export function offerCapabilityForSlug(slug,capabilities=[]){
  const wanted=String(slug||'').trim().toLowerCase();
  if(!wanted) return null;
  const id=Object.entries(OFFER_PAGE_COPY).find(([,copy])=>copy.slug===wanted)?.[0]||null;
  return id ? (capabilities||[]).find((item)=>item.public_id===id)||null : null;
}

export function offerPurchaseKeyForSlug(slug){
  const wanted=String(slug||'').trim().toLowerCase();
  if(!wanted) return null;
  const copy=Object.values(OFFER_PAGE_COPY).find((item)=>item.slug===wanted);
  return copy?.purchase_key||null;
}

function entryPriceLabel(item){
  const entry=item?.entry_paid_offer||null;
  if(entry?.price) return entry.price;
  if(Number.isFinite(entry?.price_usd_normalized)) return String.fromCharCode(36)+entry.price_usd_normalized;
  return item?.pricing||'See current offer';
}

export function renderOffers(capabilities=[]){
  const offers=(capabilities||[])
    .filter((item)=>item.commercial_state==='sell_now'&&offerSlugForCapability(item.public_id))
    .map((item)=>{
      const copy=OFFER_PAGE_COPY[item.public_id];
      return '<article class="card">'
        +'<div class="eyebrow">'+escapeHtml(copy.eyebrow)+'</div>'
        +'<h3><a href="/offers/'+escapeHtml(copy.slug)+'" style="text-decoration:none">'+escapeHtml(copy.headline)+'</a></h3>'
        +'<p>'+escapeHtml(copy.promise)+'</p>'
        +'<p class="price">Starts at '+escapeHtml(entryPriceLabel(item))+'</p>'
        +'<div class="cardlinks"><a class="btn primary" href="/offers/'+escapeHtml(copy.slug)+'">See the offer</a></div>'
        +'</article>';
    }).join('');
  return shell('Evercraft Offers',[
    '<main>',
    '<section class="hero">',
    '<div class="eyebrow">Evercraft offers</div>',
    '<h1>One problem.<br>One clear offer.</h1>',
    '<p class="lede">No software scavenger hunt. These pages explain the pain, the smallest useful paid entry, what you send, what you get, and what happens next.</p>',
    '</section>',
    '<div class="grid">'+(offers||'<article class="card"><h3>No public offer pages are available yet.</h3></article>')+'</div>',
    '</main>'
  ].join('\n'),{
    description:'Simple Evercraft offers with a clear problem, first paid step, price, inputs, outputs, and next action.',
    canonical:'/offers',
    ogType:'website',
  });
}

export function renderOfferPage(item){
  const copy=OFFER_PAGE_COPY[item?.public_id];
  if(!copy) return null;
  const entry=item.entry_paid_offer||null;
  const price=entryPriceLabel(item);
  const offerName=entry?.name||item.name;
  const send=copy.send.map((x)=>'<li>'+escapeHtml(x)+'</li>').join('');
  const get=copy.get.map((x)=>'<li>'+escapeHtml(x)+'</li>').join('');
  const steps=copy.steps.map(([title,body])=>'<div class="offer-step"><strong>'+escapeHtml(title)+'</strong><span>'+escapeHtml(body)+'</span></div>').join('');
  const idempotencyKey='offer-'+copy.slug+'-'+crypto.randomUUID();
  return shell(copy.headline+' · Evercraft',[
    '<main>',
    '<section class="offer-hero">',
    '<div class="kicker"><span class="dot"></span> '+escapeHtml(copy.eyebrow)+' · available now</div>',
    '<h1>'+escapeHtml(copy.headline)+'</h1>',
    '<p class="lede">'+escapeHtml(copy.lede)+'</p>',
    '<div class="offer-price">'+escapeHtml(price)+'</div>',
    '<div class="offer-price-note">'+escapeHtml(offerName)+' · '+escapeHtml(item.pricing||'')+'</div>',
    '<form class="checkout-form" method="post" action="/api/offers/'+encodeURIComponent(copy.slug)+'/checkout">',
    '<input type="hidden" name="user_confirmed" value="true">',
    '<input type="hidden" name="idempotency_key" value="'+escapeHtml(idempotencyKey)+'">',
    '<button class="btn primary" type="submit">Continue to checkout · '+escapeHtml(price)+'</button>',
    '<a class="btn" href="/capabilities/'+encodeURIComponent(item.public_id)+'">See technical proof</a>',
    '<div class="checkout-note">This button confirms this exact offer and asks Raven Nexus to prepare an unpaid Evercraft Payments checkout. No payment is recorded and fulfillment stays locked until settlement is verified.</div>',
    '</form>',
    '</section>',
    '<div class="offer-grid">',
    '<section class="offer-panel"><h2>What you are buying</h2><p class="plain">'+escapeHtml(copy.promise)+'</p><div class="offer-proof">No giant platform commitment is required to understand the first paid step.</div></section>',
    '<section class="offer-panel"><h2>What you send us</h2><ul>'+send+'</ul></section>',
    '<section class="offer-panel"><h2>What you get back</h2><ul>'+get+'</ul></section>',
    '<section class="offer-panel"><h2>How it works</h2><div class="offer-steps">'+steps+'</div></section>',
    '</div>',
    '</main>'
  ].join('\n'),{
    description:copy.lede+' '+offerName+' starts at '+price+'.',
    canonical:'/offers/'+copy.slug,
    ogType:'website',
  });
}

export function renderPaymentHandoffPage({slug='',checkoutUrl='',amountLabel='',orderKey=''}={}){
  const safeSlug=String(slug||'').trim().toLowerCase();
  const back=safeSlug?'/offers/'+encodeURIComponent(safeSlug):'/offers';
  const target=String(checkoutUrl||'').trim();
  const amount=String(amountLabel||'').trim();
  const order=String(orderKey||'').trim();
  return shell('Continue to secure checkout · Evercraft',[
    '<main>',
    '<section class="offer-hero">',
    '<div class="kicker"><span class="dot"></span> Evercraft Payments</div>',
    '<h1>Your checkout is ready.</h1>',
    '<p class="lede">Evercraft Payments prepared the order successfully. Open the secure settlement page to continue. Nothing is marked paid until settlement is verified.</p>',
    amount?'<div class="offer-price">'+escapeHtml(amount)+'</div>':'',
    '<div class="actions">',
    '<a class="btn primary" href="'+escapeHtml(target)+'" rel="noreferrer">Open secure checkout</a>',
    '<a class="btn" href="'+back+'">Back to the offer</a>',
    '</div>',
    order?'<div class="checkout-note">Order reference: <code>'+escapeHtml(order)+'</code></div>':'',
    '<div class="checkout-note">If your in-app browser does not open the settlement page automatically, use the blue button above. Evercraft Payments remains the payment authority.</div>',
    '</section>',
    '</main>'
  ].join('\n'),{
    description:'Your Evercraft Payments checkout is ready. Continue to the secure settlement page.',
    canonical:back,
    ogType:'website',
  });
}

export function renderPaymentHoldPage({slug='',orderKey=''}={}){
  const safeSlug=String(slug||'').trim().toLowerCase();
  const back=safeSlug?'/offers/'+encodeURIComponent(safeSlug):'/offers';
  const order=String(orderKey||'').trim();
  return shell('Payment is not ready yet · Evercraft',[
    '<main>',
    '<section class="offer-hero">',
    '<div class="kicker"><span class="dot"></span> Evercraft Payments</div>',
    '<h1>No charge was made.</h1>',
    '<p class="lede">We saved the purchase request, but the settlement rail did not open cleanly. Nothing was marked paid and no fulfillment was released.</p>',
    '<div class="actions">',
    '<a class="btn primary" href="'+back+'">Return to the offer</a>',
    '<a class="btn" href="'+back+'">Try again</a>',
    '</div>',
    order?'<div class="checkout-note">Order reference: <code>'+escapeHtml(order)+'</code></div>':'',
    '</section>',
    '<section class="offer-panel">',
    '<h2>What happened?</h2>',
    '<p>Evercraft Payments failed closed instead of sending you into a mismatched or unverified checkout. Your offer, price, and fulfillment scope were not changed.</p>',
    '</section>',
    '</main>'
  ].join('\n'),{
    description:'Evercraft Payments did not open a settlement checkout. No charge was made.',
    canonical:back,
    ogType:'website',
  });
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
        const offerSlug=offerSlugForCapability(item.public_id);
        const href=offerSlug?'/offers/'+encodeURIComponent(offerSlug):'/capabilities/'+encodeURIComponent(item.public_id);
        return '<article class="card"><h3><a href="'+href+'" style="text-decoration:none">'+escapeHtml(item.name)+'</a></h3><p>'+escapeHtml(problem)+'</p><p class="price">'+escapeHtml(item.pricing)+'</p><div class="cardlinks"><a class="docs-link" href="'+href+'">'+(offerSlug?'See the offer':'See what it does')+' →</a></div></article>';
      }).join('')
    : '<article class="card"><h3>Capability catalog</h3><p>Current commercial state is available through the live directory.</p></article>';
  return shell('Evercraft Fabric',[
    '<main>',
    '<section class="hero">',
    '<div class="kicker"><span class="dot"></span> Evercraft Fabric is online</div>',
    '<h1>Bring the problem.<br>Fabric finds the path.</h1>',
    '<p class="lede">One permission-aware front door into Evercraft. Describe what you are trying to accomplish in plain language and Fabric routes you to the smallest relevant capability without turning discovery into authority.</p>',
    '<div class="actions"><a class="btn primary" href="/offers">See simple offers</a><a class="btn" href="/capabilities">Explore '+count+' capabilities</a></div>',
    '</section>',
    '<div class="trust">',
    '<div><strong>'+count+'</strong><span>public-safe capabilities</span></div>',
    '<div><strong>Read only</strong><span>discovery by default</span></div>',
    '<div><strong>No silent checkout</strong><span>human confirmation stays in control</span></div>',
    '<div><strong>Evidence aware</strong><span>state and provenance stay explicit</span></div>',
    '</div>',
    '<section>',
    '<div class="eyebrow">How it works</div>',
    '<h2>Problem first. Product second.</h2>',
    '<p class="sub">You should not need to memorize a software catalog. Fabric interprets the job, compares it with current published capability metadata, and returns the safest useful route it can actually support.</p>',
    '<div class="grid">',
    '<article class="card"><h3>1. Describe the problem</h3><p>Use normal language. Start with the work, not an Evercraft product name.</p></article>',
    '<article class="card"><h3>2. Match the specialist</h3><p>Fabric ranks current capabilities and favors the narrowest truthful fit.</p></article>',
    '<article class="card"><h3>3. Continue deliberately</h3><p>Connection options stay explicit. Discovery alone never creates payment or external action.</p></article>',
    '</div>',
    '</section>',
    '<section>',
    '<div class="eyebrow">Available now</div>',
    '<h2>Useful work, not a software scavenger hunt.</h2>',
    '<p class="sub">Human offer pages explain the problem and first paid step plainly. The underlying capability record remains available for technical proof.</p>',
    '<div class="grid">'+featuredMarkup+'</div>',
    '</section>',
    '<section>',
    '<div class="eyebrow">Try asking</div>',
    '<h2>Real problems are the interface.</h2>',
    '<div class="prompts">',
    '<article class="prompt"><h3>Hard-to-find parts</h3><p>Route an obsolete component problem to the relevant sourcing capability.</p><code>“I need a discontinued hydraulic valve that normal suppliers cannot locate.”</code></article>',
    '<article class="prompt"><h3>EV infrastructure</h3><p>Find the right site-intelligence path for a commercial property.</p><code>“Is this property a good place for EV charging?”</code></article>',
    '<article class="prompt"><h3>Website conversion</h3><p>Find the bounded audit surface when traffic is not becoming leads.</p><code>“My website gets traffic but almost nobody contacts us.”</code></article>',
    '<article class="prompt"><h3>Large evidence review</h3><p>Route long-form media and document evidence to an evidence-aware workflow.</p><code>“I have hours of video and need a trustworthy timeline and transcript.”</code></article>',
    '</div>',
    '</section>',
    '</main>'
  ].join('\n'));
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
    Number.isFinite(entry?.price_usd_normalized) ? String.fromCharCode(36)+entry.price_usd_normalized : ''
  );
  const resources=docs.length
    ? '<div class="connection-list">'+docs.map((connection)=>'<a class="connection" href="'+escapeHtml(connection.url)+'" rel="noreferrer"><strong>'+escapeHtml(connection.label)+'</strong><span>'+escapeHtml(connection.type)+' · '+escapeHtml(connection.state)+'</span></a>').join('')+'</div>'
    : '<p>No separate public documentation route is represented for this capability yet.</p>';
  const prompts=useWhen.length
    ? '<ul>'+useWhen.map((value)=>'<li>“'+escapeHtml(value)+'”</li>').join('')+'</ul>'
    : '<p>This capability is currently discovered from its published problem description.</p>';
  const startState=item.start_url_state||'not_declared';
  return shell(item.name+' · Evercraft Fabric',[
    '<main>',
    '<section class="hero">',
    '<div class="eyebrow">Evercraft capability</div>',
    '<h1>'+escapeHtml(item.name)+'</h1>',
    '<p class="lede">'+escapeHtml(item.description)+'</p>',
    '<div class="actions"><a class="btn primary" href="/offers">See simple offers</a><a class="btn" href="/capabilities">Browse all capabilities</a></div>',
    '</section>',
    '<div class="detail-grid">',
    '<section class="detail-panel"><h2>When this is the right tool</h2>'+prompts+'</section>',
    '<section class="detail-panel"><h2>Current offer</h2>'
      +(item.pricing?'<p class="strong">'+escapeHtml(item.pricing)+'</p>':'<p>No fixed public price is currently represented by Fabric.</p>')
      +(entry?'<p><strong>Easiest published entry:</strong> '+escapeHtml(entry.name)+(entryPrice?' · '+escapeHtml(entryPrice):'')+'</p>':'')
      +'<p><strong>Commercial state:</strong> '+escapeHtml(commercial)+'</p>'
      +'<p><strong>Machine state:</strong> '+escapeHtml(item.state)+'</p>'
      +'<p><strong>Verified start-path state:</strong> '+escapeHtml(startState)+'</p>'
      +'<p>Discovery itself does not create a charge, paid engagement, deployment, message, or other external action. Fabric will not invent a checkout or start route that the catalog has not verified.</p></section>',
    '<section class="detail-panel"><h2>Continue deliberately</h2><p>For an AI or agent, use capability ID <code>'+escapeHtml(item.public_id)+'</code> through Evercraft Fabric. A paid or human continuation is exposed only when the capability publishes a verified start path.</p>'+resources+'</section>',
    '<section class="detail-panel"><h2>Why the door is trustworthy</h2><p>This page is rendered from the same live public-safe capability metadata Fabric exposes to agents. If availability, pricing, or routing state changes in the catalog, this surface changes with it.</p><p><a class="docs-link" href="/capabilities/'+encodeURIComponent(item.public_id)+'.json">Machine-readable capability JSON →</a></p></section>',
    '</div>',
    '</main>'
  ].join('\n'));
}



export function renderRivetLanding(){
  return shell('RIVET · EV charging reports',[
    '<main>',
    '<section class="hero">',
    '<div class="kicker"><span class="dot"></span> RIVET reporting</div>',
    '<h1>One address.<br>One decision-ready report.</h1>',
    '<p class="lede">RIVET is the reporting brand for EV charging opportunity intelligence. The experience stays deliberately simple: start with a property, get a clear report, and keep observed evidence separate from modeled assumptions.</p>',
    '<div class="actions"><a class="btn primary" href="/capabilities/rivet-site-underwriting-v1">View report options</a><a class="btn" href="/aliev">See the intelligence layer</a></div>',
    '</section>',
    '<div class="trust">',
    '<div><strong>Address first</strong><span>no giant workflow to learn</span></div>',
    '<div><strong>Observed sessions</strong><span>used when verified and spatially relevant</span></div>',
    '<div><strong>Missing ≠ zero</strong><span>unknowns stay visible</span></div>',
    '<div><strong>Source-backed</strong><span>provenance travels with the report</span></div>',
    '</div>',
    '<section><div class="eyebrow">The report</div><h2>Simple on the surface. Deep underneath.</h2>',
    '<p class="sub">RIVET compresses the messy EV diligence stack into a report a property owner, broker, installer, fleet, charging developer or investor can actually use.</p>',
    '<div class="grid">',
    '<article class="card"><h3>Real nearby usage</h3><p>Where verified session evidence exists, RIVET preserves session counts, energy, period, site identity, freshness and provenance instead of substituting charger inventory for demand.</p></article>',
    '<article class="card"><h3>Site context</h3><p>Competition, traffic, EV stock, dwell context, parcel/planning signals, utility and tariff context, incentives and known engineering unknowns stay in one evidence model.</p></article>',
    '<article class="card"><h3>Decision framing</h3><p>Observed, public, licensed, inferred and modeled evidence remain visibly distinct so the report can be useful without pretending preliminary diligence is final engineering.</p></article>',
    '</div></section>',
    '<section><div class="eyebrow">Report tiers</div><h2>Buy the answer, not another dashboard.</h2><div class="grid">',
    '<article class="card"><h3>Preliminary Site Opportunity Report</h3><p>Fast address-level diligence for whether a site deserves deeper work.</p><p class="price">$299 one-time</p></article>',
    '<article class="card"><h3>Full Site Opportunity Report</h3><p>Deeper evidence and diligence for a serious property, sales or investment decision.</p><p class="price">$750 one-time</p></article>',
    '<article class="card"><h3>Underlying intelligence</h3><p>AliEV is Evercraft\'s operating and intelligence layer. RIVET stays focused on packaging that depth into clear reporting.</p><div class="cardlinks"><a class="docs-link" href="/aliev">Explore AliEV →</a></div></article>',
    '</div></section>',
    '</main>'
  ].join('\n'),{
    description:'RIVET turns address-specific EV charging intelligence into a simple decision-ready report backed by explicit evidence states and provenance.',
    canonical:'/rivet',
    ogType:'website',
  });
}

export function renderAliEvLanding(){
  return shell('AliEV · EV infrastructure intelligence',[
    '<main>',
    '<section class="hero">',
    '<div class="kicker"><span class="dot"></span> AliEV intelligence layer</div>',
    '<h1>The engine behind<br>the EV decision.</h1>',
    '<p class="lede">AliEV is Evercraft\'s EV infrastructure intelligence and operating layer. It gathers and separates competition, traffic, utility, tariff, incentive, property, market and observed-session evidence so RIVET can stay brutally simple.</p>',
    '<div class="actions"><a class="btn primary" href="/capabilities/aliev-site-opportunity-snapshot-v1">Open AliEV capability</a><a class="btn" href="/rivet">See RIVET reports</a></div>',
    '</section>',
    '<div class="trust">',
    '<div><strong>14 domains</strong><span>strict report coverage contract</span></div>',
    '<div><strong>Session-first</strong><span>observed usage is its own evidence class</span></div>',
    '<div><strong>Provider-neutral</strong><span>no single network defines the answer</span></div>',
    '<div><strong>Report-ready</strong><span>RIVET consumes the evidence without exposing complexity</span></div>',
    '</div>',
    '<section><div class="eyebrow">What AliEV owns</div><h2>Depth without UI sprawl.</h2>',
    '<p class="sub">AliEV can get more sophisticated without making RIVET harder to use. New data, adapters, models and evidence sources enrich the answer underneath the same address-first report flow.</p>',
    '<div class="grid">',
    '<article class="card"><h3>Observed session intelligence</h3><p>Site-resolved session evidence, period normalization, freshness, energy and usage patterns where legitimately available.</p></article>',
    '<article class="card"><h3>Property + grid context</h3><p>Utility service area, tariff candidates, incentives, parcel/planning evidence and power constraints remain separate from final engineering claims.</p></article>',
    '<article class="card"><h3>Market + economics context</h3><p>Competition, traffic, EV stock, dwell/freight context and modeled economics are assembled with explicit evidence states and provenance.</p></article>',
    '</div></section>',
    '</main>'
  ].join('\n'),{
    description:'AliEV is Evercraft\'s EV infrastructure intelligence layer for competition, traffic, utility, tariff, incentive, property, market and observed-session evidence.',
    canonical:'/aliev',
    ogType:'website',
  });
}
