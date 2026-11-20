import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../public/commercial-studio/index.html',import.meta.url),'utf8');
const match=html.match(/<script>(\(function\(\)\{'use strict';[\s\S]*?\}\)\(\);)<\/script>/);
assert.ok(match,'buyer inquiry submit handler must remain present');
const handlerCode=match[1];

function harness({success=false}={}) {
  let handler=null,resetCount=0,prevented=false;
  const values={name:'A Person',email:'person@example.org',company:'Example Makers',project:'$50 introductory 30-second social commercial pilot',
    goal:'Show our product and send people to our store.',website:'',consent:'on'};
  const button={disabled:false};
  const form={querySelector:()=>button,addEventListener:(type,cb)=>{assert.equal(type,'submit');handler=cb;},
    reportValidity:()=>true,reset:()=>{resetCount++;}};
  const status={textContent:''};
  const fallback={href:'',hidden:true};
  const DOM={getElementById:id=>({'studio-request':form,'studio-status':status,'studio-email-fallback':fallback})[id]};
  const calls=[];
  const fetch=async(...args)=>{
    calls.push(args);
    if(!success)throw new Error('simulated_owned_intake_unavailable');
    return {ok:true,json:async()=>({ok:true,received:true,reference:'STUDIO-TEST-001'})};
  };
  class SyntheticFormData { get(key){return values[key]??null;} }
  vm.runInNewContext(handlerCode,{document:DOM,FormData:SyntheticFormData,fetch,
    AbortController,clearTimeout,setTimeout,encodeURIComponent}, {timeout:1000});
  return {async submit(){await handler({preventDefault(){prevented=true;}});},get results(){
    return {status,fallback,button,resetCount,prevented,calls};
  }};
}

test('email fallback preserves readable line breaks and all buyer brief fields when owned intake fails',async()=>{
  const h=harness();await h.submit();const {status,fallback,button,resetCount,prevented,calls}=h.results;
  assert.equal(prevented,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'https://fabric.systemiacommandcenters.com/api/commercial-studio/inquiry');
  assert.equal(fallback.hidden,false);
  const parsed=new URL(fallback.href);
  assert.equal(parsed.protocol,'mailto:');
  const body=parsed.searchParams.get('body');
  assert.ok(body.includes('Name: A Person\nEmail: person@example.org\nBusiness/project: Example Makers'));
  assert.ok(body.includes('Creative goal:\nShow our product and send people to our store.'));
  assert.ok(!body.includes(String.fromCharCode(92)+'n'),'do not send literal slash-n text in emails');
  assert.match(status.textContent,/NOT been confirmed received/);
  assert.equal(button.disabled,false);
  assert.equal(resetCount,0,'buyer does not lose the brief after a failed request');
});

test('successful private intake shows the genuine reference and never asks buyer to send a duplicate email',async()=>{
  const h=harness({success:true});await h.submit();
  const {status,fallback,button,resetCount}=h.results;
  assert.match(status.textContent,/STUDIO-TEST-001/);
  assert.match(status.textContent,/No payment or booking has occurred/);
  assert.equal(fallback.hidden,true);
  assert.equal(button.disabled,false);
  assert.equal(resetCount,1);
});

test('first-screen offer stays price-first without false launch-week deadline or unverified Stripe shortcut',()=>{
  assert.match(html,/<em>\$50 commercial<\/em>/);
  assert.match(html,/One focused 30-second social video/);
  assert.match(html,/No filming or ad spend included/);
  assert.match(html,/Request my \$50 commercial/);
  assert.doesNotMatch(html,/launch[- ]week/i);
  assert.match(html,/Already approved a project\? Request payment instructions/);
  assert.match(html,/No payment or booking happens on this page/);
  assert.doesNotMatch(html,/4gM5kEd6K40d7ju86w4AU0e/);
});
