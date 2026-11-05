const fileInput=document.getElementById('file');
const result=document.getElementById('result');
const details=document.getElementById('details');
const price=document.getElementById('price');
const priceNote=document.getElementById('price-note');
const status=document.getElementById('status');
const accepted=new Set(['mp4','mov','mkv','webm','m4v','avi','mp3','wav','m4a','aac','flac','ogg']);
let sequence=0;
let tiers=null;

const money=cents=>new Intl.NumberFormat('en-US',{
  style:'currency',currency:'USD',maximumFractionDigits:0
}).format(cents/100);
const readableBytes=bytes=>bytes>=1073741824
  ?(bytes/1073741824).toFixed(2)+' GB'
  :(bytes/1048576).toFixed(1)+' MB';

async function publishedTiers(){
  if(tiers)return tiers;
  const response=await fetch('./tiers.json',{credentials:'omit',cache:'no-store'});
  if(!response.ok)throw new Error('Published review tiers are unavailable.');
  const data=await response.json();
  if(data?.schema!=='evercraft.forensiscope.self-service-tier-snapshot.v1' ||
    data.price_status!=='quote_only_not_checkout'||
    !Array.isArray(data.tiers)||data.tiers.length!==5)
    throw new Error('Published review tiers could not be verified.');
  const sorted=data.tiers;
  if(!sorted.every((tier,index)=>
    Number.isSafeInteger(tier.duration_seconds)&&tier.duration_seconds>0&&
    Number.isSafeInteger(tier.amount_cents)&&tier.amount_cents>0&&
    (index===0||tier.duration_seconds>sorted[index-1].duration_seconds)))
    throw new Error('Review tier data is invalid.');
  tiers=sorted;
  return tiers;
}

async function localDuration(file){
  // The object URL is local to this browser. Neither file nor object URL is sent.
  const blob=URL.createObjectURL(file);
  const ext=String(file.name).split('.').pop().toLowerCase();
  const element=document.createElement(
    file.type.startsWith('video/')||['mp4','mov','mkv','webm','m4v','avi'].includes(ext)
      ?'video':'audio'
  );
  element.preload='metadata';
  element.muted=true;
  return new Promise((resolve,reject)=>{
    let ended=false;
    const clear=()=>{
      if(ended)return false;
      ended=true;
      clearTimeout(timeout);
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(blob);
      return true;
    };
    const timeout=setTimeout(()=>{
      if(clear())reject(new Error('Could not read duration on this device.'));
    },12000);
    element.addEventListener('loadedmetadata',()=>{
      const seconds=element.duration;
      if(clear()){
        if(Number.isFinite(seconds)&&seconds>0)resolve(Math.ceil(seconds));
        else reject(new Error('This recording has no readable duration.'));
      }
    },{once:true});
    element.addEventListener('error',()=>{
      if(clear())reject(new Error('This recording format could not be inspected in your browser.'));
    },{once:true});
    element.src=blob;
    element.load();
  });
}
function showError(message){
  result.hidden=false;
  details.textContent=message;
  price.textContent='';
  priceNote.textContent='Nothing has been sent or charged.';
}

fileInput.addEventListener('change',async()=>{
  const current=++sequence;
  const file=fileInput.files?.[0];
  result.hidden=true;
  if(!file)return;
  const ext=String(file.name).split('.').pop().toLowerCase();
  if(!accepted.has(ext)||!Number.isSafeInteger(file.size)||file.size<=0){
    showError('Choose a supported, nonempty video or audio file.');
    return;
  }
  status.textContent='Reading recording details on your device. No upload or payment.';
  try{
    const [duration,availableTiers]=await Promise.all([localDuration(file),publishedTiers()]);
    if(current!==sequence)return;
    const chosen=availableTiers.find(x=>duration<=x.duration_seconds);
    result.hidden=false;
    const minutes=Math.ceil(duration/60);
    details.textContent=file.name+' · '+readableBytes(file.size)+' · '+minutes+' min';
    if(chosen){
      price.textContent=money(chosen.amount_cents);
      priceNote.textContent='Published review tier estimate. Exact intake, codec, processing capacity, payment and delivery have not been verified for this file.';
    }else{
      price.textContent='Request exceeds published tiers';
      priceNote.textContent='Self-service is not currently available for recordings longer than 12 hours.';
    }
  }catch(error){
    if(current!==sequence)return;
    showError(error?.message||'Recording duration was not available.');
  }finally{
    if(current===sequence)status.textContent='Preflight only. Your file stayed on this device. No upload, checkout or analysis has started. Self-service checkout is not yet available.';
  }
});
