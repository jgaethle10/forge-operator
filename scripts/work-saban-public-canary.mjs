// External, read-only public Work Saban check. Never submits an inquiry or payment.
// Pull requests test the currently published site; merged main tests the new release.
const url='https://jgaethle10.github.io/forge-operator/work-saban/';
const isPullRequest=process.env.GITHUB_EVENT_NAME==='pull_request';
const expected=isPullRequest?['Work Saban']:[
  'Give your work',
  'One task. Three simple steps.',
  'PRIVATE PILOT INTEREST',
  'Request the private pilot by email',
  'No public CSV uploads',
  'href="./brand/"',
  'Illustrative preview, not live customer execution.',
];
async function main(){
  const opts={headers:{'user-agent':'Evercraft-Work-Saban-Public-Canary/2.0'},redirect:'follow',signal:AbortSignal.timeout(15000)};
  const response=await fetch(url,opts);
  const html=await response.text();
  const missing=expected.filter(x=>!html.includes(x));
  const brandUrl=new URL('brand/',url);
  const brandResponse=await fetch(brandUrl,{redirect:'follow',signal:AbortSignal.timeout(15000)});
  const brandText=await brandResponse.text();
  const brandVerified=brandResponse.ok && (isPullRequest?brandText.includes('Work Saban'):
    brandText.includes('Mostly white.')&&brandText.includes('Confident crimson.')&&brandText.includes('#A4142F')&&brandText.includes('work-saban-social.svg'));
  const verified=response.status===200&&response.url.startsWith('https://')&&missing.length===0&&brandVerified;
  console.log(JSON.stringify({
    schema:'evercraft.work-saban.pilot-public-canary.v2',
    url,final_url:response.url,http_status:response.status,
    brand_url:brandUrl.href,brand_http_status:brandResponse.status,
    missing_markers:missing,brand_verified:brandVerified,
    source_preview_only:isPullRequest,
    simplified_release_verified:!isPullRequest&&verified,
    public_route_verified:verified,
    form_submitted:false,payment_attempted:false,
  },null,2));
  if(!verified)process.exitCode=1;
}
main().catch(error=>{console.error(JSON.stringify({schema:'evercraft.work-saban.pilot-public-canary.v2',
  public_route_verified:false,reason:error.name||'fetch_failed',form_submitted:false,payment_attempted:false}));
  process.exitCode=1;
});
