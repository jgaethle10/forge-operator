// Internal only: prepares truthful, independently branded, per-property SEO and
// AI-readable assets for eventual independent-domain publication. Never
// re-enables indexing, and never cross-links to the corporate operator.
// No adult or sexual content belongs on these family-facing sites.
import fs from 'node:fs';
import path from 'node:path';

const seed={
 partscout:{
  brand:'PartScout',title:'How to Research a Discontinued Replacement Part',slug:'research-discontinued-replacement-parts',
  description:'Document model numbers, markings, dimensions and seller terms before ordering an obsolete part.',
  intro:'A part that looks right in a photograph can still have the wrong revision, rating or connector. Use an evidence trail rather than a visual guess.',
  sections:[
   ['Start with exact equipment identity','Record manufacturer, equipment model, serial or VIN where relevant, production variation and prior replacements. The machine label is usually a more reliable starting point than generic marketplace keywords. Photograph every legible mark.'],
   ['Capture the part itself','Note stamped codes, connectors, thread dimensions, shaft geometry, rated voltage where applicable and orientation. An apparently identical housing may conceal a different mounting pattern or material specification. Ask for trained help before dismantling safety-critical systems.'],
   ['Trace documented replacements','Search OEM catalogs, service bulletins and formal supersession records. A vendor cross-reference is not conclusive without source evidence. Describe unverified matches as candidates, not confirmed compatible parts.'],
   ['Check transaction downside','Before ordering, record actual stock, quoted shipping, core charges, return policy, warranty and seller contact details. A nominally cheaper part may cost more after a failed installation or return.'],
   ['Record the final fitment decision','Save who verified compatibility and when, alongside reference images and part numbers. For safety-critical equipment confirm with the manufacturer or a qualified professional.']
  ]
 },
 valuescout:{
  brand:'Value Scout',title:'How to Evaluate a Collectible Deal After Selling Costs',slug:'evaluate-collectible-resale-margin',
  description:'Use completed comparable sales, condition evidence and resale costs to examine whether a collectible is actually underpriced.',
  intro:'An attractive seller asking price is not evidence of a profit opportunity. Resale depends on what similar items actually sold for and what it costs to complete the sale.',
  sections:[
   ['Compare completed sales','Collect recent completed sales for the same edition, grade, condition and accessories. Ignore unsold listings as evidence of a realized market price.'],
   ['Account for condition and authenticity','Record scratches, grading uncertainty, packaging and seller guarantees. An authenticity claim without provenance can change the risk of the entire transaction.'],
   ['Model all variable costs','Include marketplace commission, payment charges, packaging, postage, insurance and applicable taxes. Add a return or dispute allowance rather than assuming every sale is final.'],
   ['Consider how long the asset might sit','Slow resale creates cash-flow risk. A positive nominal margin does not mean the item will sell on demand. Compare optimistic and conservative prices.'],
   ['Set a disciplined maximum buy','Work backward from estimated net resale proceeds to a defensible acquisition ceiling. An estimate is neither a guaranteed resale price nor investment advice.']
  ]
 },
 'playbook-lab':{
  brand:'Playbook Lab',title:'How Two Football Concepts Stress a Defense Differently',slug:'verticals-versus-inside-zone',
  description:'Compare a simplified vertical passing concept with an inside-zone run without pretending a synthetic diagram is real game film.',
  intro:'The same field looks different when an offense attacks coverage depth versus interior run gaps. A teaching diagram can make those distinctions clear.',
  sections:[
   ['Understand what a concept shows','A play diagram is a simplified decision model. Real outcomes depend on blocking, alignment, defensive disguise, coaching rules and execution.'],
   ['Vertical concepts and deep-space stress','Receivers threaten different deep zones and seams, requiring a defender to preserve leverage. The quarterback must assess the defensive shell and the timing of available throws.'],
   ['Inside-zone concepts and crease selection','The offensive line works through assigned blocking relationships and a running back reads available gaps. Scheme and personnel change the precise assignments.'],
   ['Avoid copying protected footage','Use independently authored diagrams or properly licensed game footage. No real team affiliation or coaching credential is inferred from a synthetic board.'],
   ['Teach with decision questions','Ask what defenders must prioritize, what the offensive player reads, and how an adjustment changes the concept. Use the interactive board for explanation, not predictions.']
  ]
 },
 'site-rescue':{
  brand:'Site Rescue',title:'Where a Small Business Website Loses Inquiries',slug:'website-lead-leak-audit',
  description:'Check contact-form delivery, mobile calls to action and conversion assumptions before paying for additional traffic.',
  intro:'A site can attract visitors and still miss serious customers if its inquiry flow is broken. Diagnose the journey before spending on another advertisement.',
  sections:[
   ['Test the actual contact path','Submit a legitimate test inquiry on desktop and mobile and check inbox delivery. Monitor spam filters and the follow-up time from the responsible owner.'],
   ['Check mobile clarity','Verify the main contact action is visible and tappable on small screens, without popups obscuring the phone number or request form.'],
   ['Treat conversion math as a scenario','Visitors multiplied by an assumed lead rate describes a model, not a guarantee. Compare assumptions to your own verified analytics.'],
   ['Reduce uncertainty in the offer','Explain the service area, what the business performs, how estimates work and what a prospective customer should do next.'],
   ['Measure actual inquiries','Use authorized analytics and form receipts, with consent where needed. Do not treat pageviews, modelled leads or spam submissions as paid customers.']
  ]
 },
 'creative-studio':{
  brand:'Ad Story Studio',title:'Build a Clear 15-Second Commercial Treatment',slug:'fifteen-second-commercial-structure',
  description:'Design a short original commercial around a single audience problem, a credible demonstration and one next action.',
  intro:'Strong short-form creative is not a list of features set to music. It gives an audience one problem, one useful reason to believe and one clear next step.',
  sections:[
   ['First five seconds: recognizable friction','Start where viewers already understand the pain. Avoid generic scenes that could advertise any business.'],
   ['Middle five seconds: visible proof','Show the product or service solving that problem. If using visualized or synthetic footage, label it when viewers could mistake it for a factual demonstration.'],
   ['Final five seconds: one action','A single explicit next step is easier to remember than a series of competing offers and slogans.'],
   ['Match format to distribution','Text-safe zones, aspect ratio and audio accessibility differ across placements. Prepare platform-native crops rather than relying on an automatic cut.'],
   ['Clear rights before publication','Own or license music, voice, fonts, footage and photography. A storyboard treatment is not itself a rendered or paid-for commercial.']
  ]
 },
 'publisher-lab':{
  brand:'Publisher Lab',title:'What Website Traffic Might Earn After Real Costs',slug:'publisher-ads-affiliates-sponsor-math',
  description:'Separate modeled display-ad income, approved affiliate earnings, signed sponsor revenue and the costs of acquiring visitors.',
  intro:'Traffic is a starting point, not a paycheck. Publishers need a transparent economic model tied to genuinely earned pageviews and contractual revenue.',
  sections:[
   ['Calculate eligible advertising inventory','Ad RPM is revenue per thousand monetized pageviews. Do not multiply by all visitors without accounting for actual viewed pages and eligible ads.'],
   ['Treat affiliate commissions separately','Only approved publisher accounts with valid tracking links can earn commissions. Product prices and simple retailer URLs do not prove affiliate entitlement.'],
   ['Count signed sponsorships only','A potential sponsor or draft email is not contracted revenue. Verify deliverables, disclosures, payment terms and rights.'],
   ['Subtract acquisition and infrastructure costs','Hosting, writing, video, paid campaigns, tools, taxes and payment fees affect profitability. More visitors can still result in a cash loss.'],
   ['Use real receipts','Distinguish traffic, clicks, attributed conversions, cleared commissions and deposited payouts. Keep advertiser independence and privacy standards.']
  ]
 },
 'relay-notes':{
  brand:'Meeting Relay',title:'Turn Meeting Notes Into Accountable Action Items',slug:'meeting-decisions-owner-deadline-checklist',
  description:'Document a decision, a responsible owner, a deadline and unresolved questions without claiming everyone agreed.',
  intro:'A transcript preserves words, but a useful action record needs explicit ownership and acknowledgement.',
  sections:[
   ['Separate decisions from suggestions','A good meeting summary clearly labels what was approved, debated and postponed. Never turn a personal suggestion into a group commitment.'],
   ['Name the responsible role','Assign each action to a person or accountable team, rather than saying everyone owns it.'],
   ['Add due dates with context','A target date should be accepted by the owner. Note dependencies and what could prevent completion.'],
   ['Preserve unresolved disagreement','Record the open question, the person responsible for resolving it, and the next decision meeting.'],
   ['Seek participant acknowledgement','A draft authored by one person stays a draft until participants review and confirm their obligations.']
  ]
 },
 'pet-play':{
  brand:'Pet Play Planner',title:'Plan a Sensible Pet Toy Replacement Budget',slug:'pet-toy-budget-and-rotation',
  description:'Model toy replacement frequency using pet count, actual product costs and safety-related inspection.',
  intro:'The cheapest toy is not automatically a good toy. Buying decisions should consider actual use, durability, supervision and the animal’s needs.',
  sections:[
   ['Know your pet’s play style','Size, chewing behavior, age and health can change what is suitable. Consult a veterinarian about relevant medical risks rather than relying on price alone.'],
   ['Use a replacement schedule, not impulse buying','Estimate how frequently worn toys truly need replacement. Inspect existing toys before discarding products that are still safe.'],
   ['Include the actual purchase cost','Multiply the expected number of replacements by prices you can verify. Add delivery and recurring replacement parts where needed.'],
   ['Prioritize safety over the model','Remove damaged toys, supervise play and follow manufacturer instructions. This calculator does not rate toys or predict injury.'],
   ['Track spending and actual useful life','Record which designs lasted and which were not engaging. Better historical evidence improves your future budget.']
  ]
 },
 'tool-rent-or-buy':{
  brand:'Tool Economics',title:'Tool Rental or Purchase: Work Out Your Break-Even Point',slug:'rent-or-buy-shop-tool',
  description:'Compare rental and ownership costs for occasional workshop equipment using real quotes.',
  intro:'Owning a tool is useful only when the work and long-term costs justify keeping it. Break-even math helps separate actual needs from tool-shopping excitement.',
  sections:[
   ['Price the same job both ways','Include rental rate, actual days needed, shipping or pickup and any late penalties. Compare with the correct purchase model and required accessories.'],
   ['Model expected use conservatively','Estimate how many paid jobs genuinely need the tool in the period. A hypothetical future contract should not count as guaranteed usage.'],
   ['Add overhead','Ownership also involves storage, inspection, repairs, financing and depreciation. Rental may carry damage-waiver charges and deposits.'],
   ['Calculate the crossover','Compare estimated all-in rental spending over the planning horizon to purchase plus maintenance and storage. Neither estimate guarantees work.'],
   ['Check training and safety','Some equipment needs instruction, protective equipment or supervision. The cheapest ownership route is irrelevant if it creates an unsafe operation.']
  ]
 },
 'auto-fitment':{
  brand:'Auto Part Cost Check',title:'Estimate the Real Cost of a Wrong-Fit Auto Part',slug:'car-part-core-shipping-return-cost',
  description:'Understand core deposits, shipping, refund terms and possible rework alongside verified automotive fitment.',
  intro:'A part might be cheap to purchase and expensive to return or reinstall. Track those costs while treating compatibility as a separate question.',
  sections:[
   ['Verify vehicle information','Use VIN, trim, engine specification and original part number as appropriate. Model-year alone can hide multiple incompatible options.'],
   ['Record upfront charges','Add the quoted part price, shipping, tax and any refundable core deposit. Money spent up front is not the same as final net cost.'],
   ['Understand core conditions','Read the seller’s requirements for acceptable returned cores and refund deadlines. A deposit is not a guaranteed refund.'],
   ['Include a wrong-fit downside scenario','Consider return postage, restocking and additional labor if the original installation had to be repeated. The probability input is a hypothetical estimate, not fitment evidence.'],
   ['Seek manufacturer or professional verification','For braking, steering, safety or electrical systems, use authorized technical information and qualified help before installation.']
  ]
 }
};

const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function addIndependentSeoMesh({slug,origin,destination}){
 const data=seed[slug];if(!data)throw new Error('independent_seo_niche_unknown');
 const index=destination+'/index.html';let home=fs.readFileSync(index,'utf8');
 if(!home.includes('content="noindex,follow"'))throw new Error('independent_seo_premature_indexing');
 if(/evercraft|jessegaethle10|forge-operator|fabric\.systemiacommandcenters/i.test(home))throw new Error('independent_seo_parent_leak');
 const target='/guides/'+data.slug+'/';
 const metadata={
   '@context':'https://schema.org','@type':'WebSite',name:data.brand,url:origin+'/',
   description:data.description
 };
 const script='<script type="application/ld+json">'+JSON.stringify(metadata).replace(/</g,'\\u003c')+'</script>';
 if(!home.includes('application/ld+json'))home=home.replace('</head>',script+'</head>');
 const link='<section aria-label="Educational guide" style="padding:24px;max-width:960px;margin:auto"><h2>Learn before you buy or act</h2><p>'+esc(data.description)+'</p><a href="'+target+'index.html">Read: '+esc(data.title)+'</a></section>';
 if(!home.includes('</main>'))throw new Error('independent_seo_main_missing');
 home=home.replace('</main>',link+'</main>');
 fs.writeFileSync(index,home);
 const articleUrl=origin+target+'index.html';
 const structured={'@context':'https://schema.org','@type':'Article',headline:data.title,
   description:data.description,mainEntityOfPage:articleUrl,
   author:{'@type':'Organization',name:data.brand},
   publisher:{'@type':'Organization',name:data.brand}};
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>'+esc(data.title)+' | '+esc(data.brand)+'</title><meta name="description" content="'+esc(data.description)+'"><link rel="canonical" href="'+articleUrl+'"><script type="application/ld+json">'+JSON.stringify(structured).replace(/</g,'\\u003c')+'</script><link rel="stylesheet" href="/assets/site.css"><style>.seo-page{max-width:890px;width:calc(100% - 36px);margin:30px auto 80px;line-height:1.75}.seo-page p{max-width:760px}.seo-page section{margin:32px 0}.seo-page h1{font-size:clamp(2rem,6vw,3.4rem);line-height:1.15}.seo-page h2{font-size:1.35rem}</style></head><body><main class="seo-page"><p><a href="/">← '+esc(data.brand)+'</a></p><h1>'+esc(data.title)+'</h1><p>'+esc(data.intro)+'</p>'+data.sections.map(([heading,paragraph])=>'<section><h2>'+esc(heading)+'</h2><p>'+esc(paragraph)+'</p></section>').join('')+'<p><a href="/">Try the original free browser tool</a></p><p><small>Independent educational content. No retailer partnership, product certification, guaranteed profit or paid checkout is claimed.</small></p></main></body></html>';
 const articlePath=destination+target+'index.html';
 fs.mkdirSync(path.dirname(articlePath),{recursive:true});
 fs.writeFileSync(articlePath,html);
 const llms=['# '+data.brand,'> '+data.description,'','Base URL: '+origin+'/','Status: independent website export only; not yet published, merchant approved, or search-indexable.','', '## Pages','- [Interactive free utility]('+origin+'/)','- ['+data.title+']('+articleUrl+'): '+data.intro,'','## Indexing state','Prepared for a genuinely independent origin; robots.txt currently blocks all crawlers. Search/AI indexing and distribution require operator activation after ownership, compliance and partner checks.'].join('\n');
 fs.writeFileSync(destination+'/llms.txt',llms+'\n');
 fs.writeFileSync(destination+'/discovery.json',JSON.stringify({
   schema:'independent.publisher.discovery.v1',brand:data.brand,origin,
   published:false,indexable:false,affiliate_links_active:false,verified_revenue:false,
   homepage:origin+'/',guides:[{title:data.title,url:articleUrl,summary:data.description}],
   checkout_status:'not_verified'
 },null,2)+'\n');
 // Draft only: never submit a sitemap until index/robots policy changes.
 fs.writeFileSync(destination+'/sitemap-draft.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+origin+'/</loc></url><url><loc>'+articleUrl+'</loc></url></urlset>\n');
 return {guide:target+'index.html',status:'staged_noindex',pages:2};
}
