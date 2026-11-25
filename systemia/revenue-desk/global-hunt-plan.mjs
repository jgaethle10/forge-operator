// Read-only query planning. No network, contact harvesting, messaging or claims of demand.
export const markets=Object.freeze([
 ['US','en','request for proposals','video production','website redesign','EV charging feasibility'],
 ['CA','fr','appel d’offres','production vidéo','refonte site web','bornes de recharge'],
 ['MX','es','solicitud de cotización','producción de video','rediseño web','estaciones de carga'],
 ['BR','pt','solicitação de proposta','produção de vídeo','desenvolvimento de site','recarga de veículos elétricos'],
 ['GB','en','invitation to tender','video production','website development','EV charging feasibility'],
 ['DE','de','Ausschreibung','Videoproduktion','Webentwicklung','Ladeinfrastruktur'],
 ['FR','fr','appel d’offres','production audiovisuelle','refonte site web','infrastructure de recharge'],
 ['JP','ja','公募','動画制作','ウェブサイト制作','充電設備'],
 ['KR','ko','입찰 공고','영상 제작','웹사이트 구축','전기차 충전'],
 ['IN','hi','निविदा','वीडियो निर्माण','वेबसाइट विकास','ईवी चार्जिंग'],
 ['AE','ar','طلب عروض','إنتاج الفيديو','تطوير المواقع','شحن المركبات الكهربائية'],
 ['ZA','en','request for quotation','video production','website development','EV charging'],
 ['AU','en','request for tender','video production','website development','EV charging']
].map(row=>Object.freeze(row)));
const lanes=['commercial-media','software','ev-planning'];
export function planGlobalHunt({cycle=0,limit=12}={}){
 if(!Number.isSafeInteger(cycle)||cycle<0||!Number.isInteger(limit)||limit<1||limit>39)throw Error('invalid_hunt_bounds');
 const all=markets.flatMap(([country,language,intent,...terms])=>terms.map((term,i)=>({
 country,language,lane:lanes[i],query:intent+' '+term+' '+country,
 evidence_required:['original_buyer_request','current_deadline_or_active_need','buyer_identity','regional_eligibility','approved_response_channel','payment_feasibility'],
 source_policy:'first_party_or_official_public_source',contact_authorized:false,qualified:false
 })));
 const offset=((cycle%all.length)*limit)%all.length;
 return {schema:'evercraft.kaidance.global-hunt-plan.v1',cycle,queries:Array.from({length:limit},(_,i)=>all[(offset+i)%all.length]),search_performed:false,send_performed:false};
}
