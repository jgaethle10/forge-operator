// Source-only promotion transform for Wheel Lab's held, first-party public preview.
// Offline prototypes remain network-free. This module only generates optional
// user-click links and never fetches, sends, collects, redirects or publishes.
export const FINDMYPART_PUBLIC_URL='https://fabric.systemiacommandcenters.com/findmypart/';
export const FMP_REL='noopener noreferrer';

const NOINDEX='<meta name="robots" content="noindex,nofollow,noarchive">';
const LINK='<a class="findmypart-referral" href="'+FINDMYPART_PUBLIC_URL+'" target="_blank" rel="'+FMP_REL+'" referrerpolicy="no-referrer">Explore FindMyPart research</a>';

function replaceExactlyOnce(html, anchor, replacement) {
  if(typeof html!=='string'||html.split(anchor).length!==2)throw Error('Wheel Lab stage anchor mismatch: '+anchor.slice(0,42));
  return html.replace(anchor,replacement);
}

export function stageWheelLabMarkup(file,source) {
  if(!['index.html','merchant-desk.html'].includes(file))throw Error('Unsupported Wheel Lab source file');
  const noindexed=replaceExactlyOnce(source,'<head>','<head>\n'+NOINDEX);
  if(file==='index.html'){
    const bridge='<div class="sourcing-bridge" style="margin-top:12px;padding:14px;border:1px solid #597649;border-radius:12px;background:#152218;color:#e2eddb;font-size:12px;line-height:1.6"><strong>Need help researching an actual hard-to-find part?</strong><p style="margin:7px 0 10px;color:#b9c9b5">FindMyPart is a separate Evercraft parts-research service. It does not guarantee wheel availability or vehicle compatibility. Opening it is optional. No Wheel Lab choices, notes, files or customer information are transferred.</p>'+LINK+'</div>';
    return replaceExactlyOnce(noindexed,'<div class="footnote">Proof only:',bridge+'\n<div class="footnote">Proof only:');
  }
  const bridge='<p class="small">For independent parts research, '+LINK+'. Opens a separate Evercraft service only when clicked. No quote, customer details or concept file is transmitted by Wheel Lab.</p>\n';
  return replaceExactlyOnce(noindexed,'<p id="message" role="status" aria-live="polite"></p>',bridge+'<p id="message" role="status" aria-live="polite"></p>');
}
