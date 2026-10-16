import test from 'node:test';
import assert from 'node:assert/strict';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const catalog=[{
  public_id:'native-product-v1',
  name:'Native Product',
  description:'A native Evercraft capability.',
  keywords:['native','capability'],
  state:'payment_ready',
  commercial_state:'sell_now',
  pricing:'Quick start $49 one-time.',
  use_when:['I need a native capability right now'],
  entry_paid_offer:{name:'Quick start',price:'$49',billing:'one_time',price_usd_normalized:49},
  connections:[
    {type:'mcp',label:'owned direct',url:'https://fabric.evercraft.example/mcp/native'},
    {type:'website',label:'owned website',url:'https://example.com/'},
  ],
}];

test('owned Evercraft mobile surface is installable and routes through live Fabric matching',async()=>{
  const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog});
  try{
    const health=await fetch(runtime.url+'/health').then((r)=>r.json());
    assert.equal(health.mobile_path,'/mobile');
    assert.equal(health.mobile_installable,true);

    const mobileResponse=await fetch(runtime.url+'/mobile');
    assert.equal(mobileResponse.status,200);
    assert.match(mobileResponse.headers.get('content-type')||'',/^text\/html/);
    assert.match(mobileResponse.headers.get('content-security-policy')||'',/form-action 'self'/);
    const mobile=await mobileResponse.text();
    assert.match(mobile,/Bring the problem/);
    assert.ok(mobile.includes('One door.'));
    assert.match(mobile,/A world of capability/);
    assert.match(mobile,/Presence · interactive preview/);
    assert.match(mobile,/Choose your starting point/);
    assert.match(mobile,/Property intelligence/);
    assert.match(mobile,/Creator presence/);
    assert.match(mobile,/Business strategy/);
    assert.match(mobile,/Community services/);
    assert.match(mobile,/No silent actions/);
    assert.match(mobile,/prefers-reduced-motion/);
    assert.ok(!mobile.toLowerCase().includes('<script'));
    assert.match(mobile,/Add to Home Screen/);
    assert.match(mobile,/1 live capabilities/);
    assert.match(mobile,/\/mobile\/manifest\.webmanifest/);

    const matchedResponse=await fetch(runtime.url+'/mobile?q='+encodeURIComponent('I need a native capability right now'));
    assert.equal(matchedResponse.status,200);
    const matched=await matchedResponse.text();
    assert.match(matched,/Native Product/);
    assert.match(matched,/Open capability/);
    assert.match(matched,/Read-only discovery/);
    assert.equal(matched.includes('base44.app'),false);

    const injected=await fetch(runtime.url+'/mobile?q='+encodeURIComponent('<img src=x onerror=alert(1)>')).then(r=>r.text());
    assert.ok(injected.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!injected.includes('<img src=x onerror=alert(1)>'));
    assert.ok(injected.includes('interactive preview'));


    const manifestResponse=await fetch(runtime.url+'/mobile/manifest.webmanifest');
    assert.equal(manifestResponse.status,200);
    assert.match(manifestResponse.headers.get('content-type')||'',/^application\/manifest\+json/);
    const manifest=await manifestResponse.json();
    assert.equal(manifest.name,'Evercraft');
    assert.equal(manifest.start_url,'/mobile');
    assert.equal(manifest.display,'standalone');
    assert.equal(manifest.icons[0].src,'/assets/evercraft-icon.png');
  }finally{
    await runtime.close();
  }
});
