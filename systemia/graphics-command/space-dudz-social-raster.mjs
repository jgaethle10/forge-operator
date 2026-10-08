import zlib from 'node:zlib';

const FONT={
  ' ':[0,0,0,0,0,0,0],
  'A':[14,17,17,31,17,17,17],
  'B':[30,17,17,30,17,17,30],
  'C':[14,17,16,16,16,17,14],
  'D':[30,17,17,17,17,17,30],
  'E':[31,16,16,30,16,16,31],
  'F':[31,16,16,30,16,16,16],
  'G':[14,17,16,23,17,17,15],
  'I':[31,4,4,4,4,4,31],
  'L':[16,16,16,16,16,16,31],
  'M':[17,27,21,21,17,17,17],
  'N':[17,25,21,19,17,17,17],
  'O':[14,17,17,17,17,17,14],
  'P':[30,17,17,30,16,16,16],
  'R':[30,17,17,30,20,18,17],
  'S':[15,16,16,14,1,1,30],
  'T':[31,4,4,4,4,4,4],
  'U':[17,17,17,17,17,17,14],
  'V':[17,17,17,17,17,10,4],
  'Y':[17,17,10,4,4,4,4],
  'Z':[31,1,2,4,8,16,31],
  '0':[14,17,19,21,25,17,14],
  '1':[4,12,4,4,4,4,14],
  '2':[14,17,1,2,4,8,31],
  '3':[30,1,1,14,1,1,30],
  '4':[2,6,10,18,31,2,2],
  '5':[31,16,16,30,1,1,30],
  '6':[14,16,16,30,17,17,14],
  '7':[31,1,2,4,8,8,8],
  '8':[14,17,17,14,17,17,14],
  '9':[14,17,17,15,1,1,14],
  '-':[0,0,0,31,0,0,0],
  '.':[0,0,0,0,0,12,12],
};

const COLORS={
  ink:[7,17,31,255],
  cream:[244,235,213,255],
  aqua:[79,225,210,255],
  orange:[255,107,69,255],
  violet:[141,105,255,255],
};

function canvas(width,height,bg=COLORS.ink){
  const pixels=Buffer.alloc(width*height*4);
  for(let i=0;i<width*height;i++) for(let c=0;c<4;c++) pixels[i*4+c]=bg[c];
  return {width,height,pixels};
}
function setPixel(c,x,y,color){
  x=Math.round(x); y=Math.round(y);
  if(x<0||y<0||x>=c.width||y>=c.height)return;
  const i=(y*c.width+x)*4;
  c.pixels[i]=color[0];c.pixels[i+1]=color[1];c.pixels[i+2]=color[2];c.pixels[i+3]=color[3]??255;
}
function rect(c,x,y,w,h,color){
  const x0=Math.max(0,Math.floor(x)),y0=Math.max(0,Math.floor(y));
  const x1=Math.min(c.width,Math.ceil(x+w)),y1=Math.min(c.height,Math.ceil(y+h));
  for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++)setPixel(c,xx,yy,color);
}
function circle(c,cx,cy,r,color){
  const rr=r*r;
  for(let y=Math.floor(cy-r);y<=Math.ceil(cy+r);y++){
    const dy=y-cy;
    const dx=Math.sqrt(Math.max(0,rr-dy*dy));
    rect(c,cx-dx,y,dx*2+1,1,color);
  }
}
function line(c,x0,y0,x1,y1,width,color){
  const dx=x1-x0,dy=y1-y0,steps=Math.max(Math.abs(dx),Math.abs(dy),1);
  for(let i=0;i<=steps;i++){
    const t=i/steps;
    circle(c,x0+dx*t,y0+dy*t,width/2,color);
  }
}
function textWidth(text,scale){return [...String(text)].reduce((n,ch)=>n+(FONT[ch]?.length!==undefined?6:6)*scale,0)-scale;}
function drawText(c,text,x,y,scale,color,{center=false}={}){
  const value=String(text).toUpperCase();
  let cursor=center?x-textWidth(value,scale)/2:x;
  for(const ch of value){
    const rows=FONT[ch]||FONT[' '];
    for(let row=0;row<7;row++){
      const bits=rows[row]||0;
      for(let col=0;col<5;col++){
        if(bits&(1<<(4-col))) rect(c,cursor+col*scale,y+row*scale,scale,scale,color);
      }
    }
    cursor+=6*scale;
  }
}
function crcTable(){
  const table=new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):c>>>1;
    table[n]=c>>>0;
  }
  return table;
}
const CRC_TABLE=crcTable();
function crc32(buf){
  let c=0xffffffff;
  for(const b of buf)c=CRC_TABLE[(c^b)&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function chunk(type,data=Buffer.alloc(0)){
  const name=Buffer.from(type);
  const length=Buffer.alloc(4);length.writeUInt32BE(data.length);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([length,name,data,crc]);
}
function encodePng(c){
  const header=Buffer.alloc(13);
  header.writeUInt32BE(c.width,0);header.writeUInt32BE(c.height,4);
  header[8]=8;header[9]=6;header[10]=0;header[11]=0;header[12]=0;
  const raw=Buffer.alloc((c.width*4+1)*c.height);
  for(let y=0;y<c.height;y++){
    const row=y*(c.width*4+1);raw[row]=0;
    c.pixels.copy(raw,row+1,y*c.width*4,(y+1)*c.width*4);
  }
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',header),
    chunk('IDAT',zlib.deflateSync(raw,{level:9})),
    chunk('IEND'),
  ]);
}
function frame(c){
  rect(c,24,24,c.width-48,12,COLORS.aqua);
  rect(c,24,c.height-36,c.width-48,12,COLORS.orange);
}
function moonMotel(c){
  circle(c,350,315,205,COLORS.cream);
  circle(c,425,270,190,COLORS.ink);
  for(const [x,y,r] of [[125,185,9],[565,205,7],[108,365,6],[590,380,8]])circle(c,x,y,r,COLORS.orange);
  rect(c,92,430,516,168,COLORS.aqua);
  rect(c,104,442,492,144,COLORS.ink);
  drawText(c,'MOON MOTEL',350,475,8,COLORS.cream,{center:true});
  drawText(c,'ORBIT VACANCY',350,540,4,COLORS.aqua,{center:true});
  line(c,300,598,275,670,18,COLORS.cream);line(c,400,598,425,670,18,COLORS.cream);
}
function signalLost(c){
  for(const [x,y,w] of [[65,175,110],[525,205,90],[80,390,135],[500,420,120]])rect(c,x,y,w,10,COLORS.violet);
  circle(c,350,350,195,COLORS.aqua);circle(c,350,350,178,COLORS.ink);circle(c,350,350,138,COLORS.cream);
  circle(c,350,245,42,COLORS.orange);line(c,350,203,350,135,14,COLORS.cream);circle(c,350,125,14,COLORS.aqua);
  rect(c,245,340,210,96,COLORS.ink);rect(c,264,356,172,60,COLORS.violet);
  line(c,270,360,430,408,18,COLORS.aqua);line(c,270,410,430,360,12,COLORS.orange);
  drawText(c,'SIGNAL LOST',350,565,7,COLORS.cream,{center:true});
  drawText(c,'TRANSMISSION 404',350,625,4,COLORS.aqua,{center:true});
}
function orbitalService(c){
  circle(c,350,345,220,COLORS.orange);circle(c,350,345,203,COLORS.cream);circle(c,350,345,170,COLORS.ink);
  line(c,220,455,465,220,28,COLORS.aqua);circle(c,210,465,44,COLORS.cream);circle(c,210,465,24,COLORS.ink);
  line(c,400,250,500,165,30,COLORS.cream);rect(c,480,130,70,52,COLORS.orange);
  line(c,325,335,390,430,26,COLORS.orange);line(c,390,430,350,525,18,COLORS.violet);
  drawText(c,'ORBITAL',350,575,7,COLORS.cream,{center:true});
  drawText(c,'SERVICE CO',350,635,7,COLORS.cream,{center:true});
}
export function renderSpaceDudzSocialPng({candidate,campaign}={}){
  const c=canvas(700,800,COLORS.ink);
  frame(c);
  const concept=String(candidate?.concept||'').trim();
  if(concept==='moon_motel') moonMotel(c);
  else if(concept==='signal_lost') signalLost(c);
  else if(concept==='orbital_service') orbitalService(c);
  else throw new Error('space_dudz_social_concept_unsupported:'+concept);
  drawText(c,'SPACE DUDZ',350,62,6,COLORS.cream,{center:true});
  drawText(c,'ORBIT ONE',350,110,4,COLORS.orange,{center:true});
  drawText(c,'VOTE '+String(candidate?.label||''),350,708,7,COLORS.aqua,{center:true});
  drawText(c,'YOU PICK WHAT GETS MADE',350,762,3,COLORS.cream,{center:true});
  return encodePng(c);
}
