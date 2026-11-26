// Standalone function serializable by Playwright. Bounded DOM observation,
// no network calls, navigation, scripts from page content or contact authority.
export function collectPublicDocumentLinks(){
 const anchors=document.querySelectorAll('a[href]'),scanLimit=5000,outputLimit=150;
 const candidates=[],seen=new Set();
 for(let i=0;i<Math.min(anchors.length,scanLimit);i++){
  const node=anchors[i];let u;
  try{u=new URL(node.href);}catch{continue;}
  if(u.origin!==location.origin||u.protocol!=='https:'||u.username||u.password||u.search||!(/\.(pdf|docx)$/i.test(u.pathname)))continue;
  u.hash='';
  if(seen.has(u.href))continue;seen.add(u.href);
  const text=String(node.textContent||'').replace(/\s+/g,' ').trim().slice(0,200);
  let name;try{name=decodeURIComponent(u.pathname);}catch{name=u.pathname;}
  const words=(name+' '+text).toLowerCase().replace(/[^a-z0-9]+/g,' ');
  const solicitation=/\b(?:rfp|rfq|rfi|solicitation|tender|addendum|addenda|invitation to bid|request for proposals?|request for qualifications?|request for quotations?)\b/.test(words);
  candidates.push({href:u.href,text,rank:solicitation?0:1});
 }
 candidates.sort((a,b)=>a.rank-b.rank);
 return {links:candidates.slice(0,outputLimit).map(({href,text})=>({href,text})),anchors_total:anchors.length,anchors_scanned:Math.min(anchors.length,scanLimit),eligible_count:candidates.length,scan_truncated:anchors.length>scanLimit,output_truncated:candidates.length>outputLimit};
}
