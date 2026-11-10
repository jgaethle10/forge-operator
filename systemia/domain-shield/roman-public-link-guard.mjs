/**
 * Public hyperlink continuity gate: no Evercraft-owned static frontend may
 * knowingly link visitors to the retired voteroman.com apex or www.
 * Narrowly validates navigable HTML href/action and explicit JS navigation,
 * never alters user content, DNS, campaign copy, emails or donations.
 */
import fs from 'node:fs';
import path from 'node:path';
export const RECOVERY_ENTRY = 'https://fabric.systemiacommandcenters.com/go/roman';
export const SECONDARY_ENTRY = 'https://headless-jhpvqnpgxlh-sociallyguud-140c.wix-site-host.com/';
const BAD_HOSTS=new Set(['voteroman.com','www.voteroman.com']);
const ATTR=/<(?:a|area|form)\b[^>]*\b(?:href|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const JS=/\b(?:window\.)?location(?:\.href)?\s*=\s*["'](https?:\/\/[^"']+)["']|\b(?:location\.assign|location\.replace|window\.open)\(\s*["'](https?:\/\/[^"']+)["']/gi;
export function isBrokenOriginalUrl(raw){
 try{const u=new URL(String(raw));return ['https:','http:'].includes(u.protocol)&&BAD_HOSTS.has(u.hostname.toLowerCase());}
 catch{return false;}
}
export function findUnsafeLinks(content,filename=''){
 const problems=[];
 for(const match of String(content).matchAll(ATTR)){
   const target=match[1]??match[2]??match[3]??'';
   if(isBrokenOriginalUrl(target))problems.push({file:filename,type:'public_link',target});
 }
 for(const match of String(content).matchAll(JS)){
   const target=match[1]??match[2]??'';
   if(isBrokenOriginalUrl(target))problems.push({file:filename,type:'explicit_navigation',target});
 }
 return problems;
}
function walk(dir,root){
 if(!fs.existsSync(dir))return[];
 const result=[];
 for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,ent.name);
  if(ent.isDirectory()&&!ent.isSymbolicLink())result.push(...walk(full,root));
  else if(ent.isFile()&&/\.(?:html?|js|mjs)$/i.test(ent.name)){
   const stat=fs.statSync(full);
   if(stat.size>2*1024*1024)continue;
   result.push({file:path.relative(root,full).replaceAll(path.sep,'/'),text:fs.readFileSync(full,'utf8')});
  }
 }
 return result;
}
export function auditPublicLinks(rootDir){
 const pages=walk(path.join(rootDir,'public'),rootDir);
 const errors=pages.flatMap(p=>findUnsafeLinks(p.text,p.file));
 return {schema:'evercraft.roman.public-link-continuity.v1',files_scanned:pages.length,broken_apex_public_links:errors.length,errors,recovery_entry:RECOVERY_ENTRY,independent_backup:SECONDARY_ENTRY,original_domain_globally_repaired:false};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href){
 const res=auditPublicLinks(process.cwd());
 process.stdout.write(JSON.stringify(res,null,2)+'\n');
 if(res.errors.length)process.exitCode=1;
}
