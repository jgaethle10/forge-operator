// Evercraft public social Home: owned, private, single-host media receipt store.
// No HTTP upload endpoint, public URLs, scanning, transcoding or publish authority.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {constants} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';

const REF_RE=/^[A-Za-z0-9:_./-]{1,160}$/;
const ASSET_RE=/^asset:sha256:([a-f0-9]{64})$/;
const DEFAULT_MAX_BYTES=64*1024*1024;
const hash=s=>createHash('sha256').update(s).digest('hex');
const requireRef=(value,label)=>{
  if(typeof value!=='string'||!REF_RE.test(value))throw Error('media_'+label+'_invalid');
};
function sniff(buffer){
  if(buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return 'image/png';
  if(buffer.length>=3&&buffer.subarray(0,3).equals(Buffer.from('ffd8ff','hex')))return 'image/jpeg';
  if(buffer.length>=12&&buffer.toString('ascii',4,8)==='ftyp')return 'video/mp4';
  if(buffer.length>=4&&buffer.subarray(0,4).equals(Buffer.from('1a45dfa3','hex')))return 'video/webm';
  return null;
}
function validateRoot(root){
  if(typeof root!=='string'||!root.trim()||!path.isAbsolute(root))throw Error('media_absolute_root_required');
  return path.resolve(root);
}
async function privateDirectory(folder){
  await fs.mkdir(folder,{recursive:true,mode:0o700});
  const s=await fs.lstat(folder);
  if(!s.isDirectory()||s.isSymbolicLink())throw Error('media_storage_directory_invalid');
}
function summary({digest,bytes,mime}){
  return {
    schema:'evercraft.home.private-media-receipt.v0.1',
    asset_ref:'asset:sha256:'+digest,
    content_sha256:digest,
    byte_count:bytes,
    detected_mime:mime,
    private_storage:'owned_single_host_development',
    integrity_state:'locally_verified_bytes',
    malware_scanned:false,
    rights_verified:false,
    public_url:null,
    published:false,
    payout_authority:false
  };
}
export function openCreatorMediaStore({root,max_bytes=DEFAULT_MAX_BYTES}={}){
  const base=validateRoot(root);
  if(!Number.isSafeInteger(max_bytes)||max_bytes<16||max_bytes>1024*1024*1024)
    throw Error('media_limit_invalid');
  function location(tenant,creator,digest){
    requireRef(tenant,'tenant_ref');requireRef(creator,'creator_ref');
    return path.join(base,hash('tenant:'+tenant),hash('creator:'+creator),digest+'.bin');
  }
  async function verify({tenant_ref,creator_ref,asset_ref}={}){
    requireRef(tenant_ref,'tenant_ref');requireRef(creator_ref,'creator_ref');
    const match=typeof asset_ref==='string'&&ASSET_RE.exec(asset_ref);
    if(!match)throw Error('media_asset_ref_invalid');
    const expected=match[1],filename=location(tenant_ref,creator_ref,expected);
    let fh;
    try{fh=await fs.open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);}
    catch(e){if(e.code==='ENOENT')throw Error('media_asset_missing');throw e;}
    try{
      const stat=await fh.stat();
      if(!stat.isFile()||stat.size<16||stat.size>max_bytes)throw Error('media_file_invalid');
      const digest=createHash('sha256'),chunk=Buffer.allocUnsafe(65536);
      let count=0,header=Buffer.alloc(0);
      while(true){
        const {bytesRead}=await fh.read(chunk,0,chunk.length,count);
        if(!bytesRead)break;
        const data=chunk.subarray(0,bytesRead);
        if(header.length<16)header=Buffer.concat([header,data.subarray(0,16-header.length)]);
        digest.update(data);count+=bytesRead;
        if(count>max_bytes)throw Error('media_limit_exceeded');
      }
      if(count!==stat.size||digest.digest('hex')!==expected)
        throw Error('media_integrity_invalid');
      const mime=sniff(header);
      if(!mime)throw Error('media_type_invalid');
      return summary({digest:expected,bytes:count,mime});
    }finally{await fh.close();}
  }
  async function ingest({tenant_ref,creator_ref,bytes,declared_mime}={}){
    requireRef(tenant_ref,'tenant_ref');requireRef(creator_ref,'creator_ref');
    if(declared_mime!==undefined&&
       !['image/png','image/jpeg','video/mp4','video/webm'].includes(declared_mime))
      throw Error('media_declared_type_invalid');
    let source;
    if(Buffer.isBuffer(bytes))source=(async function*(){yield bytes;})();
    else if(bytes&&typeof bytes[Symbol.asyncIterator]==='function')source=bytes;
    else throw Error('media_bytes_required');
    const folder=path.dirname(location(tenant_ref,creator_ref,'placeholder'));
    await privateDirectory(folder);
    const temp=path.join(folder,'.intake-'+randomUUID());
    let fh,committed=false;
    try{
      fh=await fs.open(temp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
      let byte_count=0,header=Buffer.alloc(0);
      const digest=createHash('sha256');
      for await(const block of source){
        if(!Buffer.isBuffer(block))throw Error('media_chunk_invalid');
        if(byte_count+block.length>max_bytes)throw Error('media_limit_exceeded');
        if(header.length<16)header=Buffer.concat([header,block.subarray(0,16-header.length)]);
        byte_count+=block.length;digest.update(block);
        for(let pos=0;pos<block.length;){
          const {bytesWritten}=await fh.write(block,pos,block.length-pos);
          if(!bytesWritten)throw Error('media_write_failed');
          pos+=bytesWritten;
        }
      }
      if(byte_count<16)throw Error('media_empty_or_truncated');
      const mime=sniff(header);
      if(!mime||declared_mime!==undefined&&mime!==declared_mime)
        throw Error('media_type_mismatch');
      await fh.sync();await fh.close();fh=null;
      const digestHex=digest.digest('hex');
      const dest=location(tenant_ref,creator_ref,digestHex);
      try{await fs.link(temp,dest);committed=true;}
      catch(e){if(e.code!=='EEXIST')throw e;}
      const dir=await fs.open(folder,'r');
      try{await dir.sync();}finally{await dir.close();}
      const receipt=await verify({tenant_ref,creator_ref,asset_ref:'asset:sha256:'+digestHex});
      if(receipt.byte_count!==byte_count)throw Error('media_size_conflict');
      return receipt;
    }finally{
      if(fh)await fh.close();
      await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});
    }
  }
  return Object.freeze({ingest,verify});
}
