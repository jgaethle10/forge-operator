import fs from 'node:fs';
import zlib from 'node:zlib';

const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(buffer){
  let c=0xffffffff;
  for(const value of buffer){
    c^=value;
    for(let k=0;k<8;k++) c=(c>>>1)^((c&1)?0xedb88320:0);
  }
  return (c^0xffffffff)>>>0;
}
function chunk(kind,data){
  const type=Buffer.from(kind,'ascii');
  const n=Buffer.alloc(4),crc=Buffer.alloc(4);
  n.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([type,data])));
  return Buffer.concat([n,type,data,crc]);
}
export function makeCameraFixture(file){
  const width=1440,height=2408,channels=3,stride=width*channels;
  const data=Buffer.alloc(height*(stride+1));
  for(let y=0;y<height;y++){
    const offset=y*(stride+1);
    const r=y<1200?255:0,g=y>=1200&&y<1600?255:0,b=y>=1600?255:0;
    for(let x=0;x<width;x++){
      const i=offset+1+x*3;
      data[i]=r;data[i+1]=g;data[i+2]=b;
    }
  }
  const header=Buffer.alloc(13);
  header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);
  header[8]=8;header[9]=2;header[10]=0;header[11]=0;header[12]=0;
  fs.writeFileSync(file,Buffer.concat([
    signature,chunk('IHDR',header),
    chunk('IDAT',zlib.deflateSync(data,{level:6})),chunk('IEND',Buffer.alloc(0))
  ]));
}

function paeth(a,b,c){
  const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);
  return da<=db&&da<=dc?a:db<=dc?b:c;
}
/** Decode a single pixel from a standard 8-bit non-interlaced RGB/RGBA PNG.
 * Reject unknown PNG encodings instead of guessing colors.
 */
export function pngPixel(file,x,y){
  const bytes=fs.readFileSync(file);
  if(!bytes.subarray(0,8).equals(signature))throw new Error('png_signature_invalid');
  let width=0,height=0,depth=0,color=0,interlace=0;
  const idats=[];
  let offset=8;
  while(offset<bytes.length){
    if(offset+12>bytes.length)throw new Error('png_truncated_chunk');
    const len=bytes.readUInt32BE(offset);
    if(len>64*1024*1024||offset+len+12>bytes.length)throw new Error('png_chunk_invalid');
    const name=bytes.toString('ascii',offset+4,offset+8);
    const body=bytes.subarray(offset+8,offset+8+len);
    if(name==='IHDR'){
      width=body.readUInt32BE(0);height=body.readUInt32BE(4);
      depth=body[8];color=body[9];interlace=body[12];
    }else if(name==='IDAT') idats.push(body);
    else if(name==='IEND')break;
    offset+=12+len;
  }
  if(depth!==8||![2,6].includes(color)||interlace!==0||width<=0||height<=0||
     width>3840||height>3840){
    throw new Error('png_unsupported_encoding');
  }
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=width||y>=height){
    throw new Error('png_sample_out_of_bounds');
  }
  const bpp=color===6?4:3,stride=width*bpp;
  const raw=zlib.inflateSync(Buffer.concat(idats),{maxOutputLength:height*(stride+1)+1});
  if(raw.length!==height*(stride+1))throw new Error('png_inflated_size_mismatch');
  let previous=Buffer.alloc(stride),cursor=0;
  for(let row=0;row<=y;row++){
    const filter=raw[cursor++];
    const reconstructed=Buffer.alloc(stride);
    if(filter>4)throw new Error('png_filter_unsupported');
    for(let i=0;i<stride;i++){
      const v=raw[cursor++],left=i>=bpp?reconstructed[i-bpp]:0,
        up=previous[i],upperLeft=i>=bpp?previous[i-bpp]:0;
      let predictor=0;
      if(filter===1)predictor=left;
      else if(filter===2)predictor=up;
      else if(filter===3)predictor=Math.floor((left+up)/2);
      else if(filter===4)predictor=paeth(left,up,upperLeft);
      reconstructed[i]=(v+predictor)&255;
    }
    previous=reconstructed;
  }
  const index=x*bpp;
  return [previous[index],previous[index+1],previous[index+2]];
}
if(process.argv[1] && process.argv[1].endsWith('camera-png.mjs') && process.argv[2]==='create'){
  if(!process.argv[3])throw new Error('output_path_required');
  makeCameraFixture(process.argv[3]);
}
