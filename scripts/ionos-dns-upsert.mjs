#!/usr/bin/env node
import process from 'node:process';

function arg(name, fallback='') {
  const i=process.argv.indexOf(name);
  return i>=0 && process.argv[i+1] ? process.argv[i+1] : fallback;
}
function fail(message, extra={}) {
  process.stderr.write(JSON.stringify({ok:false,error:message,...extra},null,2)+'\n');
  process.exit(1);
}
const apiKey=String(process.env.IONOS_API_KEY||'').trim();
const zoneName=String(arg('--zone')).trim().toLowerCase();
const recordName=String(arg('--name')).trim().toLowerCase().replace(/\.$/,'');
const type=String(arg('--type','A')).trim().toUpperCase();
const content=String(arg('--content')).trim();
const ttl=Number(arg('--ttl','3600'));

if(!apiKey) fail('IONOS_API_KEY is required');
if(!zoneName || !recordName || !content) fail('Required args: --zone, --name, --content');
if(!Number.isInteger(ttl) || ttl<60 || ttl>86400) fail('TTL must be an integer from 60 to 86400 seconds');
if(type!=='A') fail('This launcher currently permits A records only');
if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(content) || content.split('.').some(x=>Number(x)>255)) {
  fail('A record content must be a valid IPv4 address');
}
if(!(recordName===zoneName || recordName.endsWith('.'+zoneName))) {
  fail('Record name must belong to the requested zone');
}

const base='https://api.hosting.ionos.com/dns/v1';
const headers={
  'accept':'application/json',
  'content-type':'application/json',
  'x-api-key':apiKey,
};

async function request(url, options={}) {
  const res=await fetch(url,{...options,headers:{...headers,...(options.headers||{})}});
  const raw=await res.text();
  let body=null;
  if(raw) {
    try { body=JSON.parse(raw); } catch { body=raw; }
  }
  if(!res.ok) {
    fail('IONOS API request failed',{
      status:res.status,
      endpoint:new URL(url).pathname,
      response:body,
    });
  }
  return body;
}

const zones=await request(base+'/zones');
const matches=Array.isArray(zones)?zones.filter(z=>String(z?.name||'').toLowerCase()===zoneName):[];
if(matches.length!==1) fail('Expected exactly one matching IONOS DNS zone',{zone:zoneName,match_count:matches.length});
const zone=matches[0];

const zoneDetail=await request(base+'/zones/'+encodeURIComponent(zone.id));
const records=Array.isArray(zoneDetail?.records)?zoneDetail.records:[];
const existing=records.filter(r=>
  String(r?.name||'').toLowerCase().replace(/\.$/,'')===recordName &&
  String(r?.type||'').toUpperCase()===type
);

if(existing.length>1) {
  fail('Multiple matching records exist; refusing to guess which one to change',{
    zone:zoneName,
    name:recordName,
    type,
    record_ids:existing.map(r=>r.id),
  });
}

if(existing.length===1) {
  const current=existing[0];
  if(String(current.content)===content && current.disabled!==true) {
    process.stdout.write(JSON.stringify({
      ok:true,
      action:'unchanged',
      zone:zoneName,
      name:recordName,
      type,
      content,
      ttl:current.ttl,
      record_id:current.id,
    },null,2)+'\n');
    process.exit(0);
  }
  const updated=await request(
    base+'/zones/'+encodeURIComponent(zone.id)+'/records/'+encodeURIComponent(current.id),
    {
      method:'PUT',
      body:JSON.stringify({
        content,
        ttl,
        prio:Number(current.prio||0),
        disabled:false,
      }),
    }
  );
  process.stdout.write(JSON.stringify({
    ok:true,
    action:'updated',
    zone:zoneName,
    name:recordName,
    type,
    content,
    ttl,
    record_id:updated?.id||current.id,
  },null,2)+'\n');
  process.exit(0);
}

const created=await request(
  base+'/zones/'+encodeURIComponent(zone.id)+'/records',
  {
    method:'POST',
    body:JSON.stringify([{
      name:recordName,
      type,
      content,
      ttl,
      prio:0,
      disabled:false,
    }]),
  }
);
const first=Array.isArray(created)?created[0]:created;
process.stdout.write(JSON.stringify({
  ok:true,
  action:'created',
  zone:zoneName,
  name:recordName,
  type,
  content,
  ttl,
  record_id:first?.id||null,
},null,2)+'\n');
