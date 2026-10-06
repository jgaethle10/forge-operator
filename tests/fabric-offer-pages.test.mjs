import test from 'node:test';
import assert from 'node:assert/strict';
import {
  offerCapabilityForSlug,
  offerSlugForCapability,
  renderOfferPage,
  renderOffers,
} from '../systemia/mcp/fabric-public-site.mjs';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const websiteAudit={
  public_id:'audit-center-website-audit-machine-v1',
  name:'Systemia Website Audit',
  description:'Find website conversion, performance, discoverability, and public-web problems.',
  keywords:['website audit','conversion'],
  state:'payment_ready',
  commercial_state:'sell_now',
  pricing:'Free preview. Quick Win Audit $49 one-time and machine-fulfilled after verified payment.',
  use_when:['why is my website not getting leads'],
  entry_paid_offer:{
    name:'Quick Win Audit',
    price:'$49',
    price_usd_normalized:49,
    billing:'one_time',
  },
  start_url_state:'held_no_owned_public_origin',
  connections:[],
};

test('human offer copy gives sell-now capabilities short memorable URLs',()=>{
  assert.equal(offerSlugForCapability(websiteAudit.public_id),'website-audit');
  assert.equal(offerCapabilityForSlug('website-audit',[websiteAudit])?.public_id,websiteAudit.public_id);

  const directory=renderOffers([websiteAudit]);
  assert.match(directory,/\/offers\/website-audit/);
  assert.match(directory,/Your website is getting attention/);
  assert.match(directory,/Starts at \$49/);

  const page=renderOfferPage(websiteAudit);
  assert.match(page,/Your website is getting attention\. Why isn&#39;t it getting customers\?/);
  assert.match(page,/What you are buying/);
  assert.match(page,/What you send us/);
  assert.match(page,/What you get back/);
  assert.match(page,/How it works/);
  assert.match(page,/\$49/);
  assert.doesNotMatch(page,/machine state|start_url_state|preferred_agent_route/i);
});

test('owned Fabric serves offer pages and CHUM review lands on the human offer',async()=>{
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',
    port:0,
    catalog:[websiteAudit],
    faieSurfaceEnabled:false,
  });
  try{
    const directory=await fetch(runtime.url+'/offers');
    assert.equal(directory.status,200);
    assert.match(await directory.text(),/One problem/);

    const offer=await fetch(runtime.url+'/offers/website-audit');
    assert.equal(offer.status,200);
    assert.match(await offer.text(),/Quick Win Audit/);

    const review=await fetch(runtime.url+'/api/chum/go/'+websiteAudit.public_id+'?surface=offer-test',{
      redirect:'manual',
    });
    assert.equal(review.status,302);
    assert.equal(
      review.headers.get('location'),
      '/offers/website-audit?from=chum&surface=offer-test'
    );
  }finally{
    await runtime.close();
  }
});
