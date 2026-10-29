// Local browser producer. All files remain on the operator's computer.
// This code deliberately contains no fetch, network clients, storage, or publication action.
const $=id=>document.getElementById(id);
const root=$('app'), stage=$('stage'),picture=$('picture'),picker=$('mediaPicker');
const allowed=Object.freeze({'.mp4':'video/mp4','.webm':'video/webm','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'});
const MAX_ITEMS=24,MAX_BYTES=3_000_000_000,IMAGE_MS=14_000;
const state={items:[],index:-1,paused:false,muted:true,timer:null,remaining:IMAGE_MS,start:0};
function kindOf(file){
  if(!(file instanceof File))return null;
  const name=String(file.name||'').toLowerCase(),match=/\.(mp4|webm|png|jpg|jpeg|webp)$/.exec(name);
  if(!match)return null;
  const expected=allowed['.'+match[1]];
  // Empty MIME is normal for some local mobile files. A conflicting MIME fails.
  if(file.type&&file.type!==expected)return null;
  if(!file.size||file.size>MAX_BYTES)return null;
  return expected;
}
function notify(message){
 const node=$('overlay');node.textContent=message;node.classList.add('show');
 clearTimeout(notify.timeout);notify.timeout=setTimeout(()=>node.classList.remove('show'),3400);
}
function stopTimer(){clearTimeout(state.timer);state.timer=null}
function cleanupPicture(){
 stopTimer();
 const active=picture.querySelector('video');
 if(active){active.pause();active.removeAttribute('src');active.load()}
 picture.replaceChildren();
}
function redrawQueue(){
 const q=$('queue');q.replaceChildren();
 state.items.forEach((item,i)=>{
  const b=document.createElement('button');b.type='button';b.className='queue-item'+(i===state.index?' active':'');
  const t=document.createElement('b');t.textContent=item.file.name;
  const d=document.createElement('small');d.textContent=(item.kind.startsWith('video')?'VIDEO':'IMAGE')+' · '+Math.round(item.file.size/1024/1024)+' MB';
  b.append(t,d);b.addEventListener('click',()=>play(i));q.append(b);
 });
 $('queueStatus').textContent=state.items.length+' local file'+(state.items.length===1?'':'s')+' · NOT UPLOADED';
 const ready=state.items.length>0;
 for(const id of ['prev','pause','next','film'])$(id).disabled=!ready;
 $('sceneCount').textContent=ready?'ORIGINAL SOURCE '+String(state.index+1).padStart(2,'0')+' / '+String(state.items.length).padStart(2,'0'):'NO ORIGINAL MEDIA SELECTED';
 if(ready){
   $('sceneTitle').textContent=state.items[state.index].file.name;
   $('sceneDetail').textContent='Local operator preview · rights/private-content review required';
 }else{
   $('sceneTitle').textContent='Ready for the first scene';$('sceneDetail').textContent='Files remain on this device. Reopening the page clears the queue.';
 }
}
function imageTimer(ms){
 stopTimer();
 state.remaining=ms;state.start=Date.now();
 if(!state.paused)state.timer=setTimeout(()=>play(state.index+1),ms);
}
function play(n){
 if(!state.items.length)return;
 const index=((n%state.items.length)+state.items.length)%state.items.length;
 state.index=index;state.paused=false;$('pause').textContent='Pause';
 cleanupPicture();
 const item=state.items[index],image=item.kind.startsWith('image');
 const node=document.createElement(image?'img':'video');
 node.src=item.url;node.alt=image?'Original local preview, not uploaded':'';
 if(!image){
   node.autoplay=true;node.playsInline=true;node.muted=state.muted;node.preload='metadata';
   node.addEventListener('ended',()=>{if(state.index===index&&!state.paused)play(index+1)});
   node.addEventListener('loadedmetadata',()=>{if(!Number.isFinite(node.duration)||node.duration===Infinity)notify('Video duration unavailable; change scene manually.')});
   node.addEventListener('error',()=>notify('This source could not be decoded. Try an MP4 H.264 file.'));
 }else{
   node.addEventListener('error',()=>notify('This image could not be decoded.'));
   imageTimer(IMAGE_MS);
 }
 picture.append(node);
 if(!image){node.play().catch(()=>notify('Autoplay blocked. Tap the stage to play the selected video.'))}
 $('empty').hidden=true;$('screenBadge').hidden=false;redrawQueue();
}
function accept(files){
 const incoming=Array.from(files||[]);
 let added=0,refused=0;
 for(const file of incoming){
   const kind=kindOf(file);
   if(!kind||state.items.length>=MAX_ITEMS){refused++;continue}
   state.items.push({file,kind,url:URL.createObjectURL(file)});added++;
 }
 if(state.index<0&&added)play(0);
 else redrawQueue();
 if(refused)notify(refused+' file(s) skipped. Use original MP4, WebM, PNG, JPG, or WebP under 3 GB.');
 if(added&&!refused)notify(added+' source file(s) staged locally. No upload occurred.');
}
picker.addEventListener('change',()=>{accept(picker.files);picker.value=''});
$('add').onclick=()=>picker.click();$('emptyAdd').onclick=()=>picker.click();
$('prev').onclick=()=>play(state.index-1);$('next').onclick=()=>play(state.index+1);
$('pause').onclick=()=>{
 if(state.index<0)return;
 state.paused=!state.paused;
 const v=picture.querySelector('video');
 if(v){if(state.paused)v.pause();else v.play().catch(()=>notify('Tap the stage to resume playback.'))}
 else if(state.paused){state.remaining=Math.max(1000,state.remaining-(Date.now()-state.start));stopTimer()}
 else imageTimer(state.remaining);
 $('pause').textContent=state.paused?'Resume':'Pause';
};
$('fit').onclick=()=>{
 const cover=stage.classList.toggle('cover');$('fit').textContent=cover?'Cover':'Contain';$('fit').setAttribute('aria-pressed',String(cover))
};
$('portrait').onclick=()=>{
 const on=root.classList.toggle('portrait');
 $('portrait').textContent=on?'16:9':'9:16';
 $('portrait').setAttribute('aria-pressed',String(on));
};
$('sound').onclick=()=>{
 state.muted=!state.muted;
 const v=picture.querySelector('video');if(v)v.muted=state.muted;
 $('sound').textContent=state.muted?'Muted':'Sound on';$('sound').setAttribute('aria-pressed',String(!state.muted));
 if(!state.muted)notify('Only enable sound when you hold the audio rights.');
};
function film(on){if(on&&!state.items.length)return;root.classList.toggle('film',on)}
$('film').onclick=()=>film(true);$('exitFilm').onclick=()=>film(false);
stage.addEventListener('click',e=>{
 if(e.target===stage||e.target===picture||e.target===picture.querySelector('video')){
   const v=picture.querySelector('video');if(v&&v.paused&&!state.paused)v.play().catch(()=>{});
 }
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape')film(false);
 if(e.target instanceof HTMLInputElement)return;
 if(e.key==='ArrowRight'&&state.items.length)play(state.index+1);
 if(e.key==='ArrowLeft'&&state.items.length)play(state.index-1);
});
for(const event of ['dragenter','dragover'])stage.addEventListener(event,e=>{e.preventDefault();stage.classList.add('drag')});
for(const event of ['dragleave','drop'])stage.addEventListener(event,e=>{e.preventDefault();stage.classList.remove('drag')});
stage.addEventListener('drop',e=>accept(e.dataTransfer?.files));
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',e=>e.preventDefault());
window.addEventListener('beforeunload',()=>{cleanupPicture();for(const item of state.items)URL.revokeObjectURL(item.url)});
redrawQueue();
