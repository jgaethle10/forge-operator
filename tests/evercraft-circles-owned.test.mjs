import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EvercraftCirclesKernel} from '../systemia/circles/kernel.mjs';

const principals=new Set(['owner_001','member_002','member_003','member_004','outsider_005']);
function fixture(){
 const calls=[];
 let i=0;
 const kernel=new EvercraftCirclesKernel({
  authorize:({principal,scope,resource})=>{
   calls.push({principal,scope,resource});
   return principals.has(principal);
  },
  now:()=>new Date('2026-11-05T20:00:00.000Z').toISOString(),
  newId:()=>String(++i).padStart(4,'0'),
 });
 return {kernel,calls};
}
function seed(){
 const {kernel,calls}=fixture();
 const {circle_id:circleId}=kernel.createCircle('owner_001',{
  name:'Yakima Founding Circle',region:'Yakima, WA',kind:'home',profession:'Organizer'});
 const owner=kernel.roster('owner_001',{circleId});
 assert.equal(owner.counts.active,1);
 return {kernel,calls,circleId};
}

test('Missing trusted identity verifier denies ALL member operations',()=>{
 const k=new EvercraftCirclesKernel();
 assert.throws(()=>k.createCircle('owner_001',{name:'X',region:'Yakima'}),/identity_authorization_required/);
 assert.throws(()=>k.roster('owner_001',{circleId:'anything'}),/identity_authorization_required/);
 assert.throws(()=>k.applyForSeat('owner_001',{circleId:'anything',profession:'Plumbing'}),/identity_authorization_required/);
 assert.deepEqual(k.publicReadiness(),{
  schema:'evercraft.circles.domain-readiness.v1',
  domain_engine:'source_only',private_membership_api_live:false,
  payment_ready:false,founding_enrollment_live:false
 });
});
test('Applicant cannot self-approve; organizer can approve with one category seat',()=>{
 const {kernel:k,circleId}=seed();
 const app=k.applyForSeat('member_002',{circleId,profession:'Plumbing',reason:'Local contractor'});
 assert.equal(app.member,false);assert.equal(app.paid,false);
 assert.throws(()=>k.reviewApplication('member_002',{applicationId:app.application_id,decision:'approve'}),/active_membership_required/);
 assert.deepEqual(k.reviewApplication('owner_001',{applicationId:app.application_id,decision:'approve'}),
  {application_id:app.application_id,state:'approved'});
 const second=k.applyForSeat('member_003',{circleId,profession:'PLUMBING'});
 assert.throws(()=>k.reviewApplication('owner_001',{applicationId:second.application_id,decision:'approve'}),/category_seat_taken/);
 assert.equal(k.roster('owner_001',{circleId}).counts.active,2);
});
test('Invitations must be accepted by the named recipient before joining',()=>{
 const {kernel:k,circleId}=seed();
 const offer=k.invite('owner_001',{circleId,targetPrincipal:'member_002',profession:'Electrician'});
 assert.equal(offer.membership_created,false);
 assert.equal(k.roster('owner_001',{circleId}).counts.active,1);
 assert.throws(()=>k.respondInvitation('outsider_005',{invitationId:offer.invitation_id,accept:true}),/invitation_not_yours/);
 const accepted=k.respondInvitation('member_002',{invitationId:offer.invitation_id,accept:true});
 assert.equal(accepted.state,'accepted');
 assert.equal(k.roster('owner_001',{circleId}).counts.active,2);
 assert.throws(()=>k.respondInvitation('member_002',{invitationId:offer.invitation_id,accept:true}),/invitation_already_resolved/);
});
test('Roster visibility is opt-in; one member cannot read a different circle',()=>{
 const {kernel:k,circleId}=seed();
 const app=k.applyForSeat('member_002',{circleId,profession:'HVAC'});
 k.reviewApplication('owner_001',{applicationId:app.application_id,decision:'approve'});
 assert.deepEqual(k.roster('member_002',{circleId}).members.map(x=>x.principal_ref),['member_002']);
 k.setRosterVisibility('owner_001',{circleId,visible:true});
 assert.deepEqual(k.roster('member_002',{circleId}).members.map(x=>x.principal_ref),['owner_001','member_002']);
 const other=k.createCircle('member_003',{name:'Spokane Home',region:'Spokane, WA'});
 assert.throws(()=>k.roster('member_002',{circleId:other.circle_id}),/active_membership_required/);
 assert.throws(()=>k.requestIntroduction('member_002',{circleId:other.circle_id,recipientPrincipal:'member_003',purpose:'Hello'}),/active_membership_required/);
});
test('Introductions cannot leak to unrelated members and require recipient consent',()=>{
 const {kernel:k,circleId}=seed();
 const a=k.applyForSeat('member_002',{circleId,profession:'Electrician'});
 const b=k.applyForSeat('member_003',{circleId,profession:'Roofer'});
 const c=k.applyForSeat('member_004',{circleId,profession:'Builder'});
 for(const x of [a,b,c])k.reviewApplication('owner_001',{applicationId:x.application_id,decision:'approve'});
 const intent=k.requestIntroduction('member_002',{circleId,recipientPrincipal:'member_003',purpose:'Would you discuss a possible project?'});
 assert.equal(intent.contact_shared,false);
 assert.equal(k.myIntroductions('member_004',{circleId}).length,0);
 assert.equal(k.myIntroductions('member_002',{circleId}).length,1);
 assert.throws(()=>k.respondIntroduction('member_004',{introductionId:intent.introduction_id,accept:true}),/introduction_not_yours/);
 assert.equal(k.respondIntroduction('member_003',{introductionId:intent.introduction_id,accept:false}).state,'declined');
 assert.throws(()=>k.respondIntroduction('member_003',{introductionId:intent.introduction_id,accept:true}),/introduction_already_resolved/);
 assert.equal(k.myIntroductions('owner_001',{circleId}).length,0);
});
test('Production-public metadata cannot imply a live paid product',()=>{
 const source=readFileSync(new URL('../systemia/circles/kernel.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|\bXMLHttpRequest\b|https?:\/\/|base44\.app|Stripe\(|\blocalStorage\b/);
 assert.match(source,/identity_authorization_required/);
 assert.match(source,/payment_ready:false/);
});
