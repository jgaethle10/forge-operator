import fs from 'node:fs';
import path from 'node:path';
// The local compute owner supplies fixed trusted source/cache roots, not a remote caller.
// A missing native runtime leaves the document worker usable without source refresh.
export function publicDemandRefreshBindings({enabled=false,sourceDir,browsersPath}={}){
 const empty={SYSTEMIA_PUBLIC_DEMAND_BROWSER_SOURCE:'',SYSTEMIA_PUBLIC_DEMAND_BROWSER_CACHE:''};
 if(enabled!==true)return empty;
 try{
  for(const dir of [sourceDir,browsersPath]){
   if(typeof dir!=='string'||!path.isAbsolute(dir)||fs.realpathSync(dir)!==dir)return empty;
   const s=fs.lstatSync(dir);
   if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o022))return empty;
  }
  for(const name of ['server.mjs','document-link-contract.mjs','node_modules/playwright/package.json']){
   const f=path.join(sourceDir,name),s=fs.statSync(f);
   if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o022))return empty;
  }
  return {SYSTEMIA_PUBLIC_DEMAND_BROWSER_SOURCE:sourceDir,SYSTEMIA_PUBLIC_DEMAND_BROWSER_CACHE:browsersPath};
 }catch{return empty;}
}
