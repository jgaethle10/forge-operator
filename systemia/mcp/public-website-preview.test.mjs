import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePublicWebsiteHtml,
  isPublicIp,
  previewPublicWebsite,
} from './public-website-preview.mjs';

const publicLookup=async()=>[{address:'93.184.216.34',family:4}];

test('public IP guard rejects loopback and private ranges',()=>{
  assert.equal(isPublicIp('127.0.0.1'),false);
  assert.equal(isPublicIp('10.0.0.5'),false);
  assert.equal(isPublicIp('192.168.1.10'),false);
  assert.equal(isPublicIp('169.254.10.1'),false);
  assert.equal(isPublicIp('::1'),false);
  assert.equal(isPublicIp('fd00::1'),false);
  assert.equal(isPublicIp('::ffff:7f00:1'),false);
  assert.equal(isPublicIp('64:ff9b::7f00:1'),false);
  assert.equal(isPublicIp('2002:7f00:1::'),false);
  assert.equal(isPublicIp('fec0::1'),false);
  assert.equal(isPublicIp('93.184.216.34'),true);
  assert.equal(isPublicIp('2606:4700:4700::1111'),true);
});

test('HTML analyzer returns bounded observed evidence and prioritized findings',()=>{
  const html='<!doctype html><html lang="en"><head><title>Short</title><meta name="robots" content="noindex"></head><body><img src="/hero.jpg"><h2>Services</h2><p>Welcome to Example Company.</p></body></html>';
  const result=analyzePublicWebsiteHtml({
    url:'https://example.com/',
    status:200,
    headers:{'content-type':'text/html; charset=utf-8'},
    fetchDurationMs:42,
    html,
  });
  assert.equal(result.schema,'evercraft.public-website-preview.v1');
  assert.equal(result.observed.http_status,200);
  assert.equal(result.observed.title,'Short');
  assert.equal(result.observed.noindex,true);
  assert.equal(result.observed.h1_count,0);
  assert.equal(result.observed.image_count,1);
  assert.equal(result.observed.images_missing_alt,1);
  const codes=new Set(result.findings.map((x)=>x.code));
  assert.ok(codes.has('title_length_review'));
  assert.ok(codes.has('meta_description_missing'));
  assert.ok(codes.has('viewport_missing'));
  assert.ok(codes.has('h1_missing'));
  assert.ok(codes.has('noindex_observed'));
});

test('preview pins the request to the DNS-validated public address',async()=>{
  let seen=null;
  const html='<!doctype html><html lang="en"><head><title>Example Company Website Services and Contact</title><meta name="description" content="Example Company helps customers with a useful service."><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://example.com/"><script type="application/ld+json">{"@type":"Organization"}</script></head><body><h1>Example Company</h1><a href="tel:+15095550101">Call us</a></body></html>';
  const result=await previewPublicWebsite('example.com',{
    lookup:publicLookup,
    requestImpl:async(url,address)=>{
      seen={url:url.toString(),address};
      return {status:200,headers:{'content-type':'text/html'},body:html};
    },
  });
  assert.deepEqual(seen,{url:'https://example.com/',address:'93.184.216.34'});
  assert.equal(result.ok,true);
  assert.equal(result.observed.canonical_url,'https://example.com/');
  assert.equal(result.observed.has_contact_signal,true);
  assert.equal(result.network_scope,'user_supplied_public_url_only');
  assert.equal(result.transactional,false);
});

test('preview rejects localhost and direct private IPs before any request',async()=>{
  let calls=0;
  const requestImpl=async()=>{calls+=1; throw new Error('must not run');};
  await assert.rejects(previewPublicWebsite('http://127.0.0.1/admin',{requestImpl}),/website_private_host_not_allowed/);
  await assert.rejects(previewPublicWebsite('http://localhost:8787/health',{requestImpl}),/website_private_host_not_allowed/);
  assert.equal(calls,0);
});

test('preview rejects nonstandard public web ports',async()=>{
  await assert.rejects(
    previewPublicWebsite('https://example.com:8443/',{
      lookup:publicLookup,
      requestImpl:async()=>({status:200,headers:{'content-type':'text/html'},body:'<html></html>'}),
    }),
    /website_nonstandard_port_not_allowed/
  );
});
test('preview rejects a hostname that resolves to a private address',async()=>{
  let calls=0;
  await assert.rejects(
    previewPublicWebsite('https://internal.example',{
      lookup:async()=>[{address:'10.0.0.8',family:4}],
      requestImpl:async()=>{calls+=1; return {};},
    }),
    /website_private_host_not_allowed/
  );
  assert.equal(calls,0);
});

test('redirects are revalidated and cannot pivot into a private network',async()=>{
  let calls=0;
  await assert.rejects(
    previewPublicWebsite('https://example.com/start',{
      lookup:publicLookup,
      requestImpl:async()=>{
        calls+=1;
        return {status:302,headers:{location:'http://192.168.1.1/admin'},body:''};
      },
    }),
    /website_private_host_not_allowed/
  );
  assert.equal(calls,1);
});

test('preview rejects unsupported response content types',async()=>{
  await assert.rejects(
    previewPublicWebsite('https://example.com/file.pdf',{
      lookup:publicLookup,
      requestImpl:async()=>({status:200,headers:{'content-type':'application/pdf'},body:'%PDF'}),
    }),
    /website_content_type_not_supported/
  );
});

test('preview carries fetch failures as bounded errors',async()=>{
  await assert.rejects(
    previewPublicWebsite('https://example.com',{
      lookup:publicLookup,
      requestImpl:async()=>{throw new Error('website_fetch_timeout');},
    }),
    /website_fetch_timeout/
  );
});
