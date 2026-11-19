/**
 * Disposable GitHub Actions Chromium proof for the private .evercraft TLS lab.
 * Requires an ephemeral CA imported ONLY into an isolated temporary NSS
 * database. No OS certificate store, persistent user Chrome profile, or
 * certificate-error bypass is permitted. No public site is published.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
const HOST='onthegoquicklube.evercraft';
const URL='https://'+HOST+':18443/';
const ROOT=process.env.RUNNER_TEMP;
const HOME=process.env.EVERCRAFT_DOMAINS_CHROME_HOME;
const OUT=process.env.EVERCRAFT_DOMAINS_CHROME_EVIDENCE_DIR;
if(process.env.CI!=='true'||!ROOT||!HOME||!OUT||
   !path.resolve(HOME).startsWith(path.resolve(ROOT)+path.sep)||
   !path.resolve(OUT).startsWith(path.resolve(ROOT)+path.sep))
  throw new Error('disposable_ci_runner_scope_required');
const db=path.join(HOME,'.pki/nssdb');
assert.ok(fs.existsSync(path.join(db,'cert9.db')),'isolated NSS trust DB must be explicitly configured');
fs.mkdirSync(OUT,{recursive:true,mode:0o700});
const executable=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/opt/google/chrome/chrome'].find(p=>fs.existsSync(p));
const args=[
 '--no-sandbox',
 '--no-first-run',
 '--disable-background-networking',
 '--disable-component-update',
 '--disable-sync',
 '--host-resolver-rules=MAP '+HOST+' 127.0.0.1',
];
assert.ok(!args.some(x=>/ignore-certificate-errors|allow-insecure-localhost|disable-web-security/i.test(x)));
const launch=async(home,profile)=>{
 const env={...process.env,HOME:home,XDG_CONFIG_HOME:path.join(home,'.config'),XDG_CACHE_HOME:path.join(home,'.cache')};
 return chromium.launchPersistentContext(profile,{
  executablePath:executable,
  headless:true,ignoreHTTPSErrors:false,acceptDownloads:false,
  viewport:{width:1280,height:800},
  args,env
 });
};
// A profile with no explicit lab root must reject the identical HTTPS URL.
const noTrustHome=path.join(ROOT,'evercraft-domains-untrusted-home');
fs.mkdirSync(noTrustHome,{recursive:true,mode:0o700});
let untrustedRejected=false;
{
 const ctx=await launch(noTrustHome,path.join(noTrustHome,'profile'));
 try{
  const p=ctx.pages()[0]||await ctx.newPage();
  try{await p.goto(URL,{waitUntil:'domcontentloaded',timeout:16000});}
  catch(e){
   untrustedRejected=/ERR_CERT_AUTHORITY_INVALID|ERR_CERT_COMMON_NAME_INVALID|ERR_CERT_UNTRUSTED|certificate/i.test(String(e.message));
   if(!untrustedRejected)throw e;
  }
 }finally{await ctx.close();}
}
assert.ok(untrustedRejected,'Chrome must refuse private HTTPS without temporary CA');
const receipt={
 schema:'evercraft.domains.client001.temporary-chrome-trust-proof.v1',
 state:'ISOLATED_CHROMIUM_TEST',
 private_name:HOST,
 ca_trust_scope:'ephemeral_CI_NSS_only',
 browser_error_bypass:false,
 no_ca_rejected:untrustedRejected,
 screenshots:[],journeys:[],errors:[],
 source_publication:false,
 customer_device_configured:false,
 system_trust_modified:false,
 public_tld_delegated:false,
 customer_approval:false
};
const ctx=await launch(HOME,path.join(HOME,'profile'));
try{
 const p=ctx.pages()[0]||await ctx.newPage();
 p.on('pageerror',e=>receipt.errors.push(String(e.message)));
 for(const width of [390,1280]){
  await p.setViewportSize({width,height:width===390?844:900});
  for(const language of ['en','es']){
   const response=await p.goto(URL,{waitUntil:'domcontentloaded',timeout:30000});
   assert.equal(response?.status(),200,'trusted test browser must load real HTTPS');
   assert.match(await p.title(),/Client Preview V4\.1/);
   assert.equal(await p.locator('meta[name=robots]').getAttribute('content'),'noindex,nofollow,noarchive');
   await p.locator('#'+language).click();
   assert.equal(await p.locator('html').getAttribute('lang'),language);
   await p.locator('input[name=oil][value=full]').check();
   await p.locator('#matchTires').check();
   assert.equal((await p.locator('#matchResultPrice').textContent()).trim(),'$120.99');
   await p.locator('#matchAsk').click();
   const mailto=await p.locator('#emailCta').getAttribute('href');
   assert.ok(mailto.startsWith('mailto:onthegomobileoilchange@outlook.com?'));
   const {scrollWidth,clientWidth}=await p.evaluate(()=>({
    scrollWidth:document.documentElement.scrollWidth,
    clientWidth:document.documentElement.clientWidth
   }));
   assert.ok(scrollWidth<=clientWidth+2,'horizontal overflow at '+width);
   assert.equal(receipt.errors.length,0,receipt.errors.join('; '));
   const file=path.join(OUT,'onthego-private-https-'+width+'-'+language+'.png');
   await p.screenshot({path:file,fullPage:true,animations:'disabled'});
   receipt.screenshots.push(path.basename(file));
   receipt.journeys.push({width,language,http:response.status(),secure_navigation:true,
    source:'original_on_the_go_V4.1',price:'$120.99',
    mailto_draft:true,overflow_px:Math.max(0,scrollWidth-clientWidth)});
   console.log('SCOPED_CHROME_PASS',width,language);
  }
 }
}finally{await ctx.close();}
receipt.state='ISOLATED_CHROMIUM_PASS';
const receiptFile=path.join(OUT,'receipt.json');
fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({state:receipt.state,trusted_chrome:receipt.journeys.length,
 no_ca_rejected:receipt.no_ca_rejected,public_launch:false},null,2));
