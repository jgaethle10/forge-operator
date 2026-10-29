import { FORENSISCOPE_OFFERS } from '../forensiscope/commercial-offers.mjs';

const TIERS=Object.freeze([
  {label:'Up to 5 minutes',description:'A short recording with one clear review goal.'},
  {label:'Up to 30 minutes',description:'A meeting, interview, or focused recording.'},
  {label:'Up to 2 hours',description:'A longer session, interview, or footage set.'},
  {label:'Up to 6 hours',description:'A multi-hour timeline or recording review.'},
  {label:'Up to 12 hours',description:'An extended, scoped media review.'},
]);
const EMAIL='jessegaethle10@gmail.com';
function escapeHtml(value){
 return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function requestUrl(tier){
 const subject='ForensiScope | '+tier.label+' | Request review';
 const body=['I would like to request a ForensiScope review.',
  'Recording length: '+tier.label,
  'File type: ',
  'What I need to find or understand: ',
  'I have the legal right or authority to submit this material: ',
  '',
  'Please confirm scope, secure intake, availability and Evercraft Payments before invoicing.',
  'I will not email the media file or sensitive evidence.'].join('\n');
 return 'mailto:'+EMAIL+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
}
export function renderForensiScopeBuyerPage(){
 const cards=FORENSISCOPE_OFFERS.map((tier,index)=>{
  const info=TIERS[index];
  return '<article class="tier"><div class="length">'+escapeHtml(info.label)+'</div>'
    +'<div class="price">$'+tier.amount_usd+'</div><p>'+escapeHtml(info.description)+'</p>'
    +'<a class="choose" href="'+escapeHtml(requestUrl(info))+'">Request review</a></article>';
 }).join('');
 return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ForensiScope | Understand the whole recording</title>
<meta name="description" content="ForensiScope by Evercraft helps turn long authorized video and audio into traceable transcripts, searchable timestamps, and repeat-segment findings. Choose a review tier and request secure intake.">
<meta name="robots" content="index,follow">
<meta name="theme-color" content="#080b14">
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:dark}
*{box-sizing:border-box}body{background:#080b14;color:#f4f7fb;margin:0}
main{width:min(1020px,calc(100% - 36px));margin:0 auto}header{padding:25px 0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #28303c;gap:16px}
a{color:inherit}header a{text-decoration:none;color:#bacadd;font-size:13px}
.brand{font-weight:800;letter-spacing:-.045em;font-size:22px}.brand span{color:#62d4d7}
.hero{max-width:810px;padding:86px 0 46px}.eyebrow{text-transform:uppercase;letter-spacing:.16em;color:#72dadd;font-weight:750;font-size:12px}
h1{font-size:clamp(44px,8vw,82px);line-height:.99;letter-spacing:-.065em;margin:19px 0 22px}
.lede{font-size:clamp(18px,2.4vw,23px);line-height:1.55;color:#b6c5d3;max-width:690px}
.details{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:4px 0 60px}
.details div,.tier,.note{border:1px solid #273544;border-radius:18px;background:#101724;padding:21px}
.details strong{display:block;margin-bottom:7px}.details p,.tier p,.note p{color:#b6c5d3;line-height:1.55;font-size:14px;margin:0}
h2{font-size:clamp(30px,5vw,45px);letter-spacing:-.045em;margin:0 0 9px}
.sub{color:#b6c5d3;margin:0 0 20px;line-height:1.6}
.tiers{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.tier{display:flex;flex-direction:column;min-width:0;padding:18px}
.length{font-size:14px;font-weight:700;color:#c9d7e5}.price{font-size:34px;font-weight:800;letter-spacing:-.04em;margin:14px 0}
.tier p{flex:1;min-height:83px}.choose{display:block;text-align:center;margin-top:20px;border-radius:11px;background:#59d6d0;color:#07111c;font-weight:750;text-decoration:none;padding:12px 9px;font-size:13px}
.choose:hover{background:#89f0e8}.note{margin:25px 0 60px}.note strong{display:block;margin-bottom:8px}
footer{padding:28px 0 38px;color:#8193a7;font-size:13px;border-top:1px solid #273544}
@media(max-width:880px){.tiers{grid-template-columns:repeat(2,1fr)}.details{grid-template-columns:1fr}.hero{padding-top:60px}}
@media(max-width:540px){.tiers{grid-template-columns:1fr}.tier p{min-height:auto}.hero{padding-top:45px}h1{font-size:clamp(43px,13vw,70px)}}
</style></head><body><main>
<header><div class="brand">Forensi<span>Scope</span></div><a href="/capabilities/forensiscope-evidence-review-v1">Technical details</a></header>
<section class="hero"><div class="eyebrow">Evercraft · Media intelligence</div>
<h1>Understand the whole recording.</h1>
<p class="lede">Long video or audio, organized into a traceable timeline. Find relevant moments, searchable transcript segments, and repeated footage without losing the connection to the original source.</p></section>
<section class="details" aria-label="Capabilities">
<div><strong>Find the moments</strong><p>Navigate timestamped findings and recover the source context.</p></div>
<div><strong>Search the recording</strong><p>Work toward a searchable transcript and structured media review.</p></div>
<div><strong>Spot repeated footage</strong><p>Compare duplicate and near-duplicate segments for human review.</p></div>
</section>
<section aria-label="Pricing"><h2>Choose the footage length.</h2>
<p class="sub">Published review tiers. Confirm the exact scope, secure transfer method, file capacity and available delivery window before invoicing.</p>
<div class="tiers">${cards}</div></section>
<section class="note"><strong>Private footage stays under your control.</strong>
<p>Do not email media files, sensitive evidence, passwords, or private recordings. Your request opens your own email app with a short description only. We confirm authorization, secure intake and an exact Evercraft Payments invoice before accepting any material. Requesting review does not charge you or guarantee availability. ForensiScope does not identify unknown people or certify legal admissibility.</p>
</section>
<footer>ForensiScope by Evercraft LLC · Human-confirmed review · Evercraft Payments is the payment authority</footer>
</main></body></html>`;
}
