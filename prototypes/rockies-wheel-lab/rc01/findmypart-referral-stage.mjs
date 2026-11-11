// Source-only promotion transform for Wheel Lab's held, first-party public preview.
// Offline prototypes remain network-free. This module only generates optional
// user-click links and never fetches, sends, collects, redirects or publishes.
export const FINDMYPART_PUBLIC_URL='https://fabric.systemiacommandcenters.com/findmypart/';
export const FMP_REL='noopener noreferrer';

const NOINDEX='<meta name="robots" content="noindex,nofollow,noarchive">';
const LINK='<a class="findmypart-referral" href="'+FINDMYPART_PUBLIC_URL+'" target="_blank" rel="'+FMP_REL+'" referrerpolicy="no-referrer" style="display:inline-flex;align-items:center;border:1px solid #e8ff73;border-radius:8px;padding:10px 12px;color:#e8ff73;background:#162116;text-decoration:none;font-weight:800;line-height:1.3">Explore FindMyPart research</a>';

function replaceExactlyOnce(html, anchor, replacement) {
  if(typeof html!=='string'||html.split(anchor).length!==2)throw Error('Wheel Lab stage anchor mismatch: '+anchor.slice(0,42));
  return html.replace(anchor,replacement);
}

export function stageWheelLabMarkup(file,source) {
  if(!['index.    const interestEnd='<p>Separate FindMyPart sourcing research may help. Checking this saves a note in your downloaded concept only. It does not open a website, submit an inquiry, verify compatibility, or share your details.</p></div>';
    const withLink='<p>Separate FindMyPart sourcing research may help. Checking this saves a note in your downloaded concept only. It does not open a website, submit an inquiry, verify compatibility, or share your details.</p><p style="margin:8px 0 10px;color:#bdcdb8">Or explore FindMyPart separately. Opening the link is your choice; no Wheel Lab choices, notes, files or customer information are transferred.</p>'+LINK+'</div>';
    return replaceExactlyOnce(noindexed,interestEnd,withLink);
  }
  const bridge='<p class="small">For independent parts research, '+LINK+'. Opens a separate Evercraft service only when clicked. No quote, customer details or concept file is transmitted by Wheel Lab.</p>\n';
  return replaceExactlyOnce(noindexed,'<p id="message" role="status" aria-live="polite"></p>',bridge+'<p id="message" role="status" aria-live="polite"></p>');
}
