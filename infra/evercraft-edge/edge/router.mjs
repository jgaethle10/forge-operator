import http from "node:http";
import https from "node:https";

const cleanHost=v=>String(v||"").toLowerCase().replace(/:\d+$/,"").replace(/\.$/,"");
export function compileRoutes(registry){
 const map=new Map();
 for(const s of registry.services||[]){
  for(const h of s.public_hosts||[]){
   const host=cleanHost(h);
   if(!host) throw new Error("empty public host");
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
function upstreamHeaders(req,r,target){
 const h={...req.headers};
 delete h["x-evercraft-service-id"]; delete h["x-evercraft-logical-uri"];
 h.host=target.host;
 h["x-evercraft-service-id"]=r.service_id;
 h["x-evercraft-logical-uri"]=r.logical_uri;
 h["x-forwarded-host"]=cleanHost(req.headers.host);
 h["x-forwarded-proto"]=req.socket?.encrypted?"https":"http";
 return h;
}
export function startRouter({registry,port=8081,host="0.0.0.0"}){
 let routes=compileRoutes(registry);
 const server=http.createServer((req,res)=>{
  const r=routeRequest(req,routes);
  if(r.status!==200){res.writeHead(r.status,{"content-type":"application/json"});return res.end(JSON.stringify(r))}
  const target=new URL(r.endpoint.url);
  const transport=target.protocol==="https:"?https:http;
  const upstream=transport.request({
   protocol:target.protocol,hostname:target.hostname,
   port:target.port||(target.protocol==="https:"?443:80),
   path:new URL(req.url,target).pathname+new URL(req.url,target).search,
   method:req.method,headers:upstreamHeaders(req,r,target),
   servername:target.hostname
  },u=>{res.writeHead(u.statusCode||502,u.headers);u.pipe(res)});
  upstream.on("error",()=>{if(!res.headersSent)res.writeHead(502);res.end()});
  req.pipe(upstream);
 });
 server.listen(port,host);
 return {server,reload(next){routes=compileRoutes(next)}};
}
