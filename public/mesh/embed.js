/* Evercraft Audience Mesh partner card v1.
   One consented referral link, no cookies, pixels, user profiling or network calls.
   Requires publisher authorization. Link parameters are NOT verified payout attribution. */
(function(){
'use strict';
const script=document.currentScript;
if(!script || !script.parentNode)return;
const offerings={
  findmypart:{name:'Find a difficult or discontinued part',note:'Human-reviewed sourcing hunt from $19',slug:'findmypart'},
  'website-audit':{name:'Fix a leaky website sales funnel',note:'Evercraft website conversion audit: $49',slug:'website-audit'}
};
const chosen=(script.getAttribute('data-evercraft-offer')||'findmypart').toLowerCase();
const offer=offerings[chosen]||offerings.findmypart;
const partner=(script.getAttribute('data-evercraft-partner')||'publisher').replace(/[^a-z0-9_-]/gi,'').slice(0,40)||'publisher';
const url=new URL('https://fabric.systemiacommandcenters.com/offers/'+offer.slug);
url.searchParams.set('utm_source','partner_'+partner);
url.searchParams.set('utm_medium','referral_widget');
url.searchParams.set('utm_campaign',offer.slug);
const root=document.createElement('aside');
root.setAttribute('aria-label','Evercraft service recommendation');
root.style.cssText='box-sizing:border-box;max-width:420px;padding:18px 20px;margin:16px 0;border:1px solid #536b74;border-radius:13px;background:#0e2730;color:#f0fcfa;font:15px/1.5 system-ui,-apple-system,sans-serif';
const label=document.createElement('div');label.textContent='EVERCRAFT · PARTNER RESOURCE';label.style.cssText='letter-spacing:.12em;font-weight:800;font-size:10px;color:#8de6ce;margin-bottom:10px';
const heading=document.createElement('strong');heading.textContent=offer.name;heading.style.cssText='display:block;font-size:19px;line-height:1.25';
const note=document.createElement('p');note.textContent=offer.note;note.style.cssText='margin:10px 0;color:#c2d9d7';
const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer sponsored';link.textContent='Review this service →';link.style.cssText='display:inline-block;padding:10px 14px;border-radius:8px;background:#8de6ce;color:#06251f;font-weight:750;text-decoration:none';
const disclosure=document.createElement('div');disclosure.textContent='Informational service link. No purchase or results guaranteed. Referrals may be compensated only under a separately signed agreement.';disclosure.style.cssText='margin-top:12px;font-size:11px;color:#b4c9c9';
root.append(label,heading,note,link,disclosure);
script.parentNode.insertBefore(root,script);
})();
