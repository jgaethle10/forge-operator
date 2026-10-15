// Public-web buyer inputs for the $49 Website Audit. Parsing only, not DNS or ownership proof.
const DENIED_SUFFIXES=new Set(['localhost','local','internal','test','invalid','example','arpa','onion','home','lan']);
export function auditWebsiteHost(raw){
  if(typeof raw!=='string'||raw.length>1000||raw.trim().length<6)return '';
  let input=raw.trim();
  if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(input))input='https://'+input;
  let url;try{url=new URL(input)}catch{return ''}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)return '';
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(!host||host.length>253||host.startsWith('[')||host.includes(':')||/^\d+(?:\.\d+){0,3}$/.test(host))return '';
  const labels=host.split('.');
  if(labels.length<2||labels.some(x=>!x||x.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x)))return '';
  const suffix=labels.at(-1);
  if(suffix.length<2||/^\d+$/.test(suffix)||DENIED_SUFFIXES.has(suffix))return '';
  if(labels.some(x=>x==='metadata'||x==='localhost'))return '';
  return host.replace(/^www\./,'');
}
export function normalizeAuditEmail(raw){
  if(typeof raw!=='string'||raw.length>254)return '';
  const s=raw.trim().toLowerCase();
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(s)?s:'';
}
export function admitAuditBuyer({customer_ref,website_url}={}){
  const email=normalizeAuditEmail(customer_ref);
  const domain=auditWebsiteHost(website_url);
  if(!email)return {ok:false,reason:'attributable_customer_email_required'};
  if(!domain)return {ok:false,reason:'public_https_website_required'};
  return {ok:true,customer_ref:email,website_url:'https://'+domain+'/',audited_domain:domain};
}
