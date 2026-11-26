// Only public notice destinations observed in the official CanadaBuys feed.
export function canadaNoticeUrl(value){
 let u;try{u=new URL(value);}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 const host=u.hostname,path=u.pathname;
 const allowed=
 (host==='canadabuys.canada.ca'&&/^\/(en|fr)\/tender-opportunities\/.+/.test(path))||
 (host==='www.merx.com'&&/^\/public\/solicitations\/.+/.test(path))||
 (host==='discovery.ariba.com'&&/^\/rfx\/\d+\/?$/.test(path))||
 (host==='portal.us.bn.cloud.ariba.com'&&/^\/dashboard\/public(?:\/|$)/.test(path));
 if(!allowed)return null;
 u.hash='';
 return u;
}
