import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCaseReadiness} from './case-readiness.mjs';
test('public description with missing metadata remains unready',()=>{
 const v=evaluateCaseReadiness({id:'PR-049',facts:{nativeMedia:null,slantRange:null,timeCalibration:null}});
 assert.equal(v.state,'UNREADY_FOR_3D_MOTION');
 assert.ok(v.unknownFields.includes('slantRange'));
 assert.equal(v.extraordinaryPerformanceEstablished,false);
});
test('complete single-view geometric dataset passes input screen only',()=>{
 const f={calibratedBearings:true,timeCalibration:true,observerPositions:true,observerAttitudes:true,slantRange:true};
 const r=evaluateCaseReadiness({id:'SYNTHETIC',facts:f});
 assert.equal(r.methods.single_view_3d_trajectory,true);
 assert.equal(r.extraordinaryPerformanceEstablished,false);
 assert.equal(r.methods.independently_replayable,false);
});
test('dual independently surveyed observations may enable triangulation without direct range',()=>{
 const f={calibratedBearings:true,timeCalibration:true,observerPositions:true,observerAttitudes:true,syncedIndependentSecondView:true,independentObserverPositions:true};
 const r=evaluateCaseReadiness({id:'SYNTHETIC-2',facts:f});
 assert.equal(r.methods.single_view_3d_trajectory,false);
 assert.equal(r.methods.dual_view_triangulation_possible,true);
});
test('unknown is not a confirmed absence',()=>{
 const r=evaluateCaseReadiness({id:'X',facts:{nativeMedia:false,slantRange:null}});
 assert.ok(r.confirmedMissingFields.includes('nativeMedia'));
 assert.ok(!r.confirmedMissingFields.includes('slantRange'));
 assert.ok(r.unknownFields.includes('slantRange'));
});
test('rejects unsupported fact keys and fabricated values',()=>{
 assert.throws(()=>evaluateCaseReadiness({id:'X',facts:{nativeMedia:'maybe'}}),/true, false, or null/);
 assert.throws(()=>evaluateCaseReadiness({id:'X',facts:{alienCraft:true}}),/Unknown evidence field/);
 assert.throws(()=>evaluateCaseReadiness({id:'',facts:{}}),/id required/);
});
