import http from "node:http";
export function startHealth({runtime,port=8080}){
 return http.createServer((req,res)=>{
  if(req.url!=="/health"){res.writeHead(404);return res.end()}
  const s=runtime.getSnapshot();
  res.setHeader("content-type","application/json");
  res.end(JSON.stringify({ok:true,role:"authoritative_dns",recursive:false,snapshot_sha256:s.hash,serial:s.zone.serial}));
 }).listen(port);
}
