#!/usr/bin/env node
/**
 * Evercraft Fallen public merchant media scout.
 * Discovers candidate media URLs from public HTML metadata/tags.
 * It does NOT download source files or approve rights, faces, food authenticity,
 * or publication. Use the separate commercial asset-admission pipeline for that.
 */
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const MAX_HTML=2_000_000,MAX_LEADS=100,MAX_SOURCES=20;
const ENTITY={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
const decode=s=>String(s??'').replace(/&(#x[0-9a-f]+|#[0-9]+|amp|quot|apos|lt|gt|nbsp);/gi,(_m,k)=>{
 if(k[0]==='#'){const n=k[1]?.toLowerCase()==='x'?parseInt(k.slice(2),16):parseInt(k.slice(1),10);
   return n>0&&n<0x110000?String.fromCodePoint(n):'';}
 return ENTITY[k.toLowerCase()]??_m;
});
const attributes=raw=>{
 const attrs={};
 for(const m of raw.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))
   attrs[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);
 return attrs;
};
const forbiddenHost=host=>host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
 /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)||host.startsWith('[')||!host.includes('.');
export function safeUrl(value,base){
 try{const u=new URL(value,base);
  if(u.protocol!=='https:'||u.username||u.password||forbiddenHost(u.hostname))return null;
  u.hash='';return u.href;
 }catch{return null;}
}
export function collectLeads(html,pageUrl,{brand='',channel=''}={}){
 if(typeof html!=='string'||html.length>MAX_HTML)throw new Error('HTML too large or invalid');
 const page=safeUrl(pageUrl);if(!page)throw new Error('Source URL must be public HTTPS');
 const result=[],seen=new Set();
 function add(raw,kind,evidence){
  const url=safeUrl(raw,page);
  if(!url||seen.has(url)||result.length>=MAX_LEADS)return;
  if(/\.(?:svg|ico)(?:$|\?)/.test(new URL(url).pathname.toLowerCase()))return;
  seen.add(url);
  result.push({brand,source_page:page,channel,media_url:url,kind,evidence,
   status:'candidate_only',rights:'unverified',downloaded:false,verified_subject:false});
 }
 for(const tag of html.matchAll(/<meta\b[^>]*>/gi)){
  const a=attributes(tag[0]),prop=(a.property??a.name??'').toLowerCase();
  const kind=/^(?:og:video(?::url|:secure_url)?|twitter:player:stream)$/.test(prop)?'video':
   /^(?:og:image(?::url|:secure_url)?|twitter:image(?::src)?)$/.test(prop)?'image':null;
  if(kind&&a.content)add(a.content,kind,'metadata:'+prop);
 }
 for(const tag of html.matchAll(/<(?:img|video|source)\b[^>]*>/gi)){
  const raw=tag[0],a=attributes(raw),kind=/^<img\b/i.test(raw)?'image':'video';
  if(a['data-src']||a.src||a.poster)add(a['data-src']||a.src||a.poster,kind,kind+':tag');
  if(a.srcset){
   const candidates=a.srcset.split(',').map(x=>x.trim().split(/\s+/));
   const best=candidates.sort((x,y)=>parseFloat(y[1]||0)-parseFloat(x[1]||0))[0];
   if(best?.[0])add(best[0],kind,kind+':srcset');
  }
 }
 return result;
}
export async function scanSource(source,{fetcher=fetch}={}){
 const u=safeUrl(source.url);if(!u)throw new Error('Unsafe or invalid public source URL');
 const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),12000);
 try{
  const res=await fetcher(u,{signal:ctl.signal,
   headers:{Accept:'text/html','User-Agent':'Evercraft-Fallen-Public-Media-Scout/1.0'},redirect:'follow'});
  if(!res.ok)throw new Error('HTTP '+res.status);
  if(!safeUrl(res.url||u))throw new Error('Unsafe redirect URL');
  if(!String(res.headers.get('content-type')||'').toLowerCase().includes('text/html'))throw new Error('Source is not HTML');
  if(Number(res.headers.get('content-length')||0)>MAX_HTML)throw new Error('HTML exceeds limit');
  return collectLeads(await res.text(),res.url||u,source);
 }finally{clearTimeout(timeout);}
}
async function main(argv){
 if(argv.length<2)throw new Error('Usage: node merchant-public-media-scout.mjs sources.json output.json');
 const spec=JSON.parse(await fs.readFile(argv[0],'utf8'));
 if(!Array.isArray(spec.sources)||spec.sources.length>MAX_SOURCES)throw new Error('Invalid source list');
 const leads=[],errors=[];
 for(const src of spec.sources){
  try{leads.push(...await scanSource(src));}
  catch(e){errors.push({brand:src.brand,url:src.url,error:String(e.message)});}
 }
 const result={schema:'evercraft.fallen.public-media-leads.v1',created_at:new Date().toISOString(),
  warning:'Discovery only. Unverified media is NOT an approved commercial asset.',leads,errors};
 await fs.writeFile(argv[1],JSON.stringify(result,null,2));
 process.stdout.write(JSON.stringify({sources:spec.sources.length,leads:leads.length,errors:errors.length,output:argv[1]})+'\n');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
}