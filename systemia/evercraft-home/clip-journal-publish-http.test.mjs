import assert from 'node:assert/strict';
import test from 'node:test';
import { startEvercraftHomeServer } from './server.mjs';

test('Evercraft Home Clip route accepts only a safe Journal story slug',async()=>{
  const runtime=await startEvercraftHomeServer({
    host:'127.0.0.1',
    port:0,
    authMode:'local',
    credentialStateDir:'',
  });
  try{
    const response=await fetch(runtime.url+'/api/clip/journal/facebook',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({slug:'../../secrets'}),
    });
    assert.equal(response.status,400);
    const body=await response.json();
    assert.equal(body.ok,false);
    assert.match(body.state,/slug_invalid/);
    assert.equal(body.publication_performed,false);
  }finally{
    await runtime.close();
  }
});

test('Evercraft Home Clip route refuses a valid story publish when the credential vault is not configured',async()=>{
  const runtime=await startEvercraftHomeServer({
    host:'127.0.0.1',
    port:0,
    authMode:'local',
    credentialStateDir:'',
  });
  try{
    const response=await fetch(runtime.url+'/api/clip/journal/facebook',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({slug:'college-football-power-rankings-2026-10-06'}),
    });
    assert.equal(response.status,503);
    const body=await response.json();
    assert.equal(body.ok,false);
    assert.equal(body.state,'credential_vault_not_configured');
    assert.equal(body.publication_performed,false);
    assert.equal(JSON.stringify(body).includes('page_access_token'),false);
  }finally{
    await runtime.close();
  }
});

test('Evercraft Home Clip route does not accept a caller-supplied publication URL',async()=>{
  const runtime=await startEvercraftHomeServer({
    host:'127.0.0.1',
    port:0,
    authMode:'local',
    credentialStateDir:'',
  });
  try{
    const response=await fetch(runtime.url+'/api/clip/journal/facebook',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({slug:'https://example.com/fake-story'}),
    });
    assert.equal(response.status,400);
    const body=await response.json();
    assert.match(body.state,/slug_invalid/);
    assert.equal(body.publication_performed,false);
  }finally{
    await runtime.close();
  }
});
