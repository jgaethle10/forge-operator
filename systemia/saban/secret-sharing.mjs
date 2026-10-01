import { randomBytes } from 'node:crypto';

function mul(a,b){
  let x=a&255,y=b&255,p=0;
  for(let i=0;i<8;i++){
    if(y&1)p^=x;
    const hi=x&0x80;
    x=(x<<1)&0xff;
    if(hi)x^=0x1b;
    y>>=1;
  }
  return p&255;
}
function pow(a,n){
  let base=a&255,result=1,exp=n;
  while(exp>0){
    if(exp&1) result=mul(result,base);
    base=mul(base,base);
    exp>>=1;
  }
  return result;
}
function inv(a){
  if((a&255)===0) throw new Error('shamir_divide_by_zero');
  return pow(a,254);
}
function div(a,b){return mul(a,inv(b));}

export function splitSecret(secret,{
  shares=3,
  threshold=2,
  randomBytesImpl=randomBytes,
}={}){
  const input=Buffer.from(secret||[]);
  const n=Math.max(2,Math.min(255,Math.floor(Number(shares||3))));
  const k=Math.max(2,Math.min(n,Math.floor(Number(threshold||2))));
  if(!input.length) throw new Error('shamir_secret_required');

  const coeffs=Array.from({length:input.length},(_,i)=>{
    const random=randomBytesImpl(k-1);
    return [input[i],...random];
  });
  const out=[];
  for(let x=1;x<=n;x++){
    const data=Buffer.alloc(input.length+1);
    data[0]=x;
    for(let bi=0;bi<input.length;bi++){
      let y=0;
      let xp=1;
      for(const c of coeffs[bi]){
        y^=mul(c,xp);
        xp=mul(xp,x);
      }
      data[bi+1]=y;
    }
    out.push({
      schema:'evercraft.saban.shamir-share.v1',
      x,
      threshold:k,
      share_count:n,
      share_base64:data.toString('base64'),
    });
  }
  return out;
}

export function combineSecret(shares,{
  threshold=null,
}={}){
  if(!Array.isArray(shares)||!shares.length) throw new Error('shamir_shares_required');
  const parsed=shares.map(item=>{
    const raw=Buffer.from(
      typeof item==='string'?item:item?.share_base64||'',
      'base64'
    );
    if(raw.length<2) throw new Error('shamir_share_invalid');
    return {x:raw[0],raw,threshold:Number(item?.threshold||0)};
  });
  const unique=new Set(parsed.map(x=>x.x));
  if(unique.size!==parsed.length) throw new Error('shamir_duplicate_share_x');
  const lengths=new Set(parsed.map(x=>x.raw.length));
  if(lengths.size!==1) throw new Error('shamir_share_length_mismatch');
  const inferred=threshold??Math.max(...parsed.map(x=>x.threshold||0),2);
  const k=Math.max(2,Math.floor(Number(inferred||2)));
  if(parsed.length<k) throw new Error('shamir_insufficient_shares');
  const selected=parsed.slice(0,k);
  const out=Buffer.alloc(selected[0].raw.length-1);

  for(let bi=1;bi<selected[0].raw.length;bi++){
    let value=0;
    for(let i=0;i<selected.length;i++){
      const xi=selected[i].x;
      let basis=1;
      for(let j=0;j<selected.length;j++){
        if(i===j)continue;
        const xj=selected[j].x;
        basis=mul(basis,div(xj,xj^xi));
      }
      value^=mul(selected[i].raw[bi],basis);
    }
    out[bi-1]=value;
  }
  return out;
}
