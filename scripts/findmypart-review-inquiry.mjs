#!/usr/bin/env node
// Private operator terminal only. Do not run in CI or copy customer briefs to public logs.
import {readFindMyPartPrivateInquiry} from '../systemia/mcp/findmypart-public-inquiry.mjs';
const reference=process.argv[2]||'';
if(!/^FMP-[A-F0-9]{24}$/.test(reference)){
 console.error('Usage: node scripts/findmypart-review-inquiry.mjs FMP-<24 HEX>');
 process.exitCode=2;
}else{
 try{
  const result=readFindMyPartPrivateInquiry({reference});
  console.log('FindMyPart private inquiry:',result.reference);
  console.log('Received:',result.received_at);
  console.log('Equipment:',result.equipment_context);
  console.log('Part problem:',result.part_description);
  console.log('Reply email:',result.email);
  console.log('Status: human review required. No checkout/order/payment created.');
 }catch(error){
  console.error('Unable to read private inquiry: '+String(error?.code||error?.message||'unavailable'));
  process.exitCode=1;
 }
}
