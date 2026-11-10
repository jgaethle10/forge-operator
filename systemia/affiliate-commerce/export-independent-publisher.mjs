#!/usr/bin/env node
// Internal-only release builder for separately hosted, independently branded
// niche publishers. Generates no Evercraft references, links or hidden trackers.
// This does not register a domain, publish the site or authorize affiliate ads.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {addIndependentSeoMesh} from './independent-seo-mesh.mjs';

const current=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(current,'../..');
const audience=['partscout','valuescout','playbook-lab','site-rescue','creative-studio','publisher-lab','relay-notes'];
const commerce=['pet-play','tool-rent-or-buy','auto-fitment'];
const all=new Set([...audience,...commerce]);
const shared='https://jgaethle10.github.io/forge-operator';

function fail(message){throw new Error('publisher_export_'+message);}
function option(args,flag){const pos=args.indexOf(flag);return pos<0?'':String(args[pos+1]||'').trim();}
function validOrigin(raw){
 if(!raw)fail('origin_required');
 let u;try{u=new URL(raw)}catch{fail('invalid_origin')}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||u.pathname!=='/'){
  fail('origin_must_be_https_hostname_only');
 }
 if(u.hostname==='localhost'||u.hostname.endsWith('.github.io')||u.hostname.includes('evercraft')||u.hostname==='fabric.systemiacommandcenters.com'){
  fail('owned_corporate_or_development_host_forbidden');
 }
 return u.origin;
}
function exportSite({slug,origin,out,sharePng}={}){
 if(!all.has(slug))fail('unknown_niche');
 const destination=path.resolve(out||'');
 if(!out||destination===root||destination===process.cwd())fail('output_required');
 const cleanOrigin=validOrigin(origin);
 const isAudience=audience.includes(slug);
 const dir=isAudience?'audience-sites':'affiliate-labs';
 const index=path.join(root,'public',dir,slug,'index.html');
 if(!fs.existsSync(index))fail('source_missing');
 let html=fs.readFileSync(index,'utf8');
 const oldSite=shared+'/'+dir+'/'+slug+'/';
 // Rewrite all public-facing canonical and social metadata to a future host.
 html=html.split(oldSite).join(cleanOrigin+'/');
 html=html.replaceAll(shared+'/audience-sites/assets/network.css','/assets/site.css')
          .replaceAll('href="../assets/site.css"','href="/assets/site.css"');
 if(isAudience){
  const prefix='<meta property="og:image" content="'+cleanOrigin+'/share.png">';
  const hasPng=Boolean(sharePng);
  if(!hasPng){
    html=html.replace(prefix,'');
    html=html.replace(/<meta property="og:image:(?:width|height|type)"[^>]+>/g,'');
    html=html.replace(/<meta name="twitter:image"[^>]+>/g,'');
    html=html.replace('name="twitter:card" content="summary_large_image"','name="twitter:card" content="summary"');
  }
 }
 const forbidden=/evercraft|jessegaethle10|forge-operator|systemiacommandcenters|mailto:|fabric\.|https:\/\/jgaethle10\.github\.io/i;
 if(forbidden.test(html))fail('operator_attribution_remains_in_rendered_html');
 if(!html.includes('content="noindex,follow"'))fail('premature_indexing_forbidden');
 if(html.includes('rel="sponsored"'))fail('premature_affiliate_links');
 if(fs.existsSync(destination))fail('output_must_be_new_directory');
 fs.mkdirSync(path.join(destination,'assets'),{recursive:true});
 fs.writeFileSync(path.join(destination,'index.html'),html,'utf8');
 const css=path.join(root,'public',dir,'assets',isAudience?'network.css':'site.css');
 fs.copyFileSync(css,path.join(destination,'assets','site.css'));
 if(sharePng){
   if(!isAudience)fail('share_image_not_supported_for_this_niche');
   if(!fs.existsSync(sharePng))fail('share_png_missing');
   const bytes=fs.readFileSync(sharePng);
   if(!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))fail('share_png_not_png');
   fs.writeFileSync(path.join(destination,'share.png'),bytes);
 }
 // No site may be indexed before owner-approved domain, privacy/legal, and
 // merchant/publisher compliance gates are independently satisfied.
 fs.writeFileSync(path.join(destination,'robots.txt'),'User-agent: *\nDisallow: /\n','utf8');
 addIndependentSeoMesh({slug,origin:cleanOrigin,destination});
 return {site:slug,origin:cleanOrigin,output:destination,standalone:true,indexable:false,merchant_approved:false,published:false,share_image:Boolean(sharePng)};
}
function main(argv){
 const site=option(argv,'--site'),origin=option(argv,'--origin'),out=option(argv,'--out');
 const png=option(argv,'--share-png');
 const receipt=exportSite({slug:site,origin,out,sharePng:png||undefined});
 process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main(process.argv.slice(2));
export {exportSite,validOrigin};
