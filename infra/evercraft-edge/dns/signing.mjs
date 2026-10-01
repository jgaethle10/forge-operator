import crypto from "node:crypto";

const canonical=value=>JSON.stringify(value);
export function generateSigningKeypair(){
 return crypto.generateKeyPairSync("ed25519");
}
export function signSnapshot(zone,privateKey,keyId="systemia-zone-root-1"){
 const payload={schema:"evercraft.edge.signed-zone.v1",zone};
 const bytes=Buffer.from(canonical(payload));
 const signature=crypto.sign(null,bytes,privateKey).toString("base64");
 return {...payload,key_id:keyId,signature};
}
export function verifySignedSnapshot(doc,publicKeys){
 if(doc?.schema!=="evercraft.edge.signed-zone.v1")return {ok:false,reason:"schema"};
 const key=publicKeys?.[doc.key_id];if(!key)return {ok:false,reason:"unknown_key"};
 const payload={schema:doc.schema,zone:doc.zone};
 const ok=crypto.verify(null,Buffer.from(canonical(payload)),key,Buffer.from(doc.signature||"","base64"));
 return ok?{ok:true}:{ok:false,reason:"bad_signature"};
}
