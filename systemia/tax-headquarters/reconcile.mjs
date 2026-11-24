/** Pure, offline, evidence-gated transaction review engine.
 * No bank access, external services, private financial records, or filing capabilities.
 * Signed amounts: positive inflow, negative outflow. All values integer cents.
 */
const KINDS=new Set(['customer_receipt','internal_transfer','owner_contribution','owner_draw','loan_proceeds','refund','business_expense','personal_expense','payroll','tax_payment','unknown']);
function check(x,message){if(!x)throw new TypeError(message)}
function normalize(row){
 check(row&&typeof row==='object'&&!Array.isArray(row),'Invalid row');
 const source=row.source,accountId=row.accountId,transactionId=row.transactionId,date=row.date;
 for(const [name,value] of Object.entries({source,accountId,transactionId}))check(typeof value==='string'&&value.trim(), 'Invalid '+name);
 check(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date,'Invalid date');
 check(Number.isSafeInteger(row.amountCents),'Money must be integer cents');
 check(['posted','pending'].includes(row.status),'Invalid status');
 const kind=row.kind??'unknown';check(KINDS.has(kind),'Invalid kind');
 const evidenceRefs=row.evidenceRefs??[];check(Array.isArray(evidenceRefs)&&evidenceRefs.every(x=>typeof x==='string'&&x.trim()),'Invalid evidence references');
 check(row.businessLine==null||typeof row.businessLine==='string','Invalid business line');
 return {source,accountId,transactionId,date,amountCents:row.amountCents,status:row.status,kind,transferId:row.transferId||null,businessLine:row.businessLine??null,evidenceRefs};
}
const key=r=>JSON.stringify([r.source,r.accountId,r.transactionId]);
export function reconcile(rows){
 check(Array.isArray(rows),'Expected rows array');
 const unique=new Map();let duplicateRowsDropped=0;
 for(const raw of rows){const r=normalize(raw),id=key(r);if(unique.has(id)){check(JSON.stringify(unique.get(id))===JSON.stringify(r),'Conflicting duplicate '+r.transactionId);duplicateRowsDropped++;}else unique.set(id,r);}
 const all=[...unique.values()],posted=all.filter(x=>x.status==='posted'),pending=all.filter(x=>x.status==='pending');
 const groups=new Map();for(const r of posted)if(r.transferId){const group=groups.get(r.transferId)??[];group.push(r);groups.set(r.transferId,group);}
 const verified=new Set(),transferExceptions=[];
 for(const [transferId,g] of groups){
  const matched=g.length===2&&g[0].accountId!==g[1].accountId&&g[0].amountCents===-g[1].amountCents&&g.every(x=>x.kind==='internal_transfer');
  if(matched)g.forEach(r=>verified.add(key(r)));else transferExceptions.push({transferId,reason:'Missing or contradictory transfer counterpart'});
 }
 const queues={unclassified:[],review:[],pending:pending.map(key),transferExceptions};
 let receipts=0,expenses=0;
 for(const r of posted){const id=key(r),hasEvidence=r.evidenceRefs.length>0;
  if(r.kind==='unknown')queues.unclassified.push(id);
  else if(r.kind==='internal_transfer'&&!verified.has(id))queues.review.push({key:id,reason:'Unverified transfer'});
  else if(r.kind!=='internal_transfer'&&!hasEvidence)queues.review.push({key:id,reason:'Missing supporting evidence'});
  if(hasEvidence&&r.kind==='customer_receipt'&&r.amountCents>0&&r.businessLine)receipts+=r.amountCents;
  if(hasEvidence&&r.kind==='business_expense'&&r.amountCents<0&&r.businessLine)expenses-=r.amountCents;
 }
 return {schema:'evercraft.tax.reconciliation.v1',status:'review_only_not_a_tax_return',postedCount:posted.length,pendingCount:pending.length,duplicateRowsDropped,verifiedTransferPairs:verified.size/2,confirmedCategorizedCustomerReceiptsCents:receipts,confirmedCategorizedBusinessExpensesCents:expenses,queues,unverifiedCount:queues.unclassified.length+queues.review.length+transferExceptions.length,coverage:{complete:false,reason:'Verify source/account coverage separately'},taxDueCents:null};
}
