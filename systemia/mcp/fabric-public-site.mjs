import { PUBLIC_PAYMENT_OFFERS } from './public-payment-offers.mjs';
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
  ogImage='',
}={})=>{
  const canonicalUrl=canonical
    ? (String(canonical).startsWith('https://')?String(canonical):PUBLIC_ORIGIN+String(canonical))
    : '';
  const socialTitle=escapeHtml(title);
  const socialDescription=escapeHtml(description);
  const socialUrl=escapeHtml(canonicalUrl||PUBLIC_ORIGIN);
  const socialImage=ogImage?escapeHtml(String(ogImage).startsWith('https://')?ogImage:PUBLIC_ORIGIN+ogImage):'';
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
${socialImage?'<meta property="og:image" content="'+socialImage+'">':''}
<meta name="twitter:card" content="${socialImage?'summary_large_image':'summary'}">
${socialImage?'<meta name="twitter:image" content="'+socialImage+'">':''}
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
.offer-grid{display:grid;grid-template-columns:1fr;gap:14px;margin:18px 0 70px;max-width:900px}
.offer-visual{margin:26px 0 24px;border:1px solid var(--line);border-radius:22px;overflow:hidden;background:#07111b;box-shadow:0 28px 70px rgba(0,0,0,.26)}
.offer-visual picture,.offer-visual img{display:block;width:100%}
.offer-visual img{height:auto}
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
    lede:'Automated website scores are easy to find. We inspect the public customer journey, show what the evidence supports, and identify five fixes worth tackling first.',
    promise:'Specific public-web findings. Five prioritized fixes. Practical next steps.',
    heroVisual:'/visuals/website-audit-attention/poster-hero-wide.svg',
    heroVisualMobile:'/visuals/website-audit-attention/poster-feed.svg',
    shareImage:'https://fabric.systemiacommandcenters.com/visuals/website-audit-attention/poster-feed.svg',
    send:['Your website URL','What you want the site to produce','Anything you already know is frustrating'],
    get:['Public-web evidence snapshot','Five priority fixes','A clear next move'],
    steps:[
      ['1. Send the URL','Start with the site that exists today.'],
      ['2. We inspect the public experience','We look for the friction customers can actually encounter.'],
      ['3. Fix what matters first','You get the short prioritized list.']
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
  'site-survive-rapid-audit-v1':{
    slug:'site-survive',
    purchase_key:'site-survive-audit',
    eyebrow:'Site-Survive Rapid Audit',
    headline:'How well will this property handle the next disruption?',
    lede:'A bounded, evidence-first review of a site\'s public exposure and practical recovery vulnerabilities before an emergency becomes an expensive surprise.',
    promise:'One rapid site-survival audit, prioritized risks, and practical next steps. Not an engineering certification or emergency guarantee.',
    send:['The site address or location and type of property','The main concern: access, outages, flooding, heat, smoke, storm or continuity','Relevant site facts and constraints you can safely share'],
    get:['A bounded risk and exposure snapshot with sources','A prioritized action and verification list','Explicit uncertainties requiring on-site or specialist inspection'],
    steps:[
      ['1. Identify the site','Start with one property and the specific disruption that worries you.'],
      ['2. Audit documented exposures','We separate public evidence from assumptions and missing data.'],
      ['3. Prioritize the work','You receive practical next actions and a list of what still needs verification.']
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

// Additional approved products use the same native offer and handoff surfaces.
const extraOfferItems=Object.entries(PUBLIC_PAYMENT_OFFERS).map(([slug,offer])=>{
  const public_id='payment-offer-'+slug;
  OFFER_PAGE_COPY[public_id]={slug,purchase_key:offer.offer_key,eyebrow:offer.title,
    headline:offer.title,lede:offer.intent,promise:offer.intent,
    send:['Your receipt and delivery email','The scope and supporting information requested during intake. Do not send passwords or secrets.'],
    get:[offer.intent,'The bounded deliverable described in the approved offer; payment does not authorize production changes.'],
    steps:[['1. Review the offer','Confirm the product and fixed price.'],['2. Open secure checkout','Evercraft Payments prepares your order.'],['3. Complete intake','Delivery follows verified payment and the required intake.']]};
  return {public_id,name:offer.title,commercial_state:'sell_now',pricing:'$'+offer.amount_cents/100+' one-time',
    entry_paid_offer:{name:offer.title,price:'$'+offer.amount_cents/100,price_usd_normalized:offer.amount_cents/100}};
});

export function offerSlugForCapability(publicId){
  return OFFER_PAGE_COPY[String(publicId||'')]?.slug||null;
}

export function offerCapabilityForSlug(slug,capabilities=[]){
  const wanted=String(slug||'').trim().toLowerCase();
  if(!wanted) return null;
  if(wanted==='part-quick') return offerCapabilityForSlug('findmypart',capabilities);
  const id=Object.entries(OFFER_PAGE_COPY).find(([,copy])=>copy.slug===wanted)?.[0]||null;
  return id ? [...(capabilities||[]),...extraOfferItems].find((item)=>item.public_id===id)||null : null;
}

export function offerPurchaseKeyForSlug(slug){
  const wanted=String(slug||'').trim().toLowerCase();
  if(wanted==='part-quick') return 'findmypart-quick-hunt';
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

export function listHumanOffers(capabilities=[]){
  return [...(capabilities||[]),...extraOfferItems]
    .filter(item=>item.commercial_state==='sell_now'&&offerSlugForCapability(item.public_id))
    .map(item=>({public_id:item.public_id,slug:offerSlugForCapability(item.public_id),name:item.entry_paid_offer?.name||item.name,price:entryPriceLabel(item),url:PUBLIC_ORIGIN+'/offers/'+offerSlugForCapability(item.public_id),human_confirmation_required:true,checkout_is_not_payment:true,paid_delivery_verified:false}));
}

export function renderOffers(capabilities=[]){
  const offers=[...(capabilities||[]),...extraOfferItems]
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

export function renderOfferPage(item,{checkoutConfigured=true}={}){
  const copy=OFFER_PAGE_COPY[item?.public_id];
  if(!copy) return null;
  const entry=item.entry_paid_offer||null;
  const price=entryPriceLabel(item);
  const offerName=entry?.name||item.name;
  const send=copy.send.map((x)=>'<li>'+escapeHtml(x)+'</li>').join('');
  const get=copy.get.map((x)=>'<li>'+escapeHtml(x)+'</li>').join('');
  const steps=copy.steps.map(([title,body])=>'<div class="offer-step"><strong>'+escapeHtml(title)+'</strong><span>'+escapeHtml(body)+'</span></div>').join('');
  const idempotencyKey='offer-'+copy.slug+'-'+crypto.randomUUID();
  const checkoutHeld=!checkoutConfigured;
  const supportSubject=encodeURIComponent('Evercraft | '+copy.slug+' | assisted invoice request');
  const supportBody=encodeURIComponent('I would like to discuss '+offerName+' ('+price+'). Please confirm the scope, availability and an approved manual payment method before invoicing.');
  return shell(copy.headline+' · Evercraft',[
    '<main>',
    '<section class="offer-hero">',
    '<div class="kicker"><span class="dot"></span> '+escapeHtml(copy.eyebrow)+(checkoutHeld?' · online checkout on hold':' · checkout request')+'</div>',
    '<h1>'+escapeHtml(copy.headline)+'</h1>',
    '<p class="lede">'+escapeHtml(copy.lede)+'</p>',
    copy.heroVisual?'<div class="offer-visual"><picture>'+(copy.heroVisualMobile?'<source media="(max-width: 700px)" srcset="'+escapeHtml(copy.heroVisualMobile)+'">':'')+'<img src="'+escapeHtml(copy.heroVisual)+'" alt="" loading="eager"></picture></div>':'',
    '<div class="offer-price">'+escapeHtml(price)+'</div>',
    '<div class="offer-price-note">'+escapeHtml(offerName)+' · '+escapeHtml(item.pricing||'')+'</div>',
    ...(checkoutHeld ? [
      '<section class="offer-panel" aria-label="Assisted purchase request">',
      '<h2>Online checkout is temporarily unavailable.</h2>',
      '<p>Speak with Evercraft about this exact offer, confirm the scope, and request an approved manual invoice. This page does not create an order, collect money or schedule fulfillment.</p>',
      '<div class="actions"><a class="btn primary" href="mailto:jessegaethle10@gmail.com?subject='+supportSubject+'&body='+supportBody+'">Request assisted invoicing</a><a class="btn" href="tel:+15097590440">Call Evercraft</a></div>',
      '<div class="checkout-note">Email opens in your own mail app for you to review and send. No information is transmitted automatically from this page.</div>',
      '</section>',
    ] : [
    '<form class="checkout-form" method="post" action="/api/offers/'+encodeURIComponent(copy.slug)+'/checkout">',
    '<input type="hidden" name="user_confirmed" value="true">',
    '<input type="hidden" name="idempotency_key" value="'+escapeHtml(idempotencyKey)+'">',
    '<label for="offer-customer-email">Email for your receipt and delivery</label>',
    '<input id="offer-customer-email" name="customer_ref" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" maxlength="200" required aria-required="true" style="width:min(100%,340px);padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--text);font:inherit">',
    copy.slug==='website-audit'?'<label for="offer-website-url">Website to audit (include https://)</label><input id="offer-website-url" name="website_url" type="url" placeholder="https://yourbusiness.com" maxlength="1000" required aria-required="true" style="display:block;width:100%;max-width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--text);font:inherit">':'',
    '<button class="btn primary" type="submit">Continue to checkout · '+escapeHtml(price)+'</button>',
    item.public_id.startsWith('payment-offer-')?'':'<a class="btn" href="/capabilities/'+encodeURIComponent(item.public_id)+'">See technical proof</a>',
    '<div class="checkout-note">Evercraft Payments prepares the checkout. Nothing is marked paid until settlement is verified.</div>',
    '</form>',
    ]),
    '</section>',
    '<div class="offer-grid">',
    '<section class="offer-panel"><h2>What you are buying</h2><p class="plain">'+escapeHtml(copy.promise)+'</p></section>',
    '<section class="offer-panel"><h2>What you send us</h2><ul>'+send+'</ul></section>',
    '<section class="offer-panel"><h2>What you get back</h2><ul>'+get+'</ul></section>',
    '<section class="offer-panel"><h2>How it works</h2><div class="offer-steps">'+steps+'</div></section>',
    '</div>',
    '</main>'
  ].join('\n'),{
    description:copy.lede+' '+offerName+' starts at '+price+'.',
    canonical:'/offers/'+copy.slug,
    ogType:'website',
    ogImage:copy.shareImage||'',
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

export function renderPaymentHoldPage({slug='',orderKey='',noAttempt=false}={}){
  const safeSlug=/^[a-z0-9-]{1,80}$/.test(String(slug||''))?String(slug):'';
  const back=safeSlug?'/offers/'+encodeURIComponent(safeSlug):'/offers';
  const order=String(orderKey||'').trim().slice(0,100);
  const subject=encodeURIComponent('Evercraft Payments help'+(safeSlug?' | '+safeSlug:''));
  const message=noAttempt
    ?'The payment service was not contacted by this request. No order or charge was created by this attempt. You can contact Evercraft to arrange an approved manual invoice.'
    :'We could not confirm whether a checkout session was created. Do not make a second payment before checking your provider receipt or contacting Evercraft. No paid order or fulfillment is verified here.';
  return shell('Checkout needs assistance · Evercraft',[
    '<main>',
    '<section class="offer-hero">',
    '<div class="kicker"><span class="dot"></span> Evercraft Payments</div>',
    '<h1>'+ (noAttempt?'Checkout is temporarily unavailable.':'Checkout could not be confirmed.') +'</h1>',
    '<p class="lede">'+message+'</p>',
    '<div class="actions">',
    '<a class="btn primary" href="mailto:jessegaethle10@gmail.com?subject='+subject+'">Request payment assistance</a>',
    '<a class="btn" href="'+back+'">Return to the offer</a>',
    '<a class="btn" href="tel:+15097590440">Call Evercraft</a>',
    '</div>',
    order?'<div class="checkout-note">Reference to mention when contacting support: <code>'+escapeHtml(order)+'</code></div>':'',
    '</section>',
    '<section class="offer-panel">',
    '<h2>What happens next?</h2>',
    '<p>Evercraft can review the specific offer and discuss an approved invoice or another accepted payment method. This page does not automatically email you, create an invoice, take a charge, or begin fulfillment.</p>',
    '</section>',
    '</main>'
  ].join('\n'),{
    description:'Evercraft Payments checkout is unavailable or unverified. Request human assistance before paying again.',
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
  const heroActions=item.public_id==='earthworks-site-autonomy-study-v1'
    ? '<div class="actions"><a class="btn primary" href="/earthworks">Open Live Yard</a><a class="btn" href="mailto:jessegaethle10@gmail.com?subject=EarthWorks%20Site%20Autonomy%20Study&body=Company%3A%20%0ASite%3A%20%0AMaterial%20loop%3A%20%0AWhat%20is%20costing%20production%3A%20">Discuss one material loop</a><a class="btn" href="/capabilities">Browse all capabilities</a></div>'
    : '<div class="actions"><a class="btn primary" href="/offers">See simple offers</a><a class="btn" href="/capabilities">Browse all capabilities</a></div>';
  return shell(item.name+' · Evercraft Fabric',[
    '<main>',
    '<section class="hero">',
    '<div class="eyebrow">Evercraft capability</div>',
    '<h1>'+escapeHtml(item.name)+'</h1>',
    '<p class="lede">'+escapeHtml(item.description)+'</p>',
    heroActions,
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



export function renderAliEvLanding(){
  return shell('AliEV · EV infrastructure intelligence',[
    '<main>',
    '<section class="hero">',
    '<div class="kicker"><span class="dot"></span> AliEV intelligence layer</div>',
    '<h1>The engine behind<br>the EV decision.</h1>',
    '<p class="lede">AliEV is Evercraft\'s EV infrastructure intelligence and operating layer. It gathers and separates competition, traffic, utility, tariff, incentive, property, market and observed-session evidence for EV site decisions.</p>',
    '<div class="actions"><a class="btn primary" href="/capabilities/aliev-site-opportunity-snapshot-v1">Open AliEV capability</a></div>',
    '</section>',
    '<div class="trust">',
    '<div><strong>14 domains</strong><span>strict report coverage contract</span></div>',
    '<div><strong>Session-first</strong><span>observed usage is its own evidence class</span></div>',
    '<div><strong>Provider-neutral</strong><span>no single network defines the answer</span></div>',
    '<div><strong>Evidence-ready</strong><span>structured outputs preserve provenance and uncertainty</span></div>',
    '</div>',
    '<section><div class="eyebrow">What AliEV owns</div><h2>Depth without UI sprawl.</h2>',
    '<p class="sub">AliEV can get more sophisticated without forcing that complexity into every consuming workflow. New data, adapters, models and evidence sources enrich the underlying EV site intelligence.</p>',
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
