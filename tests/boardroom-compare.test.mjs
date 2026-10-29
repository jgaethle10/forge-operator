import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReport,classifyStance,LIMITS} from '../public/mesh/ai-boardroom/compare/engine.mjs';
const a=[
 {label:'One',text:'I recommend launching a small pilot next month. Customer demand looks promising but budget is limited.'},
 {label:'Two',text:'Do not launch next month. Customers have not been surveyed and team capacity is uncertain.'},
 {label:'Three',text:'Pilot first with a small group. Only if results prove demand should we expand.'}
];
test('detects explicitly opposing directions in user-provided text only',()=>{
 const r=buildReport({question:'Should we launch next month?',answers:a});
 assert.equal(r.disagreement,true);assert.equal(r.answers[0].stance,'favors proceeding');
 assert.equal(r.answers[1].stance,'cautions against');assert.equal(r.answers[2].stance,'conditional or mixed');
 assert.ok(r.reportText.includes('No AI models were contacted.'));
});
test('does not claim model agreement from shared words',()=>{
 const r=buildReport({question:'What should we do?',answers:[
 {label:'A',text:'The business needs careful planning and additional information.'},
 {label:'B',text:'Business planning benefits from clearer evidence and customer feedback.'}
 ]});
 assert.equal(r.disagreement,false);assert.ok(r.reportText.includes('NOT PROOF OF AGREEMENT'));
});
test('rejects missing, repeated, and oversize answers',()=>{
 assert.throws(()=>buildReport({question:'',answers:a}),/question/i);
 assert.throws(()=>buildReport({question:'Q',answers:[a[0]]}),/two or three/i);
 assert.throws(()=>buildReport({question:'Q',answers:[a[0],{...a[1],label:'One'}]}),/distinct/i);
 assert.throws(()=>buildReport({question:'Q',answers:[a[0],{...a[1],text:'x'.repeat(LIMITS.answer+1)}]}),/6,000/i);
});
test('checks cautious and conditional phrasing',()=>{
 assert.equal(classifyStance('I do not recommend launching.'),'cautions against');
 assert.equal(classifyStance('Only if we have evidence should we proceed.'),'conditional or mixed');
});
