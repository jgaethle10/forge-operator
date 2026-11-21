import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandboxBankReader } from './sandbox-bank-reader.mjs';

const TOKEN = 'SYNTHETIC_ONLY_TOKEN_DO_NOT_REUSE';
const connector = () => ({
  connector_id:'demo-bank-oauth', status:'active',
  environment:'sandbox', sandbox_only:true, approved:true,
  read_only:true, mode:'delegated_oauth',
  api_origin:'https://sandbox.examplebank.test',
  scopes:['accounts:read','balances:read','transactions:read'],
});
const request = (operation='balance.read',account_ref='demo-checking') => ({
  operation, account_ref, connector_id:'demo-bank-oauth',
});
const response = (payload, init) => Response.json(payload, init);
const make = (opts={}) => {
  const calls=[];
  let vaultReads=0;
  const reader=createSandboxBankReader({
    connector:opts.connector||connector(),
    allowedSandboxOrigins:opts.origins||['https://sandbox.examplebank.test'],
    tokenVault:{getAccessToken:async()=>{ vaultReads++; return opts.vaultGrant ?? {
      schema:'evercraft.account-sentinel.sandbox-token.v1',
      access_token:opts.token ?? TOKEN, token_type:'Bearer',
      connector_id:'demo-bank-oauth',environment:'sandbox',
      audience:'https://sandbox.examplebank.test',
      scopes:['balances:read','accounts:read','transactions:read'],
      expires_at:new Date(Date.now()+30*60_000).toISOString(),
    }; }},
    transport:opts.transport||((url,init)=> {
      calls.push({url,init});
      return response(opts.payload||{
        simulated:true, currency:'USD', account_label:'Synthetic Checking',
        available_balance:2847.22, access_token:'POISON_RETURNED_FROM_FAKE_BANK',
        customer_ssn:'NOT_REAL',
      });
    }),
    timeoutMs:opts.timeoutMs||500,
    maxResponseBytes:opts.maxResponseBytes||4096,
  });
  return {reader,calls,get vaultReads(){return vaultReads;}};
};

test('sandbox-only allowed GET, hardcoded path, isolated token and minimal JSON projection',async()=>{
  const p=make();
  const result=await p.reader.read(request());
  assert.deepEqual(result,{
    source_environment:'sandbox',simulated:true,
    account_label:'Synthetic Checking', currency:'USD',
    available_balance:2847.22,
  });
  assert.equal(p.vaultReads,1);
  assert.equal(p.calls.length,1);
  assert.equal(p.calls[0].url,'https://sandbox.examplebank.test/v1/accounts/demo-checking/balances');
  assert.equal(p.calls[0].init.method,'GET');
  assert.equal(p.calls[0].init.redirect,'error');
  assert.equal(p.calls[0].init.credentials,'omit');
  assert.equal(p.calls[0].init.headers.authorization,'Bearer '+TOKEN);
  assert.equal(p.calls[0].init.body,undefined);
  assert.ok(!JSON.stringify(result).includes(TOKEN));
  assert.ok(!JSON.stringify(result).includes('POISON_RETURNED_FROM_FAKE_BANK'));
  assert.ok(!JSON.stringify(result).includes('customer_ssn'));
});

test('account summary only exposes approved fields',async()=>{
  const p=make({payload:{currency:'USD',simulated:true,account_label:'Checking',
    account_type:'checking',last4:'1234',routing_number:'SECRET',token:'SECRET'}});
  assert.deepEqual(await p.reader.read(request('account.read')),{
    source_environment:'sandbox',simulated:true,account_label:'Checking',
    currency:'USD',account_type:'checking',last4:'1234',
  });
  assert.equal(p.calls[0].url,'https://sandbox.examplebank.test/v1/accounts/demo-checking/summary');
});

test('transactions are bounded and do not expose raw metadata',async()=>{
  const p=make({payload:{currency:'USD',simulated:true,
    transactions:[{amount:-14.95,currency:'USD',date:'2026-10-28',
      description:'Simulated coffee',bank_password:'NEVER'}],
    hidden_token:'NEVER'}});
  assert.deepEqual(await p.reader.read(request('transactions.read')),{
    source_environment:'sandbox',simulated:true,currency:'USD',
    transactions:[{amount:-14.95,currency:'USD',date:'2026-10-28',
      description:'Simulated coffee'}],
  });
  assert.equal(p.calls[0].url,
    'https://sandbox.examplebank.test/v1/accounts/demo-checking/transactions?limit=25');
});

test('transfer/payee/writes, unknown ops, forged fields and path injection never reach vault',async()=>{
  const p=make();
  const attempts=[
    request('transfer.create'),request('payee.create'),
    request('account.export'),request('DELETE'),request('account.update'),
    request('balance.read','../admin'),
    request('balance.read','check?secret=1'),
    request('balance.read','check/transfer'),
    request('balance.read',''),
    {...request(),url:'https://malicious.invalid/transfer'},
    {...request(),method:'POST'},
    {...request(),access_token:'steal'},
    {...request(),connector_id:'other-bank'},
  ];
  for(const item of attempts) await assert.rejects(p.reader.read(item),/sandbox_bank_read_rejected/);
  assert.equal(p.calls.length,0);
  assert.equal(p.vaultReads,0);
});

test('sandbox origin must be exactly approved HTTPS origin',()=>{
  const invalid=[
    'http://sandbox.examplebank.test',
    'https://sandbox.examplebank.test.evil.invalid',
    'https://admin:pw@sandbox.examplebank.test',
    'https://sandbox.examplebank.test:8443',
    'https://sandbox.examplebank.test/query',
    'https://sandbox.examplebank.test?next=https://evil.invalid',
    'https://sandbox.examplebank.test#hash',
  ];
  for(const origin of invalid)assert.throws(()=>createSandboxBankReader({
    connector:{...connector(),api_origin:origin},
    allowedSandboxOrigins:['https://sandbox.examplebank.test'],
    tokenVault:{getAccessToken:async()=>TOKEN},
    transport:async()=>response({simulated:true,currency:'USD',available_balance:5}),
  }),/sandbox_bank_read_rejected/);
});

test('production, disabled, password-based, unapproved and write connectors rejected at construction',()=>{
  const overrides=[
    {environment:'production'},{sandbox_only:false},
    {status:'disabled'},{mode:'password'},{read_only:false},
    {approved:false},{scopes:[]},{scopes:['balances:read','transfers:write']},
  ];
  for(const changes of overrides)assert.throws(()=>createSandboxBankReader({
    connector:{...connector(),...changes},
    allowedSandboxOrigins:['https://sandbox.examplebank.test'],
    tokenVault:{getAccessToken:async()=>TOKEN},
    transport:async()=>response({simulated:true,currency:'USD',available_balance:5}),
  }),/sandbox_bank_read_rejected/);
});

test('connector scope mismatch blocked before token retrieval',async()=>{
  const p=make({connector:{...connector(),scopes:['accounts:read']}});
  await assert.rejects(p.reader.read(request('balance.read')),/sandbox_bank_read_rejected/);
  assert.equal(p.vaultReads,0);
});

test('missing or unsafe tokens never contact adapter',async()=>{
  for(const token of ['', 'a', 'inject\r\nHeader: evil', 'x'.repeat(5000)]){
    const p=make({token});
    await assert.rejects(p.reader.read(request()),/sandbox_bank_read_rejected/);
    assert.equal(p.calls.length,0);
  }
});

test('provider errors sanitized without leaking token or hostile response',async()=>{
  const p=make({transport:async()=>{throw Error('secret '+TOKEN+' Provider stack');}});
  await assert.rejects(p.reader.read(request()),err=>{
    assert.equal(err.message,'sandbox_bank_read_rejected');
    assert.ok(!String(err.stack).includes(TOKEN));
    return true;
  });
});

test('HTTP redirect denied and not followed',async()=>{
  const p=make({transport:async()=>Response.redirect('https://evil.invalid/callback',302)});
  await assert.rejects(p.reader.read(request()),/sandbox_bank_read_rejected/);
});

test('non-JSON or malformed and oversized responses fail closed',async()=>{
  const bad=[
    new Response('<html>fake bank</html>',{headers:{'content-type':'text/html'}}),
    new Response('{not json',{headers:{'content-type':'application/json'}}),
    response({currency:'USD',available_balance:'100'}),
    response({currency:'USD',available_balance:1,transactions:Array(26).fill({})}),
    response({currency:'USD',available_balance:1,blob:'x'.repeat(4500)}),
  ];
  for(const [i,resp] of bad.entries()){
    const p=make({transport:async()=>resp,maxResponseBytes:4096});
    const op=i===3?'transactions.read':'balance.read';
    await assert.rejects(p.reader.read(request(op)),/sandbox_bank_read_rejected/);
  }
});

test('transport that never settles is bounded by timeout',async()=>{
  const p=make({timeoutMs:50,transport:()=>new Promise(()=>{})});
  await assert.rejects(p.reader.read(request()),/sandbox_bank_read_rejected/);
});

test('a hanging token vault is timed out before any provider call',async()=>{
  let calls=0;
  const reader=createSandboxBankReader({
    connector:connector(),
    allowedSandboxOrigins:['https://sandbox.examplebank.test'],
    tokenVault:{getAccessToken:()=>new Promise(()=>{})},
    transport:async()=>{calls++;return response({simulated:true,currency:'USD',available_balance:1});},
    timeoutMs:50,
  });
  await assert.rejects(reader.read(request()),/sandbox_bank_read_rejected/);
  assert.equal(calls,0);
});

test('provider response from an unexpected final URL is rejected',async()=>{
  const forged=response({simulated:true,currency:'USD',available_balance:1});
  Object.defineProperty(forged,'url',{value:'https://evil.invalid/steal'});
  const p=make({transport:async()=>forged});
  await assert.rejects(p.reader.read(request()),/sandbox_bank_read_rejected/);
});

test('provider response tagged redirected cannot be accepted even on 200',async()=>{
  const forged=response({simulated:true,currency:'USD',available_balance:1});
  Object.defineProperty(forged,'redirected',{value:true});
  const p=make({transport:async()=>forged});
  await assert.rejects(p.reader.read(request()),/sandbox_bank_read_rejected/);
});

test('token vault may not return a bare bearer string',async()=>{
  const p=make({vaultGrant:TOKEN});
  await assert.rejects(p.reader.read(request()),/sandbox_bank_read_rejected/);
  assert.equal(p.calls.length,0);
});

test('vault metadata requires exact connector, environment, audience, read scope and freshness',async()=>{
  const valid={
    schema:'evercraft.account-sentinel.sandbox-token.v1',
    access_token:TOKEN,token_type:'Bearer',
    connector_id:'demo-bank-oauth',environment:'sandbox',
    audience:'https://sandbox.examplebank.test',scopes:['balances:read'],
    expires_at:new Date(Date.now()+30*60_000).toISOString(),
  };
  const tampering=[
    {connector_id:'another-connector'},{environment:'production'},
    {audience:'https://evil.invalid'},{token_type:'Basic'},
    {scopes:[]},{scopes:['accounts:read']},
    {scopes:['balances:read','transfers:write']},
    {expires_at:new Date(Date.now()-60_000).toISOString()},
    {expires_at:new Date(Date.now()+2*24*60*60_000).toISOString()},
    {schema:'untrusted-schema'},{account_password:'synthetic-injected'},
  ];
  for (const override of tampering) {
    const p=make({vaultGrant:{...valid,...override}});
    await assert.rejects(p.reader.read(request()),/sandbox_bank_read_rejected/);
    assert.equal(p.calls.length,0);
  }
});
