// Original Evercraft Worlds model source. One reproducible, self-contained glTF 2.0 binary mesh.
// No external tools, imports, hosted 3D assets, or runtime downloads.
export function createMossmereStoneGlb(){
 const sides=12,rings=[[-.30,.23],[-.22,.66],[0,.93],[.24,.82],[.37,.30]],vertices=[];
 for(let row=0;row<rings.length;row++){
  const [height,radius]=rings[row];
  for(let i=0;i<sides;i++){
   const a=2*Math.PI*i/sides;
   const perturb=.07*Math.sin(3*a+row*.44)+.045*Math.cos(5*a+.9*row);
   const r=radius*(1+.11*Math.sin(3*a+.7)+.055*Math.cos(7*a+row*.6));
   vertices.push([Math.cos(a)*r*.66+.09*height,height+perturb,Math.sin(a)*r*.52]);
  }
 }
 vertices.push([0,-.32,0],[0,.385,0]);
 const bottom=vertices.length-2,top=vertices.length-1,faces=[];
 for(let row=0;row<rings.length-1;row++)for(let i=0;i<sides;i++){
  const j=(i+1)%sides,a=row*sides+i,b=row*sides+j,c=(row+1)*sides+i,d=(row+1)*sides+j;
  faces.push([a,c,b],[b,c,d]);
 }
 for(let i=0;i<sides;i++){
  faces.push([bottom,i,(i+1)%sides]);
  const k=(rings.length-1)*sides;
  faces.push([k+i,top,k+(i+1)%sides]);
 }
 const oriented=faces.map(ids=>{
  const [a,b,c]=ids.map(i=>vertices[i]);
  const ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
  const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
  const avg=a.map((v,i)=>(v+b[i]+c[i])/3);
  return cross.reduce((v,n,i)=>v+n*avg[i],0)<0?[ids[0],ids[2],ids[1]]:ids;
 });
 const normals=vertices.map(([x,y,z])=>{
  const v=[x/.7,y/.43,z/.56],length=Math.hypot(...v)||1;
  return v.map(n=>n/length);
 });
 const flat=oriented.flat();
 const positionsSize=vertices.length*12,normalsSize=normals.length*12,indexSize=flat.length*2;
 const binLength=positionsSize+normalsSize+indexSize;
 const bin=new Uint8Array(Math.ceil(binLength/4)*4),view=new DataView(bin.buffer);
 vertices.forEach((v,i)=>v.forEach((n,j)=>view.setFloat32(i*12+j*4,n,true)));
 normals.forEach((v,i)=>v.forEach((n,j)=>view.setFloat32(positionsSize+i*12+j*4,n,true)));
 flat.forEach((n,i)=>view.setUint16(positionsSize+normalsSize+i*2,n,true));
 const doc={asset:{version:'2.0',generator:'Evercraft Worlds owned geometry 001'},
  buffers:[{byteLength:binLength}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:positionsSize},
    {buffer:0,byteOffset:positionsSize,byteLength:normalsSize},
    {buffer:0,byteOffset:positionsSize+normalsSize,byteLength:indexSize}],
  accessors:[{bufferView:0,componentType:5126,count:vertices.length,type:'VEC3'},
    {bufferView:1,componentType:5126,count:normals.length,type:'VEC3'},
    {bufferView:2,componentType:5123,count:flat.length,type:'SCALAR'}],
  meshes:[{name:'Mossmere Sculpted Pond Stone',primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2,material:0,mode:4}]}],
  materials:[{name:'Mossmere Weathered Limestone',pbrMetallicRoughness:{
    baseColorFactor:[.6,.64,.58,1],metallicFactor:0,roughnessFactor:.94}}]};
 const json=new TextEncoder().encode(JSON.stringify(doc));
 const jsonLen=Math.ceil(json.length/4)*4;
 const total=12+8+jsonLen+8+bin.length;
 const glb=new Uint8Array(total),dv=new DataView(glb.buffer);
 dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,total,true);
 dv.setUint32(12,jsonLen,true);dv.setUint32(16,0x4e4f534a,true);
 glb.fill(32,20,20+jsonLen);glb.set(json,20);
 const second=20+jsonLen;
 dv.setUint32(second,bin.length,true);dv.setUint32(second+4,0x004e4942,true);
 glb.set(bin,second+8);
 return glb;
}
