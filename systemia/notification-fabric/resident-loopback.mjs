#!/usr/bin/env node
// Standalone resident entrypoint for the EXISTING Systemia Notification Fabric.
// No new delivery engine, no public listener, no customer intake or checkout.
// Secrets are supplied by a protected systemd EnvironmentFile, never source.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {registerNotificationFabricRoutes} from './http.mjs';

const HOST='127.0.0.1';
const DEFAULT_PORT=3921;
const DEFAULT_DIR='/var/lib/evercraft/notification-fabric';

function loadExistingExpress(dependencyRoot){
  // An explicit isolated dependency root must not fall back to checkout or global code.
  if(!dependencyRoot)return createRequire(import.meta.url)('express');
  if(typeof dependencyRoot!=='string'||!path.isAbsolute(dependencyRoot))
    throw Error('RELAY_DEPENDENCY_ROOT_INVALID');
  const root=path.resolve(dependencyRoot);
  const st=fs.lstatSync(root);
  if(!st.isDirectory()||st.isSymbolicLink()||
     fs.realpathSync(root)!==root||(st.mode&0o077)!==0||
     (typeof process.getuid==='function'&&st.uid!==process.getuid()))
    throw Error('RELAY_DEPENDENCY_ROOT_SAFETY_HOLD');
  const packageFile=path.join(root,'node_modules','express','package.json');
  const pkg=fs.lstatSync(packageFile);
  if(!pkg.isFile()||pkg.isSymbolicLink())throw Error('RELAY_EXPRESS_NOT_INSTALLED');
  const meta=JSON.parse(fs.readFileSync(packageFile,'utf8'));
  if(meta.name!=='express'||meta.version!=='4.21.2')
    throw Error('RELAY_EXPRESS_VERSION_HOLD');
  return createRequire(path.join(root,'entrypoint.cjs'))('express');
}

function privateStore(dir){
  if(typeof dir!=='string'||!path.isAbsolute(dir))throw Error('RELAY_PRIVATE_STORE_PATH_REQUIRED');
  const resolved=path.resolve(dir);
  const st=fs.lstatSync(resolved);
  if(!st.isDirectory()||st.isSymbolicLink()||
      (st.mode&0o077)!==0||
      (typeof process.getuid==='function'&&st.uid!==process.getuid())||
      fs.realpathSync(resolved)!==resolved)
    throw Error('RELAY_PRIVATE_STORE_SAFETY_HOLD');
  return resolved;
}

export async function startNotificationRelayResident({
  port=Number(process.env.EVERCRAFT_NOTIFICATION_PORT||DEFAULT_PORT),
  dataDir=process.env.EVERCRAFT_NOTIFICATION_DATA_DIR||DEFAULT_DIR,
  ingestToken=process.env.EVERCRAFT_NOTIFICATION_INGEST_TOKEN||'',
  sessionSecret=process.env.EVERCRAFT_NOTIFICATION_SESSION_SECRET||'',
  receiptSecret=process.env.EVERCRAFT_NOTIFICATION_RECEIPT_SECRET||'',
  allowedOrigins=process.env.EVERCRAFT_NOTIFICATION_ALLOWED_ORIGINS||'',
  expressRoot=process.env.EVERCRAFT_NOTIFICATION_EXPRESS_ROOT||'',
}={}){
  if(!Number.isInteger(port)||port<0||port>65535)
    throw Error('RELAY_LOOPBACK_PORT_INVALID');
  if(typeof ingestToken!=='string'||!/^[-_A-Za-z0-9]{40,256}$/.test(ingestToken))
    throw Error('RELAY_INGEST_CREDENTIAL_MISSING_OR_WEAK');
  const root=privateStore(dataDir);
  const express=loadExistingExpress(expressRoot);
  const app=express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.use(express.json({limit:'32kb',strict:true}));
  // Reuse existing, independently tested authenticated intent, inbox,
  // Signal, scoped-session, dedupe and delivery-receipt implementation.
  registerNotificationFabricRoutes(app,{
    dataDir:root,ingestToken,sessionSecret,receiptSecret,allowedOrigins
  });
  app.use((_req,res)=>res.status(404).json({success:false,error:'not_found'}));
  const server=await new Promise((resolve,reject)=>{
    const handle=app.listen(port,HOST,()=>{handle.off('error',reject);resolve(handle)});
    handle.once('error',reject);
  });
  return {
    address:server.address(),
    close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())),
  };
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  try{
    const relay=await startNotificationRelayResident();
    process.stdout.write(JSON.stringify({
      schema:'evercraft.notification.resident-loopback.v1',
      state:'BOUND_PRIVATE_LOOPBACK',
      host:HOST,port:relay.address.port,
      public_ingress_exposed:false,
      studio_dispatch_configured:false,
      no_customer_notification_sent:true
    })+'\n');
    for(const signal of ['SIGINT','SIGTERM']){
      process.once(signal,()=>{void relay.close().then(()=>process.exit(0),()=>process.exit(1));});
    }
  }catch(error){
    process.stderr.write('RELAY_RESIDENT_HOLD '+String(error?.message||error)+'\n');
    process.exitCode=1;
  }
}
