// Deterministic, no-network synthetic geological research smoke worker.
// Runs ONLY on an internally generated 48x48 fixture. Does not load
// competition data, process private submissions or connect to production.
// Its result demonstrates compute+receipt, NOT GEMS model quality.
import {createHash} from 'node:crypto';

const N=48;
const sha=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sigmoid=z=>1/(1+Math.exp(-Math.max(-25,Math.min(25,z))));
const mean=(xs)=>xs.reduce((a,b)=>a+b,0)/Math.max(xs.length,1);
const dist=(x,y)=>Math.min(Math.abs(y-(12+0.31*x)),
  Math.abs(y-(37-0.23*x)),Math.abs(y-(6+0.75*x)));
function fixture(){
 const rows=[];
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  const d=dist(x,y), known=d<0.8&&x<33;
  const fault=d<0.8;
  // Synthetic geophysical channels: peak, ridge gradient, deterministic noise.
  const noise=Math.sin(x*5.31+y*2.13)*0.055+Math.cos(x*1.9-y*3.17)*0.04;
  const peak=Math.exp(-d*d/5)+noise;
  const gradient=Math.exp(-Math.abs(d)/3)*0.75+Math.sin(x*0.41)*0.09;
  const texture=Math.cos((x+y)*0.19)*0.15+noise;
  rows.push({x,y,features:[1,peak,gradient,texture],label:known?1:0,actual:fault?1:0,
    train:x<33,holdout:x>=33});
 }
 return rows;
}
function train(rows,exclusion){
 const positives=rows.filter(r=>r.train&&r.label===1);
 const unlabeled=rows.filter(r=>r.train&&r.label===0&&
  (exclusion===0||dist(r.x,r.y)>exclusion));
 if(!positives.length||!unlabeled.length)throw Error('fixture_sampling_empty');
 const negativeCount=Math.min(unlabeled.length,positives.length*5);
 // Stable, sparse negative sampler to prevent accidental runtime randomness.
 const negatives=Array.from({length:negativeCount},(_,i)=>
  unlabeled[Math.floor(i*unlabeled.length/negativeCount)]);
 const examples=[...positives,...negatives];
 const weights=[-2.0,1.0,0.8,0.1],rate=0.18;
 for(let epoch=0;epoch<180;epoch++){
  const gradient=[0,0,0,0];
  for(const row of examples){
   const p=sigmoid(row.features.reduce((s,v,j)=>s+v*weights[j],0));
   for(let j=0;j<4;j++)gradient[j]+=(p-row.label)*row.features[j];
  }
  for(let j=0;j<4;j++)weights[j]-=rate*gradient[j]/examples.length;
 }
 return {weights,positives:positives.length,negatives:negatives.length};
}
function score(rows,weights){
 const predicted=rows.map(r=>sigmoid(r.features.reduce((s,v,j)=>s+v*weights[j],0)));
 const targets=rows.map(r=>r.actual);
 let tp=0,fp=0,fn=0;
 for(let i=0;i<rows.length;i++){
  const label=predicted[i]>=0.5, actual=targets[i]===1;
  if(label&&actual)tp++;else if(label)fp++;else if(actual)fn++;
 }
 return {precision:tp+fp?tp/(tp+fp):0,recall:tp+fn?tp/(tp+fn):0,
  f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):0,
  mean_probability:mean(predicted),positive_pixels:targets.filter(Boolean).length,
  true_positive:tp,false_positive:fp,false_negative:fn};
}
export function runSyntheticGemsResearchSmoke({fixtureVersion='v1'}={}){
 if(fixtureVersion!=='v1')throw Error('unsupported_fixed_fixture');
 const all=fixture(),holdout=all.filter(r=>r.holdout);
 const rows=[
  {variant:'unlabeled-as-negative',exclusion:0},
  {variant:'exclude-near-unlabeled',exclusion:3},
 ];
 const results=rows.map(row=>{
  const trained=train(all,row.exclusion);
  return {variant:row.variant,exclusion_pixels:row.exclusion,
   train_positive_count:trained.positives,train_negative_count:trained.negatives,
   heldout:score(holdout,trained.weights),
   weights:trained.weights.map(v=>Number(v.toFixed(8)))};
 });
 const input={fixture:'synthetic-fixed-v1',width:N,height:N,
  feature_count:4,positive_definition:'distance-to-synthetic-fault<0.8',
  training_region:'x<33',holdout_region:'x>=33'};
 const body={schema:'evercraft.gems.synthetic-compute-receipt.v1',
  state:'computed_synthetic_fixture_only',worker:'github-actions-synthetic-smoke',
  real_gems_dataset_used:false,drivendata_submission_made:false,
  production_runtime_touched:false,external_network_called:false,
  official_dti_claimed:false,paid_compute_charged:false,
  input_sha256:sha(input),inputs:input,results,metrics:'synthetic pixel-level F1, not official GEMS DTI'};
 return Object.freeze({...body,receipt_sha256:sha(body)});
}
