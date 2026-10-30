import {validateCatalog,filterArticles,portableHTML} from "./catalog.mjs";
const $=id=>document.getElementById(id);
const state={data:null,category:"All",query:"",current:null};
const favoriteKey="evercraft.passage.bookmarks.v1";
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function bookmarks(){try{const data=JSON.parse(localStorage.getItem(favoriteKey)||"[]");return Array.isArray(data)?data.filter(id=>typeof id==="string"):[]}catch{return []}}
function saveBookmarks(items){try{localStorage.setItem(favoriteKey,JSON.stringify(items));return true}catch{return false}}
function download(content,name,type="text/plain;charset=utf-8"){
 const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const link=el("a");
 link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function refreshFilters(){
 const mount=$("filters");mount.replaceChildren();
 for(const category of ["All","Saved",...new Set(state.data.articles.map(a=>a.category))]){
  const button=el("button","filter",category);button.type="button";button.setAttribute("aria-pressed",String(state.category===category));
  button.addEventListener("click",()=>{state.category=category;refreshFilters();renderCards()});mount.append(button);
 }
}
function renderCards(){
 let articles=filterArticles(state.data.articles,state.category==="Saved"?"All":state.category,state.query);
 if(state.category==="Saved"){const saved=new Set(bookmarks());articles=articles.filter(a=>saved.has(a.id))}
 $("library-count").textContent=articles.length+" "+(articles.length===1?"guide":"guides");
 $("empty").textContent=state.category==="Saved"?"No saved guides yet. Open an article and choose Save to this device.":"No matching guides. Try another search or category.";
 $("empty").hidden=articles.length!==0;const mount=$("cards");mount.replaceChildren();
 for(const a of articles){
  const card=el("article","article-card"),top=el("div","card-top");
  top.append(el("span","",a.category),el("span","",a.minutes+" MIN READ"));card.append(top,el("div","card-icon",a.icon),el("h3","",a.title),el("p","",a.description));
  const button=el("button","read-link","Read this guide →");button.type="button";
  button.addEventListener("click",()=>openArticle(a.id));card.append(button);mount.append(card);
 }
}
function showLibrary({focus=true}={}){
 state.current=null;$("reader").hidden=true;$("home").hidden=false;document.title="Passage | Knowledge travels";
 renderCards();window.scrollTo(0,0);
 if(focus){$("library-title").setAttribute("tabindex","-1");$("library-title").focus({preventScroll:true});$("library").scrollIntoView({block:"start"});}
}
function articleFromHash(){if(!location.hash.startsWith("#read="))return null;try{return decodeURIComponent(location.hash.slice(6))}catch{return null}}
function openArticle(id,{updateHistory=true,focus=true}={}){
 const a=state.data?.articles.find(x=>x.id===id);if(!a)return false;
 state.current=a;$("home").hidden=true;$("reader").hidden=false;
 $("reader-category").textContent=a.category;$("reader-title").textContent=a.title;$("reader-description").textContent=a.description;
 $("reader-meta").textContent=a.minutes+" min read · Library edition "+state.data.edition+" · Guide edition "+a.edition+" · Demo material";
 const content=$("reader-content");content.replaceChildren();
 for(const s of a.sections){content.append(el("h2","",s.heading));for(const p of s.paragraphs)content.append(el("p","",p))}
 const sources=$("reader-sources");sources.replaceChildren();
 sources.append(el("h2","","Further reading & provenance"));
 sources.append(el("p","","Original demonstration editorial text from Evercraft. "+a.rights+" Links are provided for independent reading, not automated verification."));
 const list=el("ul");for(const s of a.sources){const item=el("li"),link=el("a","",s.label+" ↗");link.href=s.url;link.target="_blank";link.rel="noopener noreferrer";item.append(link);list.append(item)}sources.append(list);
 $("bookmark-article").textContent=bookmarks().includes(a.id)?"Remove bookmark":"Save to this device";
 document.title=a.title+" | Passage";
 if(updateHistory&&location.hash!=="#read="+encodeURIComponent(a.id))history.pushState(null,"","#read="+encodeURIComponent(a.id));
 window.scrollTo(0,0);if(focus)$("reader-title").focus({preventScroll:true});return true;
}
function articleText(a){
 return a.title+"\n"+a.description+"\n\n"+a.category+" · Guide edition "+a.edition+"\n\n"+
 a.sections.map(s=>s.heading+"\n\n"+s.paragraphs.join("\n\n")).join("\n\n")+
 "\n\nRights: "+a.rights+"\nReferences for independent reading:\n"+
 a.sources.map(s=>s.label+": "+s.url).join("\n")+"\n\nPassage demonstration material. This file is not encrypted.\n";
}
function connectionStatus(){
 const status=navigator.onLine?"Connection reported online.":"Device appears offline. Cached material may be outdated.";
 $("connection-status").textContent=status+(state.data?" Library edition "+state.data.edition+".":"");
}
async function load(){
 try{
  const response=await fetch("./catalog.json",{cache:"no-store"});if(!response.ok)throw Error("Catalog unavailable");
  state.data=validateCatalog(await response.json());
  $("download-library").disabled=false;refreshFilters();renderCards();connectionStatus();
  if(!openArticle(articleFromHash(),{updateHistory:false,focus:false})&&location.hash.startsWith("#read="))history.replaceState(null,"","#library");
 }catch{
  $("cards").replaceChildren(el("p","empty","The library is unavailable. On a first visit, connect once and retry. For reliable offline access, use a previously downloaded standalone copy."));
  $("library-count").textContent="Unavailable";$("connection-status").textContent="Library unavailable";$("download-library").disabled=true;
 }
}
function init(){
 $("download-library").disabled=true;$("reader-title").setAttribute("tabindex","-1");
 $("search").addEventListener("input",event=>{state.query=event.target.value;renderCards()});
 $("download-library").addEventListener("click",()=>{if(state.data)download(portableHTML(state.data),"passage-offline-library-"+state.data.edition+".html","text/html;charset=utf-8")});
 $("download-article").addEventListener("click",()=>{if(state.current)download(articleText(state.current),"passage-"+state.current.id+".txt")});
 $("bookmark-article").addEventListener("click",()=>{
  const a=state.current;if(!a)return;const saved=bookmarks(),has=saved.includes(a.id);
  const updated=has?saved.filter(id=>id!==a.id):[...saved,a.id];
  $("bookmark-article").textContent=saveBookmarks(updated)?has?"Save to this device":"Remove bookmark":"Device storage unavailable";
 });
 $("back").addEventListener("click",()=>{history.pushState(null,"","#library");showLibrary()});
 window.addEventListener("popstate",()=>{
  if(!state.data)return;
  const id=articleFromHash();
  if(id&&openArticle(id,{updateHistory:false}))return;
  showLibrary({focus:false});
 });
 window.addEventListener("online",connectionStatus);window.addEventListener("offline",connectionStatus);connectionStatus();
 if("serviceWorker" in navigator&&window.isSecureContext){
  navigator.serviceWorker.register("./sw.js",{scope:"./"}).catch(()=>{ /* Standalone export remains available without a service worker. */ });
 }
 load();
}
init();
