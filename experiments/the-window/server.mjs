import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {REAL_TICK_MS} from './engine.mjs';
import {DurableWorldStore} from './durable-store.mjs';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||8787);
const dataDir=process.env.WINDOW_DATA_DIR||path.join(__dirname,'data');
const store=new DurableWorldStore(dataDir);
const recovery=store.catchUp();
const clients=new Set();
const maxClients=120;
const headers={
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Cache-Control':'no-store'
};
function reply(res,code,body,type='application/json; charset=utf-8'){
  res.writeHead(code,{...headers,'Content-Type':type});
  res.end(type.startsWith('application/json')?JSON.stringify(body):body);
}
function push(sse,event,payload){
  try{sse.write('event: '+event+'\ndata: '+JSON.stringify(payload)+'\n\n');return true;}catch{return false;}
}
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method!=='GET'){reply(res,405,{error:'Read only public spectator surface'});return;}
  if(url.pathname==='/api/health'){
    reply(res,200,{status:'ok',world:store.world.town,tick:store.world.tick,subscribers:clients.size,
      persisted:fs.existsSync(store.file),...store.status()});
  }else if(url.pathname==='/api/world'){
    reply(res,200,store.world);
  }else if(url.pathname==='/api/history'){
    reply(res,200,{events:store.history(Number(url.searchParams.get('limit')||80))});
  }else if(url.pathname==='/api/events'){
    if(clients.size>=maxClients){reply(res,503,{error:'Viewer capacity reached'});return;}
    res.writeHead(200,{...headers,'Content-Type':'text/event-stream; charset=utf-8',
      'Connection':'keep-alive','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});
    clients.add(res);
    push(res,'snapshot',store.world);
    req.on('close',()=>clients.delete(res));
  }else if(url.pathname==='/'||url.pathname==='/index.html'){
    reply(res,200,fs.readFileSync(path.join(__dirname,'public','index.html'),'utf8'),'text/html; charset=utf-8');
  }else if(url.pathname==='/app.js'||url.pathname==='/style.css'){
    const filename=url.pathname==='/app.js'?'app.js':'style.css';
    reply(res,200,fs.readFileSync(path.join(__dirname,'public',filename),'utf8'),
      filename.endsWith('js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');
  }else{reply(res,404,{error:'Not found'});}
});
const timer=setInterval(()=>{
  try{
    const advance=store.catchUp(20);
    if(advance.processed>0){
      for(const client of clients)if(!push(client,'snapshot',store.world))clients.delete(client);
    }
  }catch(err){console.error('Tick failed:',err);}
},REAL_TICK_MS);
timer.unref();
const ping=setInterval(()=>{for(const client of clients){try{client.write(': heartbeat\n\n');}catch{clients.delete(client);}}},20_000);
ping.unref();
server.listen(port,'0.0.0.0',()=>{
  console.log('The Window spectator server on http://localhost:'+port);
  console.log('World tick:',store.world.tick,'Recovered:',recovery.processed,'Missed:',recovery.unprocessed);
});
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
