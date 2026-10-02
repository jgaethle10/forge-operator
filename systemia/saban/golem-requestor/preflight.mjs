#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGolemSdkClient } from './client.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const sdkPackage=path.join(
  here,
  'node_modules',
  '@golem-sdk',
  'golem-js',
  'package.json'
);
const sdkOnly=process.argv.includes('--sdk-only');
const apiKey=String(process.env.YAGNA_APPKEY||'').trim();
const apiUrl=String(
  process.env.YAGNA_API_BASEPATH||
  process.env.YAGNA_API_URL||
  'http://127.0.0.1:7465'
).trim();

const receipt={
  schema:'evercraft.saban.golem-requestor-preflight.v1',
  sdk_installed:fs.existsSync(sdkPackage),
  sdk_isolated_sidecar:true,
  platform:process.platform,
  platform_supported:process.platform==='linux',
  yagna_api_url:apiUrl,
  app_key_present:Boolean(apiKey),
  app_key_exposed:false,
  sdk_only:sdkOnly,
  yagna_connected:false,
  checked_at:new Date().toISOString(),
};

if(!receipt.sdk_installed){
  console.error(JSON.stringify(receipt,null,2));
  throw new Error('golem_sdk_not_installed');
}

if(sdkOnly){
  console.log(JSON.stringify(receipt,null,2));
  process.exit(0);
}

if(!receipt.platform_supported){
  console.error(JSON.stringify(receipt,null,2));
  throw new Error('golem_requestor_linux_required_for_supported_runtime');
}
if(!apiKey){
  console.error(JSON.stringify(receipt,null,2));
  throw new Error('golem_yagna_app_key_required');
}

let client=null;
try{
  client=await createGolemSdkClient({apiKey,url:apiUrl});
  receipt.yagna_connected=true;
  console.log(JSON.stringify(receipt,null,2));
}finally{
  if(client?.close) await client.close().catch(()=>{});
}
