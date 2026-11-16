/**
 * Lift v0.4 encrypted evidence LAB. Fixed fictional fixtures only.
 * No real documents, bills, names, uploads, public HTTP routes or donations.
 * This is not an approved production vault or a substitute for a security audit.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv,createHash,createHmac,hkdfSync} from 'node:crypto';
import {verifyEvercraftSession} from '../evercraft-home/identity.mjs';
import {liftSubjectActorId} from './identity-boundary.mjs';

const SCHEMA='evercraft.lift.lab-evidence.v1';
const TOMBSTONE='evercraft.lift.lab-evidence-revoked.v1';
const CASE_ID=/^lab_case_[a-z0-9_]{3,48}$/;
const EVIDENCE_ID=/^lab_evidence_[a-z0-9_]{3,48}$/;
const FIXTURES=new Set(['FICTIONAL-UTILITY-001','FICTIONAL-HEATING-001','FICTIONAL-PROVIDER-001']);
const fail=(code)=>{throw new Error('lift_lab_vault_blocked:'+code)};
const isObject=(v)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const SHA=(x)=>createHash('sha256').update(x).digest('hex');
function iso(now){
  const value=now===undefined?new Date():new Date(now);
  if(!Number.isFinite(value.getTime()))fail('invalid_clock');
  return value.toISOString();
}
function filename(directory,caseId,evidenceId){
  if(!CASE_ID.test(caseId||'')||!EVIDENCE_ID.test(evidenceId||''))fail('synthetic_identifier_required');
  return path.join(directory,SHA('lift-evidence-v1:'+caseId+':'+evidenceId)+'.json');
}
async function writeAtomic(directory,filename,record){
  const temp=path.join(directory,'.pending-'+randomBytes(12).toString('hex'));
  let handle;
  try{
    handle=await fs.open(temp,'wx',0o600);
    await handle.writeFile(JSON.stringify(record)+'\n','utf8');
    await handle.sync();
    await handle.close();handle=null;
    await fs.rename(temp,filename);
    const dh=await fs.open(directory,'r');
    try{await dh.sync();}finally{await dh.close();}
  }catch(error){
    if(handle)await handle.close().catch(()=>{});
    await fs.unlink(temp).catch(()=>{});
    throw error;
  }
}
async function fileRecord(file){
  let stat;
  try{stat=await fs.lstat(file);}
  catch(error){if(error?.code==='ENOENT')fail('not_found');throw error;}
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size>8192)fail('unsafe_record');
  let record;
  try{record=JSON.parse(await fs.readFile(file,'utf8'));}
  catch{fail('invalid_record');}
  if(!isObject(record))fail('invalid_record');
  return record;
}
export async function openLiftEvidenceVaultLab({
  directory,masterKey,identity,passport,keyring,loadCase,
}={}){
  if(typeof directory!=='string'||!path.isAbsolute(directory))fail('absolute_directory_required');
  if(!Buffer.isBuffer(masterKey)||masterKey.length!==32)fail('32_byte_master_key_required');
  if(!identity||typeof identity.assertSessionActive!=='function'||
    !passport||typeof passport.authorize!=='function'||typeof passport.getGrantState!=='function'||
    !keyring||typeof loadCase!=='function')fail('identity_passport_and_private_loader_required');

  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const dirStat=await fs.lstat(directory);
  if(!dirStat.isDirectory()||dirStat.isSymbolicLink()||(dirStat.mode&0o077)!==0)fail('unsafe_directory');

  const lockfile=path.join(directory,'.lift-evidence-vault.lock');
  const secret=Buffer.from(masterKey);
  let lock;
  try{lock=await fs.open(lockfile,'wx',0o600);}
  catch(error){secret.fill(0);throw error;}

  let chain=Promise.resolve(),closed=false;
  const serial=(fn)=>{
    const next=chain.then(fn);
    chain=next.catch(()=>{});
    return next;
  };
  function caseKey(caseId){
    return Buffer.from(hkdfSync('sha256',secret,Buffer.from(caseId),
      Buffer.from('evercraft.lift.lab.vault.aes-gcm.v1'),32));
  }
  function auth(token,caseId,scope,now){
    if(closed)fail('closed');
    if(typeof token!=='string'||token.length>12000||!token)fail('session_required');
    if(!CASE_ID.test(caseId||''))fail('synthetic_case_required');
    const at=iso(now);
    const session=verifyEvercraftSession(token,keyring,{now:new Date(at)});
    identity.assertSessionActive(session);
    const record=loadCase(caseId);
    if(record?.schema!=='evercraft.lift.case-workflow.v1'||record.id!==caseId)fail('case_not_found');
    const resource='lift:case:'+caseId;
    const decision=passport.authorize({
      subject_ref:session.subject_ref,product:'evercraft-lift',
      scope:'evidence.'+scope,resource_ref:resource,at,
    });
    if(decision.decision!=='allow'||!decision.grant_id)fail('no_evidence_scope');
    const grant=passport.getGrantState(decision.grant_id,{at});
    // Explicit case grants. Broad portfolio-wide grants cannot read a private bill.
    if(!grant.active||grant.product!=='evercraft-lift'||
       !Array.isArray(grant.resource_refs)||!grant.resource_refs.includes(resource))fail('exact_case_grant_required');
    const isOwner=record.owner_id===liftSubjectActorId(session.subject_ref);
    if((scope==='write'||scope==='revoke')&&!isOwner)fail('case_owner_required');
    if(scope==='write'&&!['submitted','screening'].includes(record.status))fail('case_not_accepting_evidence');
    if(scope==='read'&&['withdrawn','rejected'].includes(record.status))fail('case_not_readable');
    return record;
  }
  function aad(caseId,evidenceId){
    return Buffer.from(SCHEMA+':'+caseId+':'+evidenceId+':1');
  }
  function seal(caseId,evidenceId,fixtureCode){
    const iv=randomBytes(12),key=caseKey(caseId);
    const cipher=createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(aad(caseId,evidenceId));
    const plaintext=Buffer.from(JSON.stringify({
      schema:'evercraft.lift.lab-evidence-fixture.v1',
      case_id:caseId,evidence_id:evidenceId,fixture_code:fixtureCode,
    }));
    try{
      const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
      return {schema:SCHEMA,case_id:caseId,evidence_id:evidenceId,version:1,
        nonce:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),
        ciphertext:ciphertext.toString('base64url')};
    }finally{key.fill(0);plaintext.fill(0);}
  }
  function open(record,caseId,evidenceId){
    if(record.schema===TOMBSTONE){
      const key=caseKey(caseId);
      try{
        const mac=createHmac('sha256',key).update(TOMBSTONE+':'+caseId+':'+evidenceId).digest('base64url');
        if(record.case_id!==caseId||record.evidence_id!==evidenceId||record.mac!==mac)fail('invalid_tombstone');
        fail('evidence_revoked');
      }finally{key.fill(0);}
    }
    if(record.schema!==SCHEMA||record.case_id!==caseId||record.evidence_id!==evidenceId||
       record.version!==1)fail('invalid_envelope');
    const iv=Buffer.from(record.nonce||'','base64url');
    const tag=Buffer.from(record.tag||'','base64url');
    const ciphertext=Buffer.from(record.ciphertext||'','base64url');
    if(iv.length!==12||tag.length!==16||ciphertext.length<16||ciphertext.length>2048)fail('invalid_ciphertext');
    const key=caseKey(caseId);
    try{
      const decipher=createDecipheriv('aes-256-gcm',key,iv);
      decipher.setAAD(aad(caseId,evidenceId));
      decipher.setAuthTag(tag);
      const clear=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
      try{
        const result=JSON.parse(clear.toString('utf8'));
        if(result.schema!=='evercraft.lift.lab-evidence-fixture.v1'||
          result.case_id!==caseId||result.evidence_id!==evidenceId||
          !FIXTURES.has(result.fixture_code))fail('invalid_fixture');
        return Object.freeze({case_id:caseId,evidence_id:evidenceId,fixture_code:result.fixture_code,fictional:true});
      }finally{clear.fill(0);}
    }catch(error){
      if(String(error?.message||'').startsWith('lift_lab_vault_blocked:'))throw error;
      fail('ciphertext_authentication_failed');
    }finally{key.fill(0);}
  }
  const api={
    put:({token,caseId,evidenceId,fixtureCode,now}={})=>serial(async()=>{
      auth(token,caseId,'write',now);
      if(!EVIDENCE_ID.test(evidenceId||'')||!FIXTURES.has(fixtureCode))fail('fictional_fixture_only');
      const file=filename(directory,caseId,evidenceId);
      try{await fs.lstat(file);fail('already_exists');}
      catch(error){if(error?.code!=='ENOENT')throw error;}
      await writeAtomic(directory,file,seal(caseId,evidenceId,fixtureCode));
      return {case_id:caseId,evidence_id:evidenceId,encrypted:true,fictional:true};
    }),
    get:({token,caseId,evidenceId,now}={})=>serial(async()=>{
      auth(token,caseId,'read',now);
      return open(await fileRecord(filename(directory,caseId,evidenceId)),caseId,evidenceId);
    }),
    revoke:({token,caseId,evidenceId,now}={})=>serial(async()=>{
      auth(token,caseId,'revoke',now);
      const file=filename(directory,caseId,evidenceId);
      const record=await fileRecord(file);
      if(record.schema===TOMBSTONE)fail('already_revoked');
      // Verify authenticity before marking as revoked; do not mask corruption.
      open(record,caseId,evidenceId);
      const key=caseKey(caseId);
      let mac;
      try{mac=createHmac('sha256',key).update(TOMBSTONE+':'+caseId+':'+evidenceId).digest('base64url');}
      finally{key.fill(0);}
      await writeAtomic(directory,file,{schema:TOMBSTONE,case_id:caseId,evidence_id:evidenceId,mac});
      return {case_id:caseId,evidence_id:evidenceId,revoked:true,secure_erase_proven:false};
    }),
    close:()=>{
      if(closed)return chain;
      closed=true;
      return serial(async()=>{
        try{await lock.close();await fs.unlink(lockfile);}
        finally{secret.fill(0);}
      });
    },
  };
  return Object.freeze(api);
}
