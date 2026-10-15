import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const source=fs.readFileSync(path.join(import.meta.dirname,'../public/payments/merchant-lab.html'),'utf8');
test('merchant lab is a real self-contained responsive document with a runnable JS program',()=>{
 assert.match(source,/<!doctype html>/i);assert.match(source,/<meta name="viewport"/);
 assert.match(source,/@media\(max-width:750px\)/);
 assert.match(source,/<h1>/);assert.match(source,/aria-live="polite"/);
 const script=source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);assert.doesNotThrow(()=>new vm.Script(script,{filename:'merchant-lab.js'}));
});
test('every calculator input and rendered result exists in the document',()=>{
 for(const id of ['ticket','volume','proposedRate','proposedFixed','providerRate','providerFixed','overhead',
  'reference','merchantFee','monthlyDifference','platformMargin','calculationStatus','export','exportStatus'])
  assert.match(source,new RegExp('id="'+id+'"'));
});
test('not a deceptive financial console or money-moving call',()=>{
 assert.match(source,/DEMO ONLY · NO MONEY MOVEMENT/);
 assert.match(source,/No merchant accounts, processor credentials, deposits, orders, payments or invoices/);
 assert.match(source,/provider_cost_unverified/);
 assert.match(source,/no_payment_created:true/);
 assert.match(source,/No independently verified payment or payout receipt/);
 assert.match(source,/No entitlement, Shipping dispatch or delivery receipt/);
 assert.doesNotMatch(source,/\bfetch\s*\(|\bXMLHttpRequest\b|<form\b|<script[^>]+src=/);
 assert.doesNotMatch(source,/https:\/\/checkout\.stripe\.com|<input[^>]+type="password"/);
});
test('Systemia growth opportunities remain visible, synthetic and opted-in only',()=>{
 for(const k of ['Quotes without follow-up','Repeat buyers without plans','Checkout failures','Completed, not invoiced'])
   assert.ok(source.includes(k));
 assert.match(source,/All four cards below are synthetic examples/);
 assert.match(source,/requires explicit opt-in and specific data permissions/);
 assert.match(source,/No customer messages have been sent/);
});
