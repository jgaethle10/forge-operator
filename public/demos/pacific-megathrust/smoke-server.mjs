// Research-only static fixture server for browser smoke QA; does not publish a live route.
import http from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,join,sep} from "node:path";
const root=resolve(new URL("../../",import.meta.url).pathname); // repository public/ (2 levels)
const port=Number(process.env.PORT||4177);
const types={".html":"text/html; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,"http://127.0.0.1:"+port);
  let p=decodeURIComponent(u.pathname);
  if(p.endsWith("/"))p+="index.html";
  const target=resolve(root,"."+p);
  if(!target.startsWith(root+sep)){res.writeHead(403).end("Forbidden");return;}
  const ext=target.slice(target.lastIndexOf("."));
  const body=await readFile(target);
  res.writeHead(200,{"content-type":types[ext]||"application/octet-stream","cache-control":"no-store"}).end(body);
 }catch{res.writeHead(404).end("Not found");}
});
server.listen(port,"127.0.0.1",()=>console.log("research smoke server listening on 127.0.0.1:"+port));
