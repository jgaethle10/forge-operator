'use strict';
const byId = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const catalog = [
  ['Evercraft Payments','Payment friction','Scope a checkout or invoice handoff for one existing offer. Check supported settlement before promising it.'],
  ['Work Saban','Recurring office work','Scope one reviewed deliverable and confirm pilot availability.'],
  ['Evercraft Research','An unanswered business decision','Offer a decision brief with source links, findings and evidence gaps.'],
  ['ForensiScope','Long audio or video backlog','Scope transcription and an evidence timeline for one file. Confirm limits and delivery.'],
  ['Fallen Studios / Commercial Studio','A specific campaign or product demo','Founding Commercial · $50 for 30 seconds, pay on approval. Confirm a production slot first.'],
  ['EV site planning and reports','A candidate charging location','Scope a site-screening report for one address. Confirm delivery and inputs.'],
  ['Qualified-lead systems','Low-quality inbound or missed follow-up','Map intake and qualification criteria to one business workflow.'],
  ['Evercraft Property Services','A local property maintenance request','Confirm trade, location, availability and scope before quoting.'],
  ['FindMyPart','A hard-to-source part','Scope a paid part hunt using the part number and fit constraints.'],
  ['Systemia Website Audit','A specific website conversion gap','Quick Win · $49 checkout verified in the Day 1 ledger. Confirm delivery before pitching.'],
  ['Other Evercraft-owned capability','A documented buyer problem','Confirm ownership, delivery readiness and offer scope.']
];
const views = ['Next up','Qualified leads','Known problems','Direct paid work','Product offers','Closed / lost','Offer library'];
const stages = ['New','Researching','Draft ready','Sent','Replied','Negotiating','Won','Lost'];
const closed = r => ['Won','Lost'].includes(r.status);
const qualified = r => Boolean(r.buyer && r.contact && r.permission && r.source && r.verified && r.product && r.relevance);
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Los_Angeles'}).format(new Date());
const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
let rows = [], view = views[0], activeId = null;
async function api(path, body) {
  const response = await fetch('/api/' + path, body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
function notice(message, error = false, target = 'notice') {
  byId(target).textContent = message;
  byId(target).classList.toggle('notice-error', error);
}
function awaitingReply(r) {
  return r.status === 'Sent' && r.sent.length > 0;
}
function next(r) {
  if (closed(r)) return r.outcome || 'Record outcome';
  if (awaitingReply(r)) return r.next_action || 'Check for a reply';
  if (!qualified(r)) return 'Verify evidence, buyer, contact and fit';
  return r.next_action || (r.status === 'Sent' ? 'Set follow-up' : 'Prepare or review the offer');
}
function priority(r) {
  if (closed(r)) return 4;
  if ((qualified(r) || awaitingReply(r)) && r.followup && r.followup <= today()) return 0;
  if (qualified(r) && r.kind === 'Paid work') return 1;
  return qualified(r) ? 2 : 3;
}
function render() {
  const open = rows.filter(r => !closed(r));
  const stats = [[open.filter(qualified).length,'Qualified'],[open.filter(r => priority(r) === 0).length,'Follow-ups due'],[open.filter(r => r.kind === 'Paid work').length,'Direct paid work'],[rows.filter(r => r.status === 'Won').length,'Won']];
  byId('metrics').innerHTML = stats.map(([n,label]) => '<div class="metric"><b>'+n+'</b>'+label+'</div>').join('');
  byId('views').innerHTML = views.map(label => '<button type="button" aria-pressed="'+(label === view)+'">'+label+'</button>').join('');
  byId('toolbar').hidden = view === 'Offer library';
  if (view === 'Offer library') {
    byId('content').innerHTML = '<div class="cards">'+catalog.map(([name,fit,scope],i) => '<article class="card"><h3>'+esc(name)+'</h3><strong>'+esc(fit)+'</strong><p>'+esc(scope)+'</p><button data-product="'+i+'">Start opportunity</button></article>').join('')+'</div>';
    return;
  }
  const match = {
    'Next up': () => true,
    'Qualified leads': qualified,
    'Known problems': r => !qualified(r),
    'Direct paid work': r => r.kind === 'Paid work',
    'Product offers': r => r.kind === 'Product offer',
    'Closed / lost': closed
  };
  const term = byId('search').value.toLowerCase().trim();
  const list = (view === views[5] ? rows : open).filter(r => match[view](r) && [r.business,r.buyer,r.pain,r.product].some(v => v.toLowerCase().includes(term)));
  const order = byId('order').value;
  list.sort((a,b) => (order === 'amount' ? (+b.amount || 0)-(+a.amount || 0) : order === 'priority' ? priority(a)-priority(b) || (a.followup || '9999').localeCompare(b.followup || '9999') : 0) || b.id-a.id);
  byId('content').innerHTML = list.length ? '<div class="scroll"><table><thead><tr><th>Business / buyer</th><th>Pain / offer fit</th><th>Stage / evidence</th><th>Proposed value</th><th>Next action</th></tr></thead><tbody>'+list.map(r => '<tr><td><button data-open="'+r.id+'">'+esc(r.business)+'</button><br>'+esc(r.buyer || 'Buyer unknown')+'</td><td>'+esc(r.pain)+'<br><span class="muted">'+esc(r.product)+'</span></td><td>'+esc(r.status)+'<br><span class="muted">'+(qualified(r)?'Qualified':r.verified?'Evidence verified · qualification pending':'Verification pending')+'</span></td><td>'+(r.amount ? esc(money(+r.amount)) : '—')+'</td><td>'+esc(next(r))+'<br><span class="muted">'+esc(r.followup)+'</span></td></tr>').join('')+'</tbody></table></div>' : '<p class="empty">'+(view === views[0] && !rows.length ? 'Capture a real request or import a Systemia signal to start the pipeline.' : 'No opportunities match this view.')+'</p>';
}
async function refresh() { rows = await api('opportunities'); render(); }
const form = byId('record');
function field(key,label,value,options) {
  const control = Array.isArray(options) ? '<select name="'+key+'">'+options.map(v => '<option'+(v === value?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select>' :
    options === 'textarea' ? '<textarea name="'+key+'">'+esc(value)+'</textarea>' :
    '<input name="'+key+'" type="'+(options || 'text')+'" value="'+esc(value)+'" '+(['business','pain'].includes(key)?'required':'')+(options === 'number'?' min="0" step="0.01"':'')+'>';
  return '<label'+(options === 'textarea'?' class="wide"':'')+'>'+label+control+'</label>';
}
function edit(record = {}) {
  activeId = record.id ?? null;
  byId('editor-title').textContent = record.business || 'New opportunity';
  const f = (key,label,type) => field(key,label,record[key],type);
  const section = (label,fields) => '<fieldset><legend>'+label+'</legend><div class="fields">'+fields+'</div></fieldset>';
  byId('fields').innerHTML =
    section('Buyer and problem',f('business','Business')+f('buyer','Buyer name')+f('role','Role')+f('contact','Contact or reply thread')+f('pain','Pain point')+f('kind','Opportunity type',['Lead','Paid work','Product offer']))+
    section('Evidence and qualification',f('source','Source URL or original message','textarea')+f('verified','Verified evidence and verification date','textarea')+f('signal','Unverified market signal','textarea')+f('assumption','Assumptions to test','textarea')+f('permission','Why this contact path is appropriate')+f('relevance','Specific reason this offer fits this buyer'))+
    section('Offer and outreach',f('product','Evercraft capability',['',...catalog.map(item => item[0])])+f('amount','Proposed value in USD','number')+f('offer','Tailored scope, timing and price','textarea')+f('subject','Subject')+f('draft','Outreach draft','textarea')+'<button type="button" id="draft">Build draft from evidence</button>')+
    section('Progress',f('status','Stage',stages)+f('followup','Next follow-up date','date')+f('next_action','Next action')+f('reply','Replies','textarea')+f('objection','Objections','textarea')+f('outcome','Outcome or loss reason','textarea'));
  notice('',false,'editor-notice');
  byId('history').innerHTML = activeId ? '<h3>Sent history</h3><div id="sent-list">'+record.sent.map(item => '<div class="card"><strong>'+esc(item.recipient)+'</strong> · '+esc(item.channel)+' · '+esc(item.when)+'<br>'+esc(item.subject)+'<pre>'+esc(item.message)+'</pre></div>').join('')+'</div><details><summary>Record a message already sent</summary><form id="sent-form" class="fields">'+field('recipient','Actual recipient',record.contact)+field('channel','Channel','')+field('when','Sent date',today(),'date')+field('subject','Exact subject',record.subject)+field('message','Exact message sent',record.draft,'textarea')+'<button type="submit">Log sent message</button></form></details>' : '';
  if (!byId('editor').open) byId('editor').showModal();
}
byId('new').onclick = () => edit();
byId('close').onclick = () => byId('editor').close();
byId('search').oninput = render;
byId('order').onchange = render;
byId('views').onclick = event => {
  if (event.target.tagName === 'BUTTON') { view = event.target.textContent; render(); }
};
byId('content').onclick = event => {
  const {open,product} = event.target.dataset;
  if (open) edit(rows.find(row => row.id === +open));
  if (product !== undefined) edit({kind:'Product offer',product:catalog[product][0]});
};
byId('fields').onclick = event => {
  if (event.target.id !== 'draft') return;
  const r = Object.fromEntries(new FormData(form));
  if (!qualified(r) || !r.offer || !r.pain || !r.business) {
    notice('Add verified evidence, a named buyer and contact path, buyer-specific fit, and a tailored scope first.',true,'editor-notice');
    return;
  }
  if (r.draft && !window.confirm('Replace this draft with a new one?')) return;
  form.elements.subject.value ||= r.business + ' — ' + r.product;
  form.elements.draft.value = 'Hi '+r.buyer+',\n\n'+r.relevance+'\n\nI can help with '+r.pain+'. Here’s what I’d propose: '+r.offer+'\n\nWould that help with what you’re working on?\n\nJesse\nEvercraft';
  notice('Review the wording against the source and remove any claim you cannot substantiate.',false,'editor-notice');
};
form.onsubmit = async event => {
  event.preventDefault();
  try {
    await api('opportunities',{...Object.fromEntries(new FormData(form)),id:activeId});
    byId('editor').close();
    await refresh();
    notice('Opportunity saved.');
  } catch (error) { notice(error.message,true,byId('editor').open?'editor-notice':'notice'); }
};
byId('history').onsubmit = async event => {
  event.preventDefault();
  try {
    await api('sent',{...Object.fromEntries(new FormData(event.target)),id:activeId});
    await refresh();
    const saved = rows.find(r => r.id === activeId);
    const previousStatus = form.elements.status.value;
    const unsaved = Object.fromEntries(new FormData(form));
    edit({...saved,...unsaved,status:['New','Researching','Draft ready'].includes(previousStatus)?saved.status:previousStatus});
    notice('Sent message recorded.',false,'editor-notice');
  } catch (error) { notice(error.message,true,'editor-notice'); }
};
refresh().catch(error => notice(error.message,true));
setInterval(() => { if (!byId('editor').open) refresh().catch(error => notice(error.message,true)); }, 30000);
