// In-process texture decode using Evercraft's OWN Chromium page, no external network.
// The caller supplies an already-admitted Playwright Page from the Browser Worker.
// Decoding happens through browser-native PNG/JPEG codecs and produces canonical RGBA.
import {extractGltfEmbeddedImages} from './gltf-asset-pack.mjs';

function check(condition,why){if(!condition)throw new Error('visual_gltf_decode_'+why);}
export async function decodeGltfEmbeddedImagesInPage({
  page,gltf,buffers,maxImages=32,maxEncodedBytes=16*1024*1024,
  maxPixelsPerImage=4*1024*1024,maxTotalRgbaBytes=128*1024*1024
}){
  check(page&&typeof page.evaluate==='function','page_required');
  for(const [key,value] of Object.entries({maxPixelsPerImage,maxTotalRgbaBytes})){
    check(Number.isSafeInteger(value)&&value>0,key+'_invalid');
  }
  const inputs=extractGltfEmbeddedImages(gltf,buffers,{maxImages,maxEncodedBytes});
  const decoded={};
  let total=0;
  for(const entry of inputs){
    const result=await page.evaluate(async ({encodedBase64,mimeType,maxPixelsPerImage})=>{
      if(typeof createImageBitmap!=='function'){
        throw new Error('browser_image_bitmap_unavailable');
      }
      const binary=atob(encodedBase64);
      const input=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)input[i]=binary.charCodeAt(i);
      const blob=new Blob([input],{type:mimeType});
      const bitmap=await createImageBitmap(blob,{
        imageOrientation:'none',
        premultiplyAlpha:'none',
        colorSpaceConversion:'none'
      });
      try{
        if(bitmap.width<1||bitmap.height<1||
          bitmap.width*bitmap.height>maxPixelsPerImage){
          throw new Error('image_pixel_budget_exceeded');
        }
        const canvas=document.createElement('canvas');
        canvas.width=bitmap.width;canvas.height=bitmap.height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true,alpha:true});
        if(!ctx)throw new Error('rgba_canvas_unavailable');
        ctx.drawImage(bitmap,0,0);
        const pixels=ctx.getImageData(0,0,bitmap.width,bitmap.height).data;
        return {width:bitmap.width,height:bitmap.height,rgba:Array.from(pixels)};
      }finally{bitmap.close();}
    },{encodedBase64:entry.encodedBase64,mimeType:entry.mimeType,maxPixelsPerImage});
    check(Number.isInteger(result?.width)&&Number.isInteger(result?.height)&&
      result.width>0&&result.height>0&&result.width*result.height<=maxPixelsPerImage,
      'raster_dimensions_invalid:'+entry.index);
    check(Array.isArray(result.rgba)&&result.rgba.length===result.width*result.height*4&&
      result.rgba.every(x=>Number.isInteger(x)&&x>=0&&x<=255),
      'raster_data_invalid:'+entry.index);
    total+=result.rgba.length;
    check(total<=maxTotalRgbaBytes,'rgba_budget_exceeded');
    decoded[entry.index]={
      width:result.width,height:result.height,rgba:result.rgba,
      sourceSha256:entry.sourceSha256
    };
  }
  return decoded;
}
