'use strict';
const base=location.pathname.replace(/\/$/,'');
const versionsEl=document.querySelector('#versions');
const video=document.querySelector('#preview');
const message=document.querySelector('#message');
let active=null,versions=[];
async function openDesk(){
  const response=await fetch(base+'/versions',{cache:'no-store'});
  if(!response.ok)throw Error('Private review session unavailable');
  const packet=await response.json();
  versions=packet.previews;
  for(const item of versions){
    const button=document.createElement('button');
    button.type='button';
    button.textContent=item.label+' · v'+item.version;
    button.addEventListener('click',()=>selectVersion(item.index));
    button.dataset.index=String(item.index);
    versionsEl.appendChild(button);
  }
  selectVersion(versions.at(-1).index);
}
function selectVersion(index){
  const item=versions.find(v=>v.index===index);if(!item)return;
  active=item;
  video.pause();video.removeAttribute('src');video.load();
  video.src=base+'/media/'+item.index;video.load();
  for(const b of versionsEl.querySelectorAll('button'))
    b.setAttribute('aria-pressed',String(Number(b.dataset.index)===index));
  document.querySelector('#selected').textContent='Reviewing '+item.label+' (version '+item.version+')';
  message.textContent='';
}
video.addEventListener('error',()=>{
  message.textContent='This approved preview could not be played. The original file has not been changed.';
});
document.querySelector('#revision').addEventListener('submit',async(event)=>{
  event.preventDefault();
  const note=document.querySelector('#note').value.trim();
  if(!active||note.length<12||note.length>800){
    message.textContent='Describe the change in 12 to 800 characters.';
    return;
  }
  const submit=document.querySelector('#send');
  submit.disabled=true;message.textContent='Recording your review note locally…';
  try{
    const response=await fetch(base+'/notes',{
      method:'POST',headers:{'content-type':'application/json','x-fallen-review':'local-action'},
      body:JSON.stringify({index:active.index,expectedProjectDigest:active.projectDigest,note})
    });
    if(!response.ok)throw Error('Not recorded');
    const result=await response.json();
    message.textContent=result.status==='PRIVATE_NOTE_RECORDED'
      ?'Review note saved on this device for the operator. No edit or publication has started.'
      :'Unable to record this review.';
    if(result.status==='PRIVATE_NOTE_RECORDED')document.querySelector('#note').value='';
  }catch{
    message.textContent='Could not save the note. Your text remains here so you can retry.';
  }finally{submit.disabled=false;}
});
openDesk().catch(()=>{message.textContent='Unable to load private preview versions.';});
