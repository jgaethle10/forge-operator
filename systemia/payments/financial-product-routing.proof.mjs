import assert from 'node:assert/strict';
import { routeFinancialProduct } from './financial-product-router.mjs';

const command=routeFinancialProduct({productKey:'evercraft-financial-command-center'});
const partner=routeFinancialProduct({productKey:'evercraft-partner-account-experience'});
const chartered=routeFinancialProduct({productKey:'evercraft-chartered-account'});

assert.equal(command.ready,true);
assert.equal(partner.ready,false);
assert.equal(chartered.ready,false);

process.stdout.write(JSON.stringify({
  schema:'evercraft.financial.product-routing-proof.v1',
  products:[
    {product_key:command.product_key,ready:command.ready,execution_state:command.execution_state,capabilities:command.capabilities.map(x=>({capability_key:x.capability_key,allowed:x.allowed,route:x.route}))},
    {product_key:partner.product_key,ready:partner.ready,execution_state:partner.execution_state,blockers:partner.capabilities.flatMap(x=>x.blockers||[])},
    {product_key:chartered.product_key,ready:chartered.ready,execution_state:chartered.execution_state,blockers:chartered.capabilities.flatMap(x=>x.blockers||[])}
  ],
  verified_regulated_authority_count:0,
  boundary:'Only the no-custody Financial Command Center is routable under the current empty regulated-authority registry.'
},null,2)+'\n');
