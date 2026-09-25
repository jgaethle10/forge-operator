#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

const inputPath=process.argv[2];
const mode=process.argv.includes('--publish')?'publish':'preflight';
if(!inputPath) throw new Error('usage: reddit-publisher.mjs <post.json> [--publish]');
const post=JSON.parse(fs.readFileSync(inputPath,'utf8'));

const required=['title','body','destination'];
for(const k of required) if(!post[k]) throw new Error('missing '+k);
if(!/^u\/|^r\//.test(post.destination)) throw new Error('destination must be u/<profile> or r/<subreddit>');
if(post.destination.startsWith('r/') && post.community_rules_checked!==true) throw new Error('subreddit publication requires community_rules_checked=true');
if(post.affiliation_disclosed!==true) throw new Error('Evercraft affiliation disclosure required');
if(post.unsolicited_dm===true || post.vote_solicitation===true) throw new Error('spam/engagement manipulation prohibited');

const receipt={
 schema:'evercraft.publisher.receipt.v1',
 adapter:'evercraft.reddit.oauth.v1',
 mode,
 destination:post.destination,
 content_sha256:crypto.createHash('sha256').update(post.title+'\n'+post.body).digest('hex'),
 created_at:new Date().toISOString(),
 state:'preflight_passed'
};

if(mode==='publish'){
 const clientId=process.env.REDDIT_CLIENT_ID;
 const clientSecret=process.env.REDDIT_CLIENT_SECRET;
 const refreshToken=process.env.REDDIT_REFRESH_TOKEN;
 const userAgent=process.env.REDDIT_USER_AGENT || 'EvercraftPublisher/1.0';
 if(!clientId||!clientSecret||!refreshToken) {
   receipt.state='blocked_authorization_missing';
   console.log(JSON.stringify(receipt,null,2));
   process.exit(3);
 }
 const basic=Buffer.from(clientId+':'+clientSecret).toString('base64');
 const tokenRes=await fetch('https://www.reddit.com/api/v1/access_token',{
   method:'POST',
   headers:{Authorization:'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded','User-Agent':userAgent},
   body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken})
 });
 if(!tokenRes.ok) throw new Error('reddit token exchange failed '+tokenRes.status);
 const token=(await tokenRes.json()).access_token;
 const sr=post.destination.replace(/^r\//,'').replace(/^u\//,'u_');
 const form=new URLSearchParams({api_type:'json',kind:'self',sr,title:post.title,text:post.body,resubmit:'false',sendreplies:'true'});
 const submit=await fetch('https://oauth.reddit.com/api/submit',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/x-www-form-urlencoded','User-Agent':userAgent},body:form});
 const data=await submit.json();
 if(!submit.ok || data?.json?.errors?.length) throw new Error('reddit publish rejected '+JSON.stringify(data?.json?.errors||submit.status));
 receipt.state='published';
 receipt.external_url=data?.json?.data?.url||null;
 receipt.external_id=data?.json?.data?.id||null;
}
console.log(JSON.stringify(receipt,null,2));
