import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DOCS=[
  'https://developers.google.com/youtube/v3/docs/videos/insert',
  'https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol',
];

const RETRIABLE=new Set([500,502,503,504]);

function sleep(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

function digestFile(filePath){
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function responseHeader(response,name){
  return response?.headers?.get?.(name) ?? response?.headers?.get?.(name.toLowerCase()) ?? null;
}

async function responsePayload(response){
  const text=await response.text();
  if(!text) return {};
  try{return JSON.parse(text);}catch{return {raw:text};}
}

function nextOffsetFromRange(value){
  if(!value) return null;
  const match=String(value).match(/(?:bytes=)?\s*0-(\d+)/i);
  if(!match) return null;
  const last=Number(match[1]);
  return Number.isFinite(last)?last+1:null;
}

function contentTypeFor(filePath){
  const ext=path.extname(filePath).toLowerCase();
  if(ext==='.mp4') return 'video/mp4';
  if(ext==='.mov') return 'video/quicktime';
  if(ext==='.webm') return 'video/webm';
  return 'application/octet-stream';
}

function validateChunkSize(value){
  const unit=256*1024;
  if(!Number.isInteger(value)||value<unit||value%unit!==0){
    throw new Error('youtube_chunk_size_must_be_256kb_multiple');
  }
}

export function createYouTubePublisherAdapter(config){
  const fetchImpl=config.fetchImpl??globalThis.fetch;
  if(!fetchImpl) throw new Error('youtube_fetch_unavailable');
  const base=(config.baseUrl??'https://www.googleapis.com/upload/youtube/v3/videos').replace(/\?+$/,'');
  const chunkSizeBytes=config.chunkSizeBytes??8*1024*1024;
  validateChunkSize(chunkSizeBytes);
  const maxRetries=config.maxRetries??5;
  const retryBaseMs=config.retryBaseMs??500;

  async function queryStatus(sessionUrl,total,token){
    const response=await fetchImpl(sessionUrl,{
      method:'PUT',
      headers:{
        Authorization:'Bearer '+token,
        'Content-Length':'0',
        'Content-Range':'bytes */'+total,
      },
    });
    if(response.status===200||response.status===201){
      return {done:true,payload:await responsePayload(response)};
    }
    if(response.status===308){
      const offset=nextOffsetFromRange(responseHeader(response,'Range'));
      return {done:false,offset:offset??0};
    }
    throw new Error('youtube_status_query_failed:'+response.status+':'+JSON.stringify(await responsePayload(response)).slice(0,500));
  }

  async function uploadChunks({sessionUrl,filePath,total,mimeType,token}){
    const handle=fs.openSync(filePath,'r');
    let offset=0;
    let retry=0;
    try{
      while(offset<total){
        const length=Math.min(chunkSizeBytes,total-offset);
        const buffer=Buffer.allocUnsafe(length);
        const bytesRead=fs.readSync(handle,buffer,0,length,offset);
        if(bytesRead<=0) throw new Error('youtube_media_read_failed');
        const body=bytesRead===buffer.length?buffer:buffer.subarray(0,bytesRead);
        const end=offset+bytesRead-1;

        let response;
        try{
          response=await fetchImpl(sessionUrl,{
            method:'PUT',
            headers:{
              Authorization:'Bearer '+token,
              'Content-Type':mimeType,
              'Content-Length':String(bytesRead),
              'Content-Range':`bytes ${offset}-${end}/${total}`,
            },
            body,
          });
        }catch(error){
          if(retry>=maxRetries) throw error;
          await sleep(retryBaseMs*Math.pow(2,retry));
          retry+=1;
          const status=await queryStatus(sessionUrl,total,token);
          if(status.done) return status.payload;
          offset=status.offset;
          continue;
        }

        if(response.status===200||response.status===201){
          return await responsePayload(response);
        }
        if(response.status===308){
          const observed=nextOffsetFromRange(responseHeader(response,'Range'));
          offset=observed??(end+1);
          retry=0;
          continue;
        }
        if(RETRIABLE.has(response.status)){
          if(retry>=maxRetries){
            throw new Error('youtube_upload_retry_exhausted:'+response.status);
          }
          await sleep(retryBaseMs*Math.pow(2,retry));
          retry+=1;
          const status=await queryStatus(sessionUrl,total,token);
          if(status.done) return status.payload;
          offset=status.offset;
          continue;
        }
        throw new Error('youtube_upload_failed:'+response.status+':'+JSON.stringify(await responsePayload(response)).slice(0,500));
      }
      const status=await queryStatus(sessionUrl,total,token);
      if(status.done) return status.payload;
      throw new Error('youtube_upload_incomplete_after_all_bytes');
    }finally{
      fs.closeSync(handle);
    }
  }

  return {
    id:'youtube-data-api-v3-resumable',
    destination:'youtube',
    verified:config.verified===true,
    async publish(input){
      if(config.allowPublish!==true) throw new Error('youtube_publish_not_authorized');
      if(!config.accessToken?.trim()) throw new Error('youtube_access_token_missing');
      if(!fs.existsSync(input.mediaPath)) throw new Error('youtube_media_missing');
      const observedDigest=digestFile(input.mediaPath);
      if(observedDigest!==input.mediaSha256) throw new Error('youtube_media_digest_mismatch');

      const total=fs.statSync(input.mediaPath).size;
      if(total<=0) throw new Error('youtube_media_empty');
      const mimeType=contentTypeFor(input.mediaPath);
      const requestedPrivacy=input.metadata.privacyStatus??config.defaultPrivacyStatus??'private';
      if(!['private','unlisted','public'].includes(requestedPrivacy)){
        throw new Error('youtube_privacy_status_invalid');
      }

      const metadata={
        snippet:{
          title:input.metadata.title,
          description:input.metadata.description||'',
          tags:input.metadata.tags||[],
          categoryId:String(config.categoryId??'22'),
        },
        status:{
          privacyStatus:requestedPrivacy,
        },
      };

      const sessionResponse=await fetchImpl(base+'?uploadType=resumable&part=snippet%2Cstatus',{
        method:'POST',
        headers:{
          Authorization:'Bearer '+config.accessToken,
          'Content-Type':'application/json; charset=UTF-8',
          'X-Upload-Content-Length':String(total),
          'X-Upload-Content-Type':mimeType,
        },
        body:JSON.stringify(metadata),
      });
      if(sessionResponse.status!==200&&sessionResponse.status!==201){
        throw new Error('youtube_session_create_failed:'+sessionResponse.status+':'+JSON.stringify(await responsePayload(sessionResponse)).slice(0,500));
      }
      const sessionUrl=responseHeader(sessionResponse,'Location');
      if(!sessionUrl) throw new Error('youtube_session_location_missing');

      const finalPayload=await uploadChunks({
        sessionUrl,
        filePath:input.mediaPath,
        total,
        mimeType,
        token:config.accessToken,
      });
      const videoId=String(finalPayload?.id??'').trim();
      if(!videoId) throw new Error('youtube_video_id_missing');

      return {
        state:'published',
        remoteId:videoId,
        providerRequestId:videoId,
        url:'https://www.youtube.com/watch?v='+encodeURIComponent(videoId),
        mediaSha256:observedDigest,
        observedPrivacyStatus:finalPayload?.status?.privacyStatus??null,
        sourceRefs:[
          ...DOCS.map(url=>'provider-doc:'+url),
          'provider:youtube-data-api-v3',
        ],
      };
    },
  };
}
