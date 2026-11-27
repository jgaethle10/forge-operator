import fs from 'node:fs';
import path from 'node:path';

// Serve only the deliberately public research explanation. Never resolve
// a request path into private atlas files or allow arbitrary asset reads.
export function serveForestIntelligence(req,res,{repoRoot}={}){
 const pathname=new URL(String(req.url||'/'),'http://fabric.local').pathname;
 if(pathname!=='/forest-intelligence'&&pathname!=='/forest-intelligence/'&&pathname!=='/forest-intelligence/index.html')return false;
 const headers={'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow','referrer-policy':'no-referrer'};
 if(req.method!=='GET'&&req.method!=='HEAD'){
  res.writeHead(405,{...headers,allow:'GET, HEAD'});res.end('Method not allowed');return true;
 }
 let payload;
 try{
  const file=path.resolve(repoRoot,'public/forest-intelligence/index.html');
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>128*1024)throw Error('asset unavailable');
  payload=fs.readFileSync(file);
 }catch{res.writeHead(503,headers);res.end(req.method==='HEAD'?undefined:'Research preview unavailable');return true;}
 res.writeHead(200,{...headers,'content-type':'text/html; charset=utf-8','content-length':payload.length,'cache-control':'public, max-age=60, must-revalidate','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});
 res.end(req.method==='HEAD'?undefined:payload);return true;
}
