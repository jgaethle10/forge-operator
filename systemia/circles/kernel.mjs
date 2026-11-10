// Evercraft Circles: authenticated domain kernel, NOT a public HTTP endpoint.
// All principals must be resolved by a trusted identity/session layer.
// Missing authorization fails closed. No legacy-provider, network, payment or storage calls.
import {randomUUID} from 'node:crypto';

const CATEGORIES = new Set(['home','regional','national','international','specialty','opportunity','mentor']);
const clean=(value,max=120)=>{
 if(typeof value!=='string' || value.length>max)return null;
 const text=value.normalize('NFKC').trim().replace(/\s+/g,' ');
 return text && !/[\u0000-\u001f\u007f]/.test(text) ? text : null;
};
const requireText=(value,name,max=120)=>{
 const text=clean(value,max);
 if(!text)throw Error(name+'_invalid');
 return text;
};
const categoryKey=value=>requireText(value,'profession',80).toLowerCase();
function safePrincipal(value){
 const text=requireText(value,'principal',160);
 if(!/^[A-Za-z0-9][A-Za-z0-9:_@.-]{2,159}$/.test(text))throw Error('principal_invalid');
 return text;
}
function clone(value){return structuredClone(value)}
function ensure(value,error){if(!value)throw Error(error)}

export class EvercraftCirclesKernel {
 #circles=new Map();
 #memberships=new Map();
 #applications=new Map();
 #invitations=new Map();
 #introductions=new Map();
 #authorize;
 #newId;
 #now;
 constructor({authorize,now=()=>new Date().toISOString(),newId=()=>randomUUID()}={}){
  this.#authorize=typeof authorize==='function'?authorize:()=>false;
  this.#now=now;this.#newId=newId;
 }
 #actor(actor,scope,resource){
  const id=safePrincipal(actor);
  ensure(this.#authorize({principal:id,scope,resource})===true,'identity_authorization_required');
  return id;
 }
 #circle(circleId){
  const result=this.#circles.get(String(circleId||''));
  ensure(result,'circle_not_found');return result;
 }
 #members(circleId){return [...this.#memberships.values()].filter(m=>m.circle_id===circleId)}
 #member(circleId,actor){
  const membership=this.#memberships.get(circleId+'|'+actor);
  ensure(membership?.status==='active','active_membership_required');
  return membership;
 }
 #admin(circleId,actor){
  const membership=this.#member(circleId,actor);
  ensure(membership.role==='admin','circle_admin_required');
  return membership;
 }
 #vacant(circleId,profession){
  const key=categoryKey(profession);
  ensure(!this.#members(circleId).some(m=>m.status==='active'&&m.profession_key===key),'category_seat_taken');
  return key;
 }
 createCircle(actor,{name,region,kind='home',profession='Circle organizer'}={}){
  const principal=this.#actor(actor,'circles.create','new_circle');
  const label=requireText(name,'name',120);
  const area=requireText(region,'region',120);
  ensure(CATEGORIES.has(kind),'circle_kind_invalid');
  const id='circle_'+this.#newId();
  const circle={id,name:label,region:area,kind,created_at:this.#now(),state:'private'};
  const professionLabel=requireText(profession,'profession',80);
  const member={circle_id:id,principal_ref:principal,status:'active',role:'admin',
    profession:professionLabel,profession_key:categoryKey(professionLabel),
    visible_to_members:false,joined_at:this.#now()};
  this.#circles.set(id,circle);
  this.#memberships.set(id+'|'+principal,member);
  return {circle_id:id,state:'private',organizer_membership_created:true};
 }
 applyForSeat(actor,{circleId,profession,reason=''}={}){
  const principal=this.#actor(actor,'circles.apply',String(circleId||''));
  const circle=this.#circle(circleId);
  ensure(circle.state==='private','circle_unavailable');
  ensure(!this.#memberships.has(circleId+'|'+principal),'already_a_member');
  ensure(![...this.#applications.values()].some(a=>a.circle_id===circleId&&a.principal_ref===principal&&a.state==='pending'),'application_already_pending');
  const professionLabel=requireText(profession,'profession',80);
  const why=reason ? requireText(reason,'reason',300) : '';
  const application={id:'application_'+this.#newId(),circle_id:circleId,principal_ref:principal,
    profession:professionLabel,reason:why,state:'pending',submitted_at:this.#now()};
  this.#applications.set(application.id,application);
  return {application_id:application.id,state:'pending',paid:false,member:false};
 }
 reviewApplication(actor,{applicationId,decision}={}){
  const principal=this.#actor(actor,'circles.application.review',String(applicationId||''));
  const application=this.#applications.get(String(applicationId||''));
  ensure(application,'application_not_found');
  this.#admin(application.circle_id,principal);
  ensure(application.state==='pending','application_already_reviewed');
  ensure(['approve','reject'].includes(decision),'decision_invalid');
  if(decision==='approve'){
   ensure(!this.#memberships.has(application.circle_id+'|'+application.principal_ref),'already_a_member');
   const key=this.#vacant(application.circle_id,application.profession);
   const member={circle_id:application.circle_id,principal_ref:application.principal_ref,
     status:'active',role:'member',profession:application.profession,
     profession_key:key,visible_to_members:false,joined_at:this.#now()};
   this.#memberships.set(application.circle_id+'|'+application.principal_ref,member);
  }
  application.state=decision==='approve'?'approved':'rejected';
  application.reviewed_at=this.#now();
  return {application_id:application.id,state:application.state};
 }
 invite(actor,{circleId,targetPrincipal,profession}={}){
  const principal=this.#actor(actor,'circles.invitation.create',String(circleId||''));
  this.#circle(circleId);
  this.#admin(circleId,principal);
  const target=safePrincipal(targetPrincipal);
  ensure(target!==principal,'cannot_invite_self');
  ensure(!this.#memberships.has(circleId+'|'+target),'already_a_member');
  const professionLabel=requireText(profession,'profession',80);
  this.#vacant(circleId,professionLabel);
  ensure(![...this.#invitations.values()].some(i=>i.circle_id===circleId&&i.target_ref===target&&i.state==='pending'),'invitation_already_pending');
  const invitation={id:'invitation_'+this.#newId(),circle_id:circleId,issuer_ref:principal,
    target_ref:target,profession:professionLabel,state:'pending',created_at:this.#now()};
  this.#invitations.set(invitation.id,invitation);
  return {invitation_id:invitation.id,state:'pending',membership_created:false};
 }
 respondInvitation(actor,{invitationId,accept}={}){
  const principal=this.#actor(actor,'circles.invitation.respond',String(invitationId||''));
  const invitation=this.#invitations.get(String(invitationId||''));
  ensure(invitation,'invitation_not_found');
  ensure(invitation.target_ref===principal,'invitation_not_yours');
  ensure(invitation.state==='pending','invitation_already_resolved');
  ensure(typeof accept==='boolean','accept_boolean_required');
  if(accept){
   ensure(!this.#memberships.has(invitation.circle_id+'|'+principal),'already_a_member');
   const key=this.#vacant(invitation.circle_id,invitation.profession);
   this.#memberships.set(invitation.circle_id+'|'+principal,{
    circle_id:invitation.circle_id,principal_ref:principal,status:'active',role:'member',
    profession:invitation.profession,profession_key:key,
    visible_to_members:false,joined_at:this.#now()});
  }
  invitation.state=accept?'accepted':'declined';
  invitation.resolved_at=this.#now();
  return {invitation_id:invitation.id,state:invitation.state};
 }
 setRosterVisibility(actor,{circleId,visible}={}){
  const principal=this.#actor(actor,'circles.roster.update',String(circleId||''));
  ensure(typeof visible==='boolean','visibility_boolean_required');
  const membership=this.#member(circleId,principal);
  membership.visible_to_members=visible;
  return {circle_id:circleId,visible_to_members:visible};
 }
 roster(actor,{circleId}={}){
  const principal=this.#actor(actor,'circles.roster.read',String(circleId||''));
  this.#circle(circleId);
  const reader=this.#member(circleId,principal);
  const all=this.#members(circleId).filter(m=>m.status==='active');
  return {circle_id:circleId,
    members:all.filter(m=>m.visible_to_members||m.principal_ref===principal||reader.role==='admin')
      .map(m=>({principal_ref:m.principal_ref,profession:m.profession,role:m.role})),
    counts:{active:all.length,visible:all.filter(m=>m.visible_to_members).length}};
 }
 requestIntroduction(actor,{circleId,recipientPrincipal,purpose}={}){
  const principal=this.#actor(actor,'circles.introduction.request',String(circleId||''));
  this.#member(circleId,principal);
  const recipient=safePrincipal(recipientPrincipal);
  ensure(recipient!==principal,'cannot_introduce_self');
  this.#member(circleId,recipient);
  const reason=requireText(purpose,'purpose',280);
  const introduction={id:'intro_'+this.#newId(),circle_id:circleId,
    sender_ref:principal,recipient_ref:recipient,purpose:reason,state:'pending',
    requested_at:this.#now()};
  this.#introductions.set(introduction.id,introduction);
  return {introduction_id:introduction.id,state:'pending',contact_shared:false};
 }
 respondIntroduction(actor,{introductionId,accept}={}){
  const principal=this.#actor(actor,'circles.introduction.respond',String(introductionId||''));
  const intro=this.#introductions.get(String(introductionId||''));
  ensure(intro,'introduction_not_found');
  ensure(intro.recipient_ref===principal,'introduction_not_yours');
  this.#member(intro.circle_id,principal);
  ensure(intro.state==='pending','introduction_already_resolved');
  ensure(typeof accept==='boolean','accept_boolean_required');
  intro.state=accept?'accepted':'declined';
  intro.resolved_at=this.#now();
  return {introduction_id:intro.id,state:intro.state,contact_shared:false};
 }
 myIntroductions(actor,{circleId}={}){
  const principal=this.#actor(actor,'circles.introduction.read',String(circleId||''));
  this.#member(circleId,principal);
  return [...this.#introductions.values()].filter(i=>i.circle_id===circleId&&
    (i.sender_ref===principal||i.recipient_ref===principal)).map(clone);
 }
 // Public response never exposes profile, referrals, organizer identifiers, regions or seats.
 publicReadiness(){
  return {schema:'evercraft.circles.domain-readiness.v1',
    domain_engine:'source_only',private_membership_api_live:false,
    payment_ready:false,founding_enrollment_live:false};
 }
}
