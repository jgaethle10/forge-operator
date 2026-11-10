/**
 * Native phone/desktop chunk uploader for a future authenticated Evercraft
 * HTTPS customer service. Not loaded by the public preview or wired to a
 * live paid checkout until signed capacity and provider receipts exist.
 * Tokens are supplied by an authenticated owner-controlled session, never
 * persisted here, added to URLs or stored in localStorage.
 */
const uploadPath='/v1/forensiscope/uploads';
function trustedOrigin(base){
 const url=new URL(base);
 const host=url.hostname.toLowerCase();
 const owned=['systemiacommandcenters.com','evercraftpropertyservices.com']
  .some(root=>host===root||host.endsWith('.'+root));
 const loopback=url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(host);
 if(!(owned&&url.protocol==='https:')&&!loopback)throw new Error('unapproved_upload_origin');
 if(url.username||url.password||url.hash||url.search)throw new Error('invalid_upload_origin');
 return url.origin;
}
async function checkResponse(response){
 const body=await response.json().catch(()=>null);
 if(!response.ok||body?.ok!==true)
  throw new Error('upload_service_'+String(body?.error||response.status));
 return body;
}
async function chunkSha256(blob){
 const bytes=await blob.arrayBuffer();
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return 'sha256:'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
}
/**
 * May resume a partial session after browser restart by creating the same
 * order_key again, provided the server still holds the verified entitlement.
 */
export async function uploadForensiScopePaidRecording({
 baseUrl,accessToken,orderKey,file,mediaExtension,onProgress=()=>{},
 fetchImpl=fetch
}={}){
 const origin=trustedOrigin(baseUrl);
 if(!accessToken||typeof accessToken!=='string')throw new Error('authenticated_buyer_token_required');
 if(typeof orderKey!=='string'||!/^[A-Za-z0-9._:-]{8,120}$/.test(orderKey))
  throw new Error('valid_order_key_required');
 if(!(file instanceof Blob)||!Number.isSafeInteger(file.size)||file.size<=0)
  throw new Error('media_file_required');
 if(typeof mediaExtension!=='string'||!/^\.[a-z0-9]{2,5}$/.test(mediaExtension))
  throw new Error('valid_media_extension_required');
 const headers={authorization:'Bearer '+accessToken};
 const request=async(route,method,extra={})=>checkResponse(await fetchImpl(origin+route,{
  method,headers:{...headers,...extra.headers},...('body'in extra?{body:extra.body}:{})
 }));
 const create=await request(uploadPath,'POST',{
  headers:{'content-type':'application/json'},
  body:JSON.stringify({
   order_key:orderKey,file_size_bytes:file.size,media_extension:mediaExtension
  })
 });
 const id=create.upload_id;
 if(!/^[a-f0-9]{32}$/.test(id)||create.total_bytes!==file.size ||
    !Number.isSafeInteger(create.chunk_bytes)||create.chunk_bytes<1 ||
    !Number.isSafeInteger(create.total_chunks)||create.total_chunks<1||
    create.total_chunks>8192)
  throw new Error('invalid_upload_session_receipt');
 if(create.state==='uploaded_unprocessed'){
  onProgress({uploadedBytes:file.size,totalBytes:file.size,completed:true});
  return create;
 }
 const already=new Set(create.received_chunks);
 for(let i=0;i<create.total_chunks;i++){
  if(already.has(i))continue;
  const start=i*create.chunk_bytes;
  const part=file.slice(start,Math.min(file.size,start+create.chunk_bytes));
  const chunkHash=await chunkSha256(part);
  await request(uploadPath+'/'+id+'/chunks/'+i,'PUT',{
   headers:{'content-type':'application/octet-stream',
    'x-chunk-sha256':chunkHash},
   body:part
  });
  onProgress({uploadedBytes:Math.min(file.size,(i+1)*create.chunk_bytes),
   totalBytes:file.size,completed:false});
 }
 const completed=await request(uploadPath+'/'+id+'/complete','POST',{
  headers:{'content-type':'application/json'},body:'{}'
 });
 if(completed.state!=='uploaded_unprocessed'||!/^sha256:[a-f0-9]{64}$/.test(completed.source_sha256))
  throw new Error('source_receipt_missing');
 onProgress({uploadedBytes:file.size,totalBytes:file.size,completed:true});
 return completed;
}
