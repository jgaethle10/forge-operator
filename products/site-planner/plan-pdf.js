/* Evercraft Kennedy Studio: owner-controlled two-sheet PDF, no third-party runtime.
   Converts the same two on-screen SVG sheets into JPEG XObjects inside a PDF 1.4 file.
   Unlike print(), it provides an actual downloadable PDF on iOS and desktop.
   The operator's own source photos remain browser-local. */
(function(){
'use strict';
const PAGE=[1224,792],IMAGE=[1400,870],MAX_JPEG=20*1024*1024;
const encoder=new TextEncoder();
const ascii=(s)=>encoder.encode(s);
function validateJpeg(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<4||bytes.length>MAX_JPEG||
    bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)
  throw Error('The rendered plan page is not a valid JPEG');
 return bytes;
}
function fromBase64(url){
 if(typeof url!=='string'||!url.startsWith('data:image/jpeg;base64,'))throw Error('JPEG rendering was unavailable');
 const raw=atob(url.slice('data:image/jpeg;base64,'.length));
 const bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return validateJpeg(bytes);
}
function pdfBytes(jpegs){
 if(!Array.isArray(jpegs)||jpegs.length!==2)throw Error('The site plan requires two drawing sheets');
 jpegs.forEach(validateJpeg);
 const chunks=[],offsets=Array(9).fill(0);let position=0;
 function push(x){const bytes=typeof x==='string'?ascii(x):x;chunks.push(bytes);position+=bytes.length}
 function object(id,value){offsets[id]=position;push(id+' 0 obj\n');push(value);push('\nendobj\n')}
 function stream(id,dict,data){
  offsets[id]=position;push(id+' 0 obj\n<< '+dict+' /Length '+data.length+' >>\nstream\n');
  push(data);push('\nendstream\nendobj\n');
 }
 const width=PAGE[0],height=IMAGE[1]*width/IMAGE[0],margin=(PAGE[1]-height)/2;
 const draw=ascii('q\n'+width.toFixed(2)+' 0 0 '+height.toFixed(2)+' 0 '+margin.toFixed(2)+' cm\n/Im0 Do\nQ\n');
 push('%PDF-1.4\n');
 push(new Uint8Array([37,226,227,207,211,10]));
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,'<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>');
 for(let i=0;i<2;i++){
  const page=i?6:3,contents=i?7:4,image=i?8:5;
  object(page,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1224 792] /Resources << /XObject << /Im0 '+image+' 0 R >> >> /Contents '+contents+' 0 R >>');
  stream(contents,'',draw);
  stream(image,'/Type /XObject /Subtype /Image /Width '+IMAGE[0]+' /Height '+IMAGE[1]+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',jpegs[i]);
 }
 const start=position;
 push('xref\n0 9\n0000000000 65535 f \n');
 for(let i=1;i<9;i++)push(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
 push('trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n');
 const output=new Uint8Array(position);let at=0;
 for(const x of chunks){output.set(x,at);at+=x.length}
 return output;
}
async function rasterSheet(id){
 const source=$(id),svg=source.cloneNode(true);
 const hit=svg.querySelector('#hit-target');if(hit)hit.remove();
 svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
 svg.setAttribute('width',String(IMAGE[0]));svg.setAttribute('height',String(IMAGE[1]));
 const xml=new XMLSerializer().serializeToString(svg);
 const blob=new Blob([xml],{type:'image/svg+xml;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 try{
  const image=await new Promise((resolve,reject)=>{
   const x=new Image();
   x.onload=()=>resolve(x);
   x.onerror=()=>reject(Error('Unable to render '+id+' into a PDF page'));
   x.src=url;
  });
  const canvas=document.createElement('canvas');
  canvas.width=IMAGE[0];canvas.height=IMAGE[1];
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('PDF drawing surface unavailable on this device');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return fromBase64(canvas.toDataURL('image/jpeg',0.9));
 }finally{URL.revokeObjectURL(url)}
}
let currentLink=null,busy=false;
async function getPdf(){
 if(busy)return;
 busy=true;const btn=$('print'),ready=$('pdfReady');
 btn.disabled=true;btn.textContent='Preparing your PDF…';ready.hidden=true;
 $('messages').textContent='Building two landscape sheets on your device. No imagery is uploaded.';
 try{
  const images=[await rasterSheet('drawing-1'),await rasterSheet('drawing-2')];
  const result=pdfBytes(images);
  const blob=new Blob([result],{type:'application/pdf'});
  const next=URL.createObjectURL(blob);
  if(currentLink)URL.revokeObjectURL(currentLink);
  currentLink=next;
  ready.href=next;ready.download='Evercraft-EV-Site-Concept-S01-A01.pdf';ready.hidden=false;
  $('messages').textContent='Your two-sheet PDF is ready. Tap the download link below if your phone does not save files automatically. This is a concept, not engineering approval.';
  // Trigger the download as a convenience; iOS may require the visible user-tapped link.
  try{ready.click()}catch{}
 }catch(e){
  $('messages').textContent='PDF could not be created: '+e.message+'. Use More tools → browser Print / Save PDF instead.';
  ready.hidden=true;
 }finally{busy=false;btn.disabled=false;btn.textContent='Get your PDF'}
}
$('print').addEventListener('click',getPdf);
$('printFallback').addEventListener('click',()=>window.print());
window.__evercraftPdf={pdfBytes,validateJpeg};
})();
