#!/usr/bin/env node
// Explicit one-source owner-host acquisition. No timer, private data upload or live mutations.
import {captureEcologyWorkbook} from './wa-workbook-capture.mjs';
const [sourceKey,outDir,...extra]=process.argv.slice(2);
if(!sourceKey||!outDir||extra.length){
 console.error('usage: node wa-capture-once.mjs SOURCE_KEY PRIVATE_ABSOLUTE_DIRECTORY');
 process.exitCode=2;
}else{
 try{
  const r=await captureEcologyWorkbook({sourceKey,outDir});
  console.log(JSON.stringify({schema:r.schema,sourceKey:r.sourceKey,bytes:r.bytes,sha256:r.sha256,
   workbookSchemaVerified:false,rowsVerified:0,productionChanged:false}));
 }catch(e){
  const code=String(e?.message||'');
  console.error(JSON.stringify({status:'held',sourceKey,
   reason:/^[a-z_]{3,90}$/.test(code)?code:'source_transport_or_storage_failed',
   productionChanged:false}));
  process.exitCode=1;
 }
}
