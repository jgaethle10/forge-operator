import test from "node:test";
import assert from "node:assert/strict";
import {answer} from "../dns/runtime.mjs";

const zone={origin:"edge.invalid.",serial:1,default_ttl:300,primary_ns:"ns1.edge.invalid.",admin:"hostmaster.edge.invalid.",nameservers:["ns1.edge.invalid.","ns2.edge.invalid."],records:[{name:"www",type:"A",value:"192.0.2.10"}]};
function query(name,type=1){
 const labels=name.replace(/\.$/,"").split(".");const qname=Buffer.concat([...labels.map(x=>Buffer.concat([Buffer.from([x.length]),Buffer.from(x)])),Buffer.from([0])]);
 const h=Buffer.alloc(12);h.writeUInt16BE(0x1234,0);h.writeUInt16BE(0x0100,2);h.writeUInt16BE(1,4);
 return Buffer.concat([h,qname,Buffer.from([0,type,0,1])]);
}
test("authoritative answer refuses recursion semantics",()=>{
 const r=answer(query("www.edge.invalid."),zone);const flags=r.readUInt16BE(2);
 assert.equal((flags&0x0400)!==0,true);assert.equal((flags&0x0080)!==0,false);assert.equal(r.readUInt16BE(6),1);
});
test("NXDOMAIN is authoritative and carries SOA",()=>{
 const r=answer(query("missing.edge.invalid."),zone);
 assert.equal(r.readUInt16BE(2)&0xf,3);assert.equal(r.readUInt16BE(8),1);
});
test("out of zone is REFUSED",()=>{
 const r=answer(query("elsewhere.invalid."),zone);assert.equal(r.readUInt16BE(2)&0xf,5);
});
