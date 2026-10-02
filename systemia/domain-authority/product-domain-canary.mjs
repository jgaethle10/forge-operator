#!/usr/bin/env node
import fs from 'node:fs';

const args=Object.fromEntries(process.argv.slice(2).map((item)=>{
  const [key,...rest]=item.replace(/^--/,'').split('=');
  return [key,rest.join('=')];
}));

const domain=String(args.domain||'evercraft.app').trim().toLowerCase().replace(/\.$/,'');
const productKey=String(args.product||'infinite-classroom').trim().toLowerCase();
const timeoutMs=Math.max(1000,Math.min(30000,Number(args.timeout||15000)));

if(!domain || domain.includes('/') || domain.includes(':')) throw new Error('invalid_domain');
if(/(^|\.)base44\.app$/i.test(domain)) throw new Error('legacy_provider_domain_rejected');
if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(productKey)) throw new Error('invalid_product_key');

const directory=JSON.parse(fs.readFileSync('public/.well-known/evercraft-products.json','utf8'));
const product=(directory.products||[]).find((entry)=>entry.product_key===productKey);
if(!product) throw new Error('product_not_admitted_to_public_directory');

const origin=`https://${productKey}.${domain}`;
const controller=()=>AbortSignal.timeout(timeoutMs);

async function read(url, as='text'){
  const response=await fetch(url,{signal:controller(),redirect:'manual'});
  const body=as==='json' ? await response.json().catch(()=>null) : await response.text();
  return {response,body};
}

const health=await read(origin+'/api/health','json');
if(health.response.status!==200) throw new Error(`health_http_${health.response.status}`);
if(health.body?.ok!==true) throw new Error('health_not_green');
if(health.body?.service!=='chum-public-origin') throw new Error('unexpected_public_origin_service');
if(health.body?.runtime!=='Evercraft Compute') throw new Error('unexpected_runtime');
if(health.body?.product_domain!==domain) throw new Error('product_domain_mismatch');

const root=await read(origin+'/');
if(root.response.status!==200) throw new Error(`product_root_http_${root.response.status}`);
if(!root.body.includes(product.name)) throw new Error('product_root_identity_mismatch');

const llms=await read(origin+'/llms.txt');
if(llms.response.status!==200) throw new Error(`product_llms_http_${llms.response.status}`);
if(!llms.body.includes(product.name)) throw new Error('product_llms_identity_mismatch');

const discovery=await read(origin+'/ai-discovery.json','json');
if(discovery.response.status!==200) throw new Error(`product_discovery_http_${discovery.response.status}`);
if(discovery.body?.product_key!==productKey) throw new Error('product_discovery_identity_mismatch');

const unknown=await read(`https://unadmitted-canary.${domain}/`);
if(unknown.response.status!==404) throw new Error(`unknown_product_host_expected_404_got_${unknown.response.status}`);

const receipt={
  schema:'evercraft.public-product-domain.canary.v1',
  ok:true,
  domain,
  product_key:productKey,
  origin:origin+'/',
  checks:{
    health:true,
    product_root:true,
    llms:true,
    discovery:true,
    unknown_product_fails_closed:true,
    https_only:true,
    base44_required:false
  },
  observed_at:new Date().toISOString()
};

process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
