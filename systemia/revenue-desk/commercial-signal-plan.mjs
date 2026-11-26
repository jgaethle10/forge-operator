// Read-only query planning; economic events are hypotheses, never buying intent.
import {createHash} from 'node:crypto';
const markets=[
 ['US','en','looking for','subcontracting opportunities','supplier registration','expansion announcement','website redesign','video production','data analysis','workflow automation'],
 ['CA','fr','recherche prestataire','opportunités de sous-traitance','inscription fournisseurs','annonce expansion','refonte site web','production vidéo','analyse de données','automatisation des processus'],
 ['MX','es','buscamos proveedor','oportunidades de subcontratación','registro de proveedores','anuncio de expansión','rediseño web','producción de video','análisis de datos','automatización de procesos'],
 ['BR','pt','buscamos fornecedor','oportunidades de subcontratação','cadastro de fornecedores','anúncio de expansão','desenvolvimento de site','produção de vídeo','análise de dados','automação de processos'],
 ['GB','en','seeking supplier','subcontracting opportunities','supplier registration','expansion announcement','website development','video production','data analysis','workflow automation'],
 ['DE','de','Dienstleister gesucht','Nachunternehmer gesucht','Lieferantenregistrierung','Expansion angekündigt','Webentwicklung','Videoproduktion','Datenanalyse','Prozessautomatisierung'],
 ['FR','fr','recherche prestataire','recherche sous-traitant','inscription fournisseurs','annonce expansion','refonte site web','production audiovisuelle','analyse de données','automatisation des processus'],
 ['JP','ja','委託先募集','協力会社募集','取引先募集','事業拡大','ウェブサイト制作','動画制作','データ分析','業務自動化'],
 ['KR','ko','외주 업체 모집','협력업체 모집','공급업체 등록','사업 확장','웹사이트 구축','영상 제작','데이터 분석','업무 자동화'],
 ['IN','en','seeking service provider','subcontracting opportunities','vendor registration','expansion announcement','website development','video production','data analysis','workflow automation'],
 ['AE','ar','مطلوب مزود خدمات','فرص التعاقد من الباطن','تسجيل الموردين','إعلان توسع','تطوير المواقع','إنتاج الفيديو','تحليل البيانات','أتمتة العمليات'],
 ['ZA','en','seeking service provider','subcontracting opportunities','supplier registration','expansion announcement','website development','video production','data analysis','workflow automation'],
 ['AU','en','seeking service provider','subcontracting opportunities','supplier registration','expansion announcement','website development','video production','data analysis','workflow automation'],
 ['SV','es','buscamos proveedor','oportunidades de subcontratación','registro de proveedores','anuncio de expansión','desarrollo web','producción de video','análisis de datos','automatización de procesos'],
 ['CO','es','buscamos proveedor','oportunidades de subcontratación','registro de proveedores','anuncio de expansión','desarrollo web','producción de video','análisis de datos','automatización de procesos'],
 ['CL','es','buscamos proveedor','oportunidades de subcontratación','registro de proveedores','anuncio de expansión','desarrollo web','producción de video','análisis de datos','automatización de procesos'],
 ['NZ','en','seeking service provider','subcontracting opportunities','supplier registration','expansion announcement','website development','video production','data analysis','workflow automation'],
 ['SG','en','seeking service provider','subcontracting opportunities','supplier registration','expansion announcement','website development','video production','data analysis','workflow automation']
];
const lanes=['software','commercial-media','research','software'];
const ref=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function planCommercialSignals({cycle=0,marketLimit=3,now=new Date()}={}){
 if(!Number.isSafeInteger(cycle)||cycle<0||!Number.isInteger(marketLimit)||marketLimit<1||marketLimit>4||!Number.isFinite(+now))throw Error('invalid_commercial_signal_bounds');
 const offset=((cycle%markets.length)*marketLimit)%markets.length;
 const queries=[];
 for(let j=0;j<marketLimit;j++){
  const [country,language,demand,partner,vendor,growth,...terms]=markets[(offset+j)%markets.length];
  const add=(kind,lane,query,priority)=>queries.push({query_ref:'commercial-query:'+ref([country,kind,lane,query]),country,language,kind,lane,query:query+' '+country,priority,source_policy:'first_party_or_official_public_source',required_evidence:['original_source','current_status','organization_identity','specific_purchasing_need','fulfillment_and_regional_eligibility','approved_response_channel','payment_terms','contact_history_and_suppression_review'],qualified:false,contact_authorized:false,execution_authorized:false});
  terms.forEach((term,i)=>add('explicit_service_demand',lanes[i],demand+' '+term,0));
  add('specialist_subcontracting','research',partner,0);
  add('supplier_program','research',vendor,1);
  add('growth_event_hypothesis','research',growth,2);
 }
 return {schema:'evercraft.commercial-signal-plan.v1',observed_at:now.toISOString(),cycle,market_count:markets.length,queries,search_performed:false,qualified_count:0,send_performed:false};
}
