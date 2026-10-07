import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commonGroundHealth, runCommonGroundAgent } from "./agent.mjs";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const port=Math.max(1,Math.min(65535,Number(process.env.PORT||8080)));
const html=fs.readFileSync(path.join(__dirname,"public","index.html"),"utf8");
const buckets=new Map();

function send(res,status,body,type="application/json; charset=utf-8"){
  res.statusCode=status;
  res.setHeader("content-type",type);
  res.setHeader("cache-control","no-store");
  res.setHeader("x-content-type-options","nosniff");
  res.setHeader("referrer-policy","no-referrer");
  res.end(type.startsWith("application/json")?JSON.stringify(body,null,2):body);
}
function rateAllowed(req){
  const key=req.socket.remoteAddress||"unknown";
  const now=Date.now();
  const current=buckets.get(key);
  if(!current||current.reset<=now){
    buckets.set(key,{count:1,reset:now+60*60*1000});
    return true;
  }
  if(current.count>=30) return false;
  current.count+=1;
  return true;
}
async function readJson(req){
  const chunks=[];
  let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>64*1024) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString("utf8");
  return raw?JSON.parse(raw):{};
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||"/","http://localhost");
  if(req.method==="GET"&&(url.pathname==="/"||url.pathname==="/index.html")){
    send(res,200,html,"text/html; charset=utf-8");
    return;
  }
  if(req.method==="GET"&&url.pathname==="/health"){
    send(res,200,commonGroundHealth());
    return;
  }
  if(req.method==="GET"&&url.pathname==="/api/sample"){
    send(res,200,{
      profiles:[
        {label:"Person 1",interests:["Studio Ghibli","Brian Eno"]},
        {label:"Person 2",interests:["Wes Anderson","Tyler, the Creator"]},
      ],
      objective:"Plan a date night everyone actually likes",
      location:"Seattle, Washington",
      categories:["place","movie","artist"],
      price_level_max:3,
    });
    return;
  }
  if(req.method==="POST"&&url.pathname==="/api/commonground"){
    if(!rateAllowed(req)){
      send(res,429,{ok:false,error:"rate_limit_exceeded"});
      return;
    }
    try{
      const body=await readJson(req);
      const result=await runCommonGroundAgent(body);
      send(res,200,{ok:true,result});
    }catch(error){
      const message=String(error?.message||"commonground_failed").slice(0,300);
      const status=/qloo_api_key_missing/.test(message)?503:
        /required|maximum|supported_category|request_too_large/.test(message)?400:
        /qloo_http_4/.test(message)?502:500;
      send(res,status,{ok:false,error:message});
    }
    return;
  }
  send(res,404,{ok:false,error:"not_found"});
});

server.listen(port,"0.0.0.0",()=>{
  console.log(`CommonGround listening on http://0.0.0.0:${port}`);
});
