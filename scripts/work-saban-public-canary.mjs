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
  'Try a real browser example',
  'Try planning your task',
  'Make your sales report',
  'href="./report/"',
  'Make a private report from your own CSV',
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
  // Public GETs verify that the customer can reach the complete example package.
  // The browser arithmetic is independently tested by the source-level demo proof.
  const exampleRoutes=[
    {path:'demo/',markers:['Run the example','LIVE BROWSER EXAMPLE / SYNTHETIC DATA','./demo.js']},
    {path:'demo/demo.js',markers:['calculateExample','auditExample',"../example-sales.csv"]},
    {path:'demo/engine.mjs',markers:['export function calculateExample','export function auditExample']},
    {path:'example-sales.csv',markers:['2026-07,10500.00,Direct services','2026-09,1800.25,Parts']},
  ];
  let exampleVerified=isPullRequest;
  const exampleChecks=[];
  if(!isPullRequest){
    exampleVerified=true;
    for(const route of exampleRoutes){
      const href=new URL(route.path,url).href;
      const result=await fetch(href,{redirect:'follow',signal:AbortSignal.timeout(15000),cache:'no-store'});
      const body=await result.text();
      const missingExample=route.markers.filter(marker=>!body.includes(marker));
      const ok=result.status===200&&missingExample.length===0;
      exampleChecks.push({url:href,http_status:result.status,ok,missing_markers:missingExample});
      if(!ok)exampleVerified=false;
    }
  }
  // A public user-task plan must be accessible without pretending workers were dispatched.
  // These are GET-only existence/contents checks, not browser interaction receipts.
  const planRoutes=[
    {path:'plan/',markers:['Plan my team','TEAM PROPOSED · NOT RUNNING','connect-src', './plan.js']},
    {path:'plan/plan.js',markers:['planTask',"$('task').value",'clipboard']},
    {path:'plan/engine.mjs',markers:['export function planTask','proposed_not_running','execution_started:false']}
  ];
  const planChecks=[];
  let planVerified=isPullRequest;
  if(!isPullRequest){
    planVerified=true;
    for(const route of planRoutes){
      const href=new URL(route.path,url).href;
      const result=await fetch(href,{redirect:'follow',signal:AbortSignal.timeout(15000),cache:'no-store'});
      const body=await result.text();
      const missingPlan=route.markers.filter(marker=>!body.includes(marker));
      const ok=result.status===200&&missingPlan.length===0;
      planChecks.push({url:href,http_status:result.status,ok,missing_markers:missingPlan});
      if(!ok)planVerified=false;
    }
  }
  // Real customer CSV route is private-by-design. External read-only GET checks
  // prove served HTML/JS, not permissioned file execution or browser privacy.
  const reportRoutes=[
    {path:'report/',markers:['Your numbers.','id="csv-file"','id="consent"','connect-src', './report.js']},
    {path:'report/report.js',markers:['analyzeSalesCsv','file.text()','checkSalesReport(text,result)']},
    {path:'report/engine.mjs',markers:['export function analyzeSalesCsv','export function checkSalesReport','MAX_CSV_ROWS=2000']}
  ];
  const reportChecks=[];
  let reportVerified=isPullRequest;
  if(!isPullRequest){
    reportVerified=true;
    for(const route of reportRoutes){
      const href=new URL(route.path,url).href;
      const result=await fetch(href,{redirect:'follow',signal:AbortSignal.timeout(15000),cache:'no-store'});
      const body=await result.text();
      const missingReport=route.markers.filter(marker=>!body.includes(marker));
      const ok=result.status===200&&missingReport.length===0;
      reportChecks.push({url:href,http_status:result.status,ok,missing_markers:missingReport});
      if(!ok)reportVerified=false;
    }
  }
  const verified=response.status===200&&response.url.startsWith('https://')&&missing.length===0&&brandVerified&&exampleVerified&&planVerified&&reportVerified;
  console.log(JSON.stringify({
    schema:'evercraft.work-saban.pilot-public-canary.v2',
    url,final_url:response.url,http_status:response.status,
    brand_url:brandUrl.href,brand_http_status:brandResponse.status,
    missing_markers:missing,brand_verified:brandVerified,
    example_verified:exampleVerified,example_checks:exampleChecks,
    plan_verified:planVerified,plan_checks:planChecks,
    report_verified:reportVerified,report_checks:reportChecks,
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
