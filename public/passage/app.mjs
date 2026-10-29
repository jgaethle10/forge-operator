import {validateCatalog,filterArticles,portableHTML} from "./catalog.mjs";
const $=id=>document.getElementById(id);
const state={data:null,category:"All",query:"",current:null};
const favoriteKey="evercraft.passage.bookmarks.v1";
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function bookmarks(){try{const a=JSON.parse(localStorage.getItem(favoriteKey)||"[]");return Array.isArray(a)?a:[]}catch{return []}}
function saveBookmarks(a){try{localStorage.setItem(favoriteKey,JSON.stringify(a));return true}catch{return false}}
function download(text,name,type){const blob=new Blob([text],{type:type||"text/plain;charset=utf-8"});const url=URL.createObjectURL(blob);const a=el("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function refreshFilters(){const mount=$("filters");mount.replaceChildren();const cats=["All",...new Set(state.data.articles.map(a=>a.category))];for(const cat of cats){const b=el("button","filter",cat);b.type="button";b.setAttribute("aria-pressed",String(state.category===cat));b.addEventListener("click",()=>{state.category=cat;refreshFilters();renderCards()});mount.append(b)}}
function renderCards(){
 const items=filterArticles(state.data.articles,state.category,state.query);
 $("library-count").textContent=items.length+" "+(items.length===1?"guide":"guides");
 $("empty").hidden=items.length!==0;const mount=$("cards");mount.replaceChildren();
 for(const a of items){
  const card=el("article","article-card");
  const top=el("div","card-top");top.append(el("span","",a.category),el("span","",a.minutes+" MIN READ"));card.append(top,el("div","card-icon",a.icon),el("h3","",a.title),el("p","",a.description));
  const b=el("button","read-link","Read this guide →");b.type="button";b.addEventListener("click",()=>openArticle(a.id));card.append(b);mount.append(card);
 }
}
function showHome(){state.current=null;$("reader").hidden=true;$("home").hidden=false;document.title="Passage | Knowledge travels";if(location.hash.startsWith("#read=")){history.replaceState(null,"",location.pathname+location.search+"#library")};window.scrollTo(0,0)}
function openArticle(id){
 const a=state.data?.articles.find(x=>x.id===id);if(!a)return;
 state.current=a;$("home").hidden=true;$("reader").hidden=false;
 $("reader-category").textContent=a.category;$("reader-title").textContent=a.title;$("reader-description").textContent=a.description;
 $("reader-meta").textContent=a.minutes+" minute read · Edition "+a.edition+" · Original demonstration material";
 const content=$("reader-content");content.replaceChildren();
 for(const s of a.sections){content.append(el("h2","",s.heading));for(const p of s.paragraphs)content.append(el("p","",p))}
 const sources=$("reader-sources");sources.replaceChildren();
 sources.append(el("h2","","Further reading & provenance"));
 sources.append(el("p","","Original editorial demonstration text from Evercraft. "+a.rights+" The references below are for independent reading, not automated verification."));
 const ul=el("ul");for(const s of a.sources){const li=el("li");const link=el("a","",s.label+" ↗");link.href=s.url;link.target="_blank";link.rel="noopener noreferrer";li.append(link);ul.append(li)}sources.append(ul);
 $("bookmark-article").textContent=bookmarks().includes(a.id)?"Remove bookmark":"Save to this device";
 document.title=a.title+" | Passage";
 const next="#read="+encodeURIComponent(a.id);if(location.hash!==next)history.pushState(null,"",next);
 window.scrollTo(0,0);$("reader-title").focus?.();
}
function articleText(a){return a.title+"\n"+a.description+"\n\n"+a.category+" · Edition "+a.edition+"\n\n"+a.sections.map(s=>s.heading+"\n\n"+s.paragraphs.join("\n\n")).join("\n\n")+"\n\nRights: "+a.rights+"\nReferences for independent reading:\n"+a.sources.map(s=>s.label+": "+s.url).join("\n")+"\n\nPassage demonstration material. This download is not encrypted.\n";}
async function load(){
 try{
 const response=await fetch("./catalog.json",{cache:"no-cache"});if(!response.ok)throw Error("Catalog request failed");
 state.data=validateCatalog(await response.json());refreshFilters();renderCards();
 if(location.hash.startsWith("#read="))openArticle(decodeURIComponent(location.hash.slice(6)));
 $("download-library").disabled=false;
 }catch(err){$("cards").replaceChildren(el("p","empty","The library could not load. If this is your first visit, connect once and try again."));$("library-count").textContent="Not available";$("connection-status").textContent="Library not available";}
}
function status(){const base=navigator.onLine?"Online connection reported":"Device appears offline";$("connection-status").textContent=base+" · Offline downloads available after loading"}
function init(){
 $("download-library").disabled=true;
 $("search").addEventListener("input",e=>{state.query=e.target.value;renderCards()});
 $("download-library").addEventListener("click",()=>{if(state.data)download(portableHTML(state.data),"passage-offline-library.html","text/html;charset=utf-8")});
 $("download-article").addEventListener("click",()=>{if(state.current)download(articleText(state.current),"passage-"+state.current.id+".txt")});
 $("bookmark-article").addEventListener("click",()=>{const a=state.current;if(!a)return;const saved=bookmarks();const present=saved.includes(a.id);const next=present?saved.filter(id=>id!==a.id):[...saved,a.id];if(saveBookmarks(next))$("bookmark-article").textContent=present?"Save to this device":"Remove bookmark";else $("bookmark-article").textContent="Storage unavailable"});
 $("back").addEventListener("click",showHome);window.addEventListener("popstate",()=>{const id=location.hash.startsWith("#read=")?decodeURIComponent(location.hash.slice(6)):null;if(id&&state.data)openArticle(id);else showHome()});
 window.addEventListener("online",status);window.addEventListener("offline",status);status();
 if("serviceWorker" in navigator && location.protocol==="https:"){navigator.serviceWorker.register("./sw.js",{scope:"./"}).then(()=>navigator.serviceWorker.ready).then(()=>{status();$("connection-status").textContent+=" · App shell cached on this device"}).catch(()=>status())}
 load();
}
init();
