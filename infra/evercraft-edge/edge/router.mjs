import http from "node:http";
import httpProxy from "node:http"; // runtime uses native request forwarding, no dependency

const cleanHost=v=>String(v||"").toLowerCase().replace(/:\d+$/,"").replace(/\.$/,"");
export function compileRoutes(registry){
 const map=new Map();
 for(const s of registry.services||[]){
  for(const h of s.public_hosts||[]){
   const host=cleanHost(h);
   if(map.has(host)) throw new Error("duplicate public host "+host);
   const ep=(s.endpoints||[]).find(e=>e.state==="healthy"&&["http","https"].includes(e.protocol));
   map.set(host,{service_id:s.service_id,logical_uri:s.logical_uri,endpoint:ep||null});
  }
 }
 return map;
}
export function routeRequest(req,routes){
 const host=cleanHost(req.headers.host);
 const route=routes.get(host);
 if(!route)return {status:404,error:"unknown_host"};
 if(!route.endpoint)return {status:503,error:"no_healthy_endpoint",service_id:route.service_id};
 return {status:200,...route};
}
export function startRouter({registry,port=8081,host="0.0.0.0"}){
 let routes=compileRoutes(registry);
 const server=http.createServer((req,res)=>{
  const r=routeRequest(req,routes);
  if(r.status!==200){res.writeHead(r.status,{"content-type":"application/json"});return res.end(JSON.stringify(r))}
  const target=new URL(r.endpoint.url);
  const upstream=httpProxy.request({hostname:target.hostname,port:target.port||80,path:req.url,method:req.method,headers:{...req.headers,host:target.host}},u=>{
   res.writeHead(u.statusCode||502,u.headers);u.pipe(res);
  });
  upstream.on("error",()=>{if(!res.headersSent)res.writeHead(502);res.end()});
  req.pipe(upstream);
 });
 server.listen(port,host);
 return {server,reload(next){routes=compileRoutes(next)}};
}
