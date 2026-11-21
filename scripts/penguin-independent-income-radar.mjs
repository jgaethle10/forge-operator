#!/usr/bin/env node
// Penguin Independent Income Radar: read-only scan. No affiliation with Evercraft offers.
// Third-party board entries are leads, NEVER proof of money, eligibility or escrow.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const FEED='https://muhib-karim.github.io/bounty-radar/bounties.json';
const MAX_BYTES=1_000_000;
const PRIVATE_DIR=path.join(os.homedir(),'.local','state','penguin-independent-income');
const deny=/bot.trap|fake.bounty|test.bounty|honeypot|benchmark|paid.to.bid|upwork/i;
const money=(x)=>Number.isFinite(x)&&x>0?Math.round(x*100)/100:null;
const safeUrl=(value)=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='github.com'&&/^\/[\w.-]+\/[\w.-]+\/issues\/\d+$/.test(u.pathname)}catch{return false}};
export function triageBounty(b,generatedAt){
  if(!b||!safeUrl(b.url)||typeof b.title!=='string'||deny.test(b.title)||deny.test(b.repo||''))return null;
  const amount=money(b.amountUsd);
  const prs=Number.isInteger(b.openCompetingPrs)&&b.openCompetingPrs>=0?b.openCompetingPrs:null;
  const age=Number.isFinite(b.ageDays)&&b.ageDays>=0?b.ageDays:null;
  const rawEscrow=String(b.escrow||'');
  // A headline claiming "escrowed" never suffices. The external feed itself warns.
  const verifiedEscrow=false;
  const redFlags=[];
  if(!amount)redFlags.push('no_verified_payout_amount');
  if(/unknown|verify|down/i.test(rawEscrow)||!rawEscrow)redFlags.push('escrow_unverified');
  if(prs===null)redFlags.push('competition_unknown');
  else if(prs>=3)redFlags.push('competing_pull_requests');
  if(age===null||age>14)redFlags.push('stale_or_unknown_age');
  if(b.source==='opire'&&/down|502/i.test(rawEscrow))redFlags.push('payout_platform_may_be_down');
  let score=(amount?Math.min(45,amount/20):0)+(age!==null?Math.max(0,20-age*2):0)+(prs!==null?Math.max(0,20-prs*8):0);
  if(redFlags.includes('payout_platform_may_be_down'))score-=40;
  if(prs!==null&&prs>=3)score-=25;
  return {title:b.title.slice(0,240),url:b.url,source:b.source||'unverified',
    board_generated_at:generatedAt||null,board_last_seen:b.last_seen||null,
    advertised_amount_usd:amount,amount_verified:false,escrow_verified:verifiedEscrow,
    competing_prs:prs,age_days:age,score:Math.round(score),
    state:amount&&prs!==null&&prs<3?'CHECK_PRIMARY_SOURCE':'LOW_PRIORITY',
    red_flags:redFlags,actions_required:[
      'read_original_issue_and_repository_rules','confirm_open_and_unassigned',
      'verify_funded_payout_on_official_platform','check_existing_PRs',
      'confirm_eligibility_and_payment_terms_before_work'],
    participation_authorized:false,payment_guaranteed:false};
}
export function buildReport(data,{now=new Date()}={}){
  if(!data||!Array.isArray(data.bounties)||data.bounties.length>1500)throw Error('feed_shape_invalid');
  const generated=Date.parse(data.generatedAt||'');
  const ageHours=Number.isFinite(generated)?(now.getTime()-generated)/3_600_000:null;
  const stale=ageHours===null||ageHours<0||ageHours>48;
  const seen=new Set();
  const opportunities=data.bounties.map(b=>triageBounty(b,data.generatedAt))
    .filter(x=>{if(!x||seen.has(x.url))return false;seen.add(x.url);return true})
    .sort((a,b)=>b.score-a.score).slice(0,25);
  return {schema:'penguin.independent-income.radar.v1',
    scanned_at:now.toISOString(),feed:FEED,feed_generated_at:data.generatedAt||null,
    feed_stale:stale,summary:{input_count:data.bounties.length,candidates:opportunities.length,
      worth_primary_review:opportunities.filter(x=>x.state==='CHECK_PRIMARY_SOURCE').length,
      verified_earnings:0,confirmed_paid_opportunities:0},
    opportunities,limits:['Third-party board may include misleading or bait listings',
      'Never interpret issue title as proof of escrow','No automated claims, submissions, purchases, or identity verification',
      'No payouts established by this scan']};
}
async function fetchBoard(){
  const res=await fetch(FEED,{signal:AbortSignal.timeout(12000),
    headers:{accept:'application/json','user-agent':'Penguin-Independent-Income-ReadOnly/1.0'}});
  if(!res.ok)throw Error('feed_http_'+res.status);
  const reader=res.body.getReader();let size=0,parts=[];
  for(;;){const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw Error('feed_too_large')}
    parts.push(value)}
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export async function main(args=process.argv.slice(2)){
  const index=args.indexOf('--file');
  const data=index>=0?JSON.parse(fs.readFileSync(args[index+1],'utf8')):await fetchBoard();
  const report=buildReport(data);
  fs.mkdirSync(PRIVATE_DIR,{recursive:true,mode:0o700});
  const dst=path.join(PRIVATE_DIR,'latest.json'),tmp=dst+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  fs.renameSync(tmp,dst);
  console.log(JSON.stringify({file:dst,summary:report.summary,feed_stale:report.feed_stale,
    top:report.opportunities.slice(0,5).map(x=>({url:x.url,amount:x.advertised_amount_usd,
      state:x.state,red_flags:x.red_flags})),transactions:0},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(e=>{console.error('INDEPENDENT_RADAR_HOLD:',e.message);process.exitCode=1})}
