import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldsAdmission,worldsClientAddress} from '../systemia/worlds/worlds-admission.mjs';
const request=(peer,forwarded)=>({socket:{remoteAddress:peer},headers:forwarded===undefined?{}:{'x-worlds-client-ip':forwarded}});
test('owned pinned loopback vault uses edge canonical address, not untrusted remote forwarders',()=>{
 assert.equal(worldsClientAddress(request('127.0.0.1','203.0.113.19'),'https://worlds.example.org'),'203.0.113.19');
 assert.equal(worldsClientAddress(request('127.0.0.1','203.0.113.19'),''),'127.0.0.1');
 assert.equal(worldsClientAddress(request('198.51.100.2','203.0.113.19'),'https://worlds.example.org'),'198.51.100.2');
 assert.equal(worldsClientAddress(request('127.0.0.1','not an ip'),'https://worlds.example.org'),'127.0.0.1');
 assert.equal(worldsClientAddress(request('::1','2001:db8::4'),'https://worlds.example.org'),'2001:db8::4');
});
test('distinct verified public clients have independent ten-creation windows',()=>{
 let now=1000000;
 const limiter=createWorldsAdmission({clock:()=>now});
 const a=request('127.0.0.1','198.51.100.1'),b=request('127.0.0.1','198.51.100.2');
 for(let i=0;i<10;i++)assert.equal(limiter.admit(a,'https://worlds.example.org').allowed,true);
 assert.deepEqual(limiter.admit(a,'https://worlds.example.org'),{allowed:false,reason:'client_creation_rate_limited'});
 assert.equal(limiter.admit(b,'https://worlds.example.org').allowed,true);
 now+=600001;
 assert.equal(limiter.admit(a,'https://worlds.example.org').allowed,true);
});
test('admission memory stays bounded on large rotating address populations',()=>{
 let now=0;const limiter=createWorldsAdmission({maxClients:2,clock:()=>now});
 assert.equal(limiter.admit(request('198.51.100.1')).allowed,true);
 assert.equal(limiter.admit(request('198.51.100.2')).allowed,true);
 assert.equal(limiter.admit(request('198.51.100.3')).reason,'client_limit_capacity');
 assert.equal(limiter.trackedClients,2);
 now+=600001;
 assert.equal(limiter.admit(request('198.51.100.3')).allowed,true);
 assert.equal(limiter.trackedClients,1);
});
