import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReport,triageBounty} from '../scripts/penguin-independent-income-radar.mjs';
const input={generatedAt:'2026-11-18T20:00:00Z',bounties:[
{title:'[Escrowed $600] Fix a bug',url:'https://github.com/example/project/issues/1',amountUsd:600,ageDays:1,openCompetingPrs:0,escrow:'unknown — verify escrow before investing time',source:'github-label'},
{title:'[Escrowed $600] Fix a bug',url:'https://github.com/example/project/issues/1',amountUsd:600,ageDays:1,openCompetingPrs:0},
{title:'Benchmark paid bounty',url:'https://github.com/example/oss-bot-trap-benchmark/issues/2',amountUsd:900,ageDays:0,openCompetingPrs:0},
{title:'WearOS support',url:'https://github.com/example/other/issues/3',amountUsd:2340,ageDays:0,openCompetingPrs:17,source:'opire',escrow:'platform down 502'}
]};
test('never counts advertised amounts as verified earnings',()=>{
 const report=buildReport(input,{now:new Date('2026-11-18T21:00:00Z')});
 assert.equal(report.summary.verified_earnings,0);
 assert.equal(report.summary.confirmed_paid_opportunities,0);
 assert.equal(report.summary.candidates,2);
 assert.equal(report.opportunities[0].amount_verified,false);
 assert.equal(report.opportunities[0].payment_guaranteed,false);
 assert.equal(report.opportunities[0].escrow_verified,false);
 assert.ok(report.opportunities[0].red_flags.includes('escrow_unverified'));
});
test('rejects non-GitHub, insecure, suspicious, and duplicate submissions',()=>{
 assert.equal(triageBounty({url:'http://github.com/a/b/issues/1',title:'Test'}),null);
 assert.equal(triageBounty({url:'https://evil.example/a/b/issues/1',title:'Test'}),null);
 assert.equal(triageBounty({url:'https://github.com/a/oss-bot-trap-benchmark/issues/1',title:'Test'}),null);
 assert.equal(buildReport(input).summary.candidates,2);
});
test('flags stale feed and crowdsourced payouts as not authoritative',()=>{
 const report=buildReport(input,{now:new Date('2026-11-25T21:00:00Z')});
 assert.equal(report.feed_stale,true);
 const crowded=report.opportunities.find(x=>x.competing_prs===17);
 assert.equal(crowded.state,'LOW_PRIORITY');
 assert.ok(crowded.red_flags.includes('competing_pull_requests'));
});
