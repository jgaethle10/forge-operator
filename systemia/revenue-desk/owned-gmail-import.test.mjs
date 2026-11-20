import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fetchOwnedGmailMetadata,savePrivateGmailSnapshot,parseGmailMetadata} from './owned-gmail-import.mjs';
const at='2026-11-19T21:12:00-08:00';
const header=(name,value)=>({name,value});
const sent=(id,to)=>({id,threadId:'thread-'+id,labelIds:['SENT'],
 internalDate:String(Date.parse(at)-10000),payload:{headers:[
  header('From','Evercraft <outreach@evercraft.example>'),
  header('To',to),header('Cc','Approvals <approved@example.test>')]}});
const inbound=id=>({id,threadId:'thread-'+id,labelIds:['INBOX'],
 internalDate:String(Date.parse(at)-20000),payload:{headers:[
  header('From','Buyer Person <buyer@example.test>'),header('To','Evercraft <outreach@evercraft.example>')]}});
const token='fixture-token-for-tests-not-a-real-google-key';
test('owned importer reads all pages and only Gmail message metadata, never bodies',async()=>{
 const calls=[];
 const fetchImpl=async(url,opts)=>{
  calls.push({url,method:opts.method,auth:opts.headers.Authorization});
  const u=new URL(url);
  if(u.pathname.endsWith('/messages')){
   return {ok:true,json:async()=>u.searchParams.has('pageToken')?
    {messages:[{id:'b'}]}:{messages:[{id:'a'},{id:'a'}],nextPageToken:'next'}};
  }
  const id=u.pathname.split('/').pop();
  assert.equal(u.searchParams.get('format'),'metadata');
  assert.ok(!u.searchParams.has('format=full'));
  return {ok:true,json:async()=>id==='a'?sent('a','Owner <owner@one.example>'):inbound('b')};
 };
 const result=await fetchOwnedGmailMetadata({accessToken:token,now:at,fetchImpl});
 assert.equal(result.listing_exhausted,true);
 assert.equal(result.messages.length,2);
 assert.equal(result.listing_pages,2);
 assert.equal(result.messages[0].direction,'outbound');
 assert.deepEqual(result.messages[0].to_addresses,['owner@one.example','approved@example.test']);
 assert.equal(result.messages[1].direction,'inbound');
 assert.equal(result.provider_send_performed,false);
 assert.ok(calls.every(x=>x.method==='GET'&&x.auth==='Bearer '+token));
 assert.ok(calls.every(x=>!x.url.includes('/send')));
 assert.ok(!JSON.stringify(result).includes('payload'));
});
test('metadata parser detects bounce and automatic replies without asserting positive buyer reply',()=>{
 const msg=inbound('automated');
 msg.payload.headers.push(header('Auto-Submitted','auto-replied'));
 msg.payload.headers[0]=header('From','mailer-daemon@example.test');
 const r=parseGmailMetadata(msg);
 assert.equal(r.is_auto_reply,true);assert.equal(r.is_bounce,true);
});
test('missing To/Bcc prevents sending-budget inference downstream',()=>{
 const msg=sent('missing','');
 const r=parseGmailMetadata(msg);
 assert.deepEqual(r.to_addresses,['approved@example.test']);
 const bad={...msg,payload:{headers:[header('From','Evercraft <outreach@evercraft.example>')]}};
 assert.deepEqual(parseGmailMetadata(bad).to_addresses,[]);
});
test('pagination cap, failed Gmail auth and rate limit stop without partial proof',async()=>{
 const page=async()=>({ok:true,json:async()=>({messages:[{id:'a'}],nextPageToken:'another'})});
 await assert.rejects(fetchOwnedGmailMetadata({accessToken:token,now:at,maxPages:1,fetchImpl:page}),/page_limit_incomplete/);
 for(const [status,pattern] of [[401,/authorization_or_scope/],[429,/rate_limited/]]){
  await assert.rejects(fetchOwnedGmailMetadata({accessToken:token,now:at,fetchImpl:async()=>({ok:false,status})}),pattern);
 }
});
test('mode-0600 private snapshots persist without overwriting',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-gmail-ingest-'));
 try{
  const outFile=path.join(root,'gmail.json');
  const result=savePrivateGmailSnapshot({snapshot:{messages:[]},outFile});
  assert.equal(result.read_only,true);
  assert.equal(fs.statSync(outFile).mode&0o077,0);
  assert.throws(()=>savePrivateGmailSnapshot({snapshot:{messages:[]},outFile}),/EEXIST/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
