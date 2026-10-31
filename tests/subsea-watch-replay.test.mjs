import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeDive,parseCsv,parseInput,atTime,segments,brief} from '../public/subsea-watch/core.mjs';

const sample=JSON.parse(fs.readFileSync('public/subsea-watch/sample.json','utf8'));
const rawHtml=fs.readFileSync('public/subsea-watch/index.html','utf8');
const viewer=fs.readFileSync('public/subsea-watch/viewer.mjs','utf8');

test('sample is demonstrably synthetic; a pipe has unknown operation and isolation',()=>{
 const dive=normalizeDive(sample);
 assert.equal(dive.demo,true);
 assert.equal(dive.positionSource,'SIMULATED');
 assert.equal(dive.xyAvailable,true);
 assert.equal(dive.infrastructure?.operating_state,'unknown');
 assert.equal(dive.infrastructure?.isolation_status,'not_supplied');
 assert.equal(dive.points.length,37);
 assert.equal(dive.duration,180);
 assert.match(brief(dive),/Synthetic demonstration, not an actual dive/);
});
test('depth-only import explicitly disables 3D horizontal replay and pipes',()=>{
 const dive=parseInput(JSON.stringify({title:'Depth only',points:[{t_s:0,depth_m:1},{t_s:10,depth_m:8},{t_s:20,depth_m:4}]}),'a.json');
 assert.equal(dive.xyAvailable,false);
 assert.equal(dive.positionSource,null);
 assert.equal(dive.infrastructure,null);
 assert.equal(segments(dive).length,0);
 assert.equal(atTime(dive,5).x,null);
 assert.match(brief(dive),/Horizontal position: Unavailable/);
});
test('uploaded XY without a declared positioning method is rejected',()=>{
 assert.throws(()=>normalizeDive({points:[{t_s:0,depth_m:1,x_m:0,y_m:0},{t_s:5,depth_m:2,x_m:1,y_m:1}]}),/positioning method/);
});
test('partial positioning never creates a complete 3D track',()=>{
 const d=normalizeDive({position_source:'USBL',points:[{t_s:0,depth_m:0,x_m:0,y_m:0},{t_s:5,depth_m:3},{t_s:10,depth_m:4,x_m:10,y_m:5}]});
 assert.equal(d.xyAvailable,false);
 assert.equal(atTime(d,5).x,null);
});
test('diver position never interpolates across long unobserved gaps',()=>{
 const d=normalizeDive({position_source:'USBL',points:[{t_s:0,depth_m:1,x_m:0,y_m:0},{t_s:40,depth_m:8,x_m:20,y_m:0}]});
 assert.equal(d.xyAvailable,true);
 assert.equal(segments(d).length,0);
 assert.equal(atTime(d,20).x,null);
 assert.equal(atTime(d,20).depth,null,'long gaps must not invent depth');
 assert.equal(atTime(d,20).depthState,'gap_unobserved');
 assert.equal(atTime(d,20).positionState,'gap_not_interpolated');
 assert.equal(atTime(d,40).depth,8,'actual endpoint remains visible');
});
test('support simple local CSV without imaginary GPS',()=>{
 const d=parseInput('t_s,depth_m\n0,0\n12,10\n22,7','dive.csv');
 assert.equal(d.duration,22);
 assert.equal(d.maxDepth,10);
 assert.equal(d.xyAvailable,false);
 assert.equal(parseCsv('t_s,depth_m\n0,2\n8,6').points.length,2);
});
test('explicit acoustic coordinates are user-declared, not independently certified',()=>{
 const d=parseInput('t_s,depth_m,x_m,y_m,position_source\n0,0,1,2,USBL\n7,3,2,4,USBL','dive.csv');
 assert.equal(d.xyAvailable,true);
 assert.equal(d.demo,false);
 assert.equal(d.xyState,'user_declared_position_source_unverified');
 assert.equal(d.infrastructure,null);
});
test('depth and time bounds, duplicate samples and oversized imports are rejected',()=>{
 assert.throws(()=>normalizeDive({points:[{t_s:0,depth_m:-2},{t_s:3,depth_m:1}]}),/Invalid time or depth/);
 assert.throws(()=>normalizeDive({points:[{t_s:3,depth_m:1},{t_s:3,depth_m:3}]}),/Duplicate/);
 assert.throws(()=>parseInput('x'.repeat(2000001),'dive.json'),/2 MB/);
});
test('customer page is an interactive local-first prototype with non-clearance disclosure',()=>{
 for(const id of ['world','profile','scrub','play','speed','file-input','export','no-xy'])assert.match(rawHtml,new RegExp('id="'+id+'"'));
 assert.match(rawHtml,/Prototype, not a safety device/);
 assert.match(rawHtml,/noindex,nofollow/);
 assert.match(rawHtml,/not a survey|NOT BATHYMETRY/i);
 assert.match(viewer,/from '\.\/core\.mjs'/);
 assert.match(viewer,/parseInput/);
 assert.doesNotMatch(viewer,/https?:\/\/|XMLHttpRequest|sendBeacon|localStorage|sessionStorage/);
});
