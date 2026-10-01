import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  issueMicroSeedPairingTicket,
  showMicroSeedPairingTicket,
  listMicroSeedPairingTickets,
  revokeMicroSeedPairingTicket,
  parseMicroSeedPairingUri,
} from '../systemia/saban/microseed-pairing.mjs';
import { startAmbientWorkApi } from '../systemia/saban/ambient-work-api.mjs';

test('issued pairing ticket is a visible human card with a copyable machine URI',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-ticket-card-'));
  try{
    const issue=issueMicroSeedPairingTicket({
      stateDir:root,
      approval_ref:'explicit-owner-approval',
      device_id:'spare-laptop-01',
      allowed_device_classes:['linux-host','mini-pc'],
      allowed_workloads:[
        'systemia.content-hash.v1',
        'systemia.rivet.source-coverage-audit.v1',
      ],
      ttl_ms:15*60*1000,
      enrollment_url:'https://fabric.example.test/v1/enroll',
      now:new Date('2026-10-01T09:00:00.000Z'),
    });

    const card=issue.ticket_card;
    assert.equal(card.schema,'evercraft.microseed.pairing-ticket-card.v1');
    assert.match(card.display_code,/^PAIR-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
    assert.match(card.pairing_uri,/^evercraft:\/\/microseed\/pair\?/);
    assert.match(card.card_text,/EVERCRAFT MICROSEED PAIRING TICKET/);
    assert.match(card.card_text,/PAIR THIS DEVICE:/);
    assert.equal(card.single_use,true);
    assert.equal(card.safe_to_publish,false);

    const parsed=parseMicroSeedPairingUri(card.pairing_uri);
    assert.equal(parsed.ticket_id,issue.ticket_id);
    assert.equal(parsed.pairing_secret,issue.pairing_secret);
    assert.equal(parsed.expires_at,issue.expires_at);
    assert.equal(parsed.enrollment_url,'https://fabric.example.test/v1/enroll');
    assert.equal(card.enrollment_url,'https://fabric.example.test/v1/enroll');
    assert.match(card.card_text,/Enrollment return: https:\/\/fabric\.example\.test\/v1\/enroll/);

    const shown=showMicroSeedPairingTicket({
      stateDir:root,
      ticket_id:issue.ticket_id,
      now:new Date('2026-10-01T09:01:00.000Z'),
    });
    assert.equal(shown.pairing_uri,card.pairing_uri);

    const list=listMicroSeedPairingTickets({
      stateDir:root,
      now:new Date('2026-10-01T09:01:00.000Z'),
    });
    assert.equal(list.active_count,1);
    assert.equal(list.pairing_secrets_exposed,false);
    assert.equal(JSON.stringify(list).includes(issue.pairing_secret),false);

    const revoked=revokeMicroSeedPairingTicket({
      stateDir:root,
      ticket_id:issue.ticket_id,
      reason:'test_complete',
      now:new Date('2026-10-01T09:02:00.000Z'),
    });
    assert.equal(revoked.pairing_secret_destroyed,true);
    assert.throws(
      ()=>showMicroSeedPairingTicket({
        stateDir:root,
        ticket_id:issue.ticket_id,
        now:new Date('2026-10-01T09:03:00.000Z'),
      }),
      /not_found/
    );
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('local API exposes pairing desk only with separate pairing authority',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-ticket-api-'));
  let api=null;
  try{
    api=await startAmbientWorkApi({
      queueRoot:path.join(root,'work-queue'),
      stateDir:root,
      authorizationToken:'work-token',
      pairingAuthorizationToken:'pairing-token',
    });

    const wrong=await fetch(api.url+'/v1/pairing/tickets',{
      method:'POST',
      headers:{
        authorization:'Bearer work-token',
        'content-type':'application/json',
      },
      body:JSON.stringify({approval_ref:'approved'}),
    });
    assert.equal(wrong.status,401);
    assert.equal((await wrong.json()).error,'pairing_authorization_required');

    const created=await fetch(api.url+'/v1/pairing/tickets',{
      method:'POST',
      headers:{
        'x-evercraft-pairing-token':'pairing-token',
        'content-type':'application/json',
      },
      body:JSON.stringify({
        approval_ref:'approved-from-control-room',
        device_id:'desktop-01',
        allowed_device_classes:['linux-host'],
        allowed_workloads:['systemia.content-hash.v1'],
        ttl_ms:10*60*1000,
        enrollment_url:'https://fabric.example.test',
      }),
    });
    assert.equal(created.status,201);
    const body=await created.json();
    assert.equal(body.ok,true);
    assert.match(body.ticket.card_text,/MICROSEED PAIRING TICKET/);
    assert.match(body.ticket.pairing_uri,/evercraft:\/\/microseed\/pair/);
    assert.equal(
      parseMicroSeedPairingUri(body.ticket.pairing_uri).enrollment_url,
      'https://fabric.example.test/'
    );
    assert.equal(body.execution_gateway_authority,false);

    const listed=await fetch(api.url+'/v1/pairing/tickets',{
      headers:{'x-evercraft-pairing-token':'pairing-token'},
    });
    assert.equal(listed.status,200);
    const list=await listed.json();
    assert.equal(list.active_count,1);
    assert.equal(list.pairing_secrets_exposed,false);
    assert.equal(JSON.stringify(list).includes(
      parseMicroSeedPairingUri(body.ticket.pairing_uri).pairing_secret
    ),false);

    const revoked=await fetch(api.url+'/v1/pairing/tickets/'+body.ticket.ticket_id,{
      method:'DELETE',
      headers:{'x-evercraft-pairing-token':'pairing-token'},
    });
    assert.equal(revoked.status,200);
    assert.equal((await revoked.json()).receipt.pairing_secret_destroyed,true);
  }finally{
    if(api) await api.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('expired ticket refuses show and URI is explicitly secret-bearing',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-ticket-expiry-'));
  try{
    const issue=issueMicroSeedPairingTicket({
      stateDir:root,
      approval_ref:'approved',
      ttl_ms:60_000,
      now:new Date('2026-10-01T09:00:00.000Z'),
    });
    assert.equal(issue.ticket_card.secret_exposed_in_pairing_uri,true);
    assert.equal(issue.ticket_card.safe_to_publish,false);
    assert.throws(
      ()=>showMicroSeedPairingTicket({
        stateDir:root,
        ticket_id:issue.ticket_id,
        now:new Date('2026-10-01T09:02:00.000Z'),
      }),
      /expired/
    );
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
