import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity, ArrowRight, BadgeDollarSign, Building2, CheckCircle2, ChevronRight, CircleDollarSign,
  ClipboardList, CreditCard, Download, FilePlus2, FileText, Gauge, GitCompareArrows, Inbox,
  LayoutDashboard, LogOut, MapPin, Menu, RefreshCcw, Search, Settings, ShieldCheck, Sparkles, Store, Users, X, Moon, Sun
} from 'lucide-react';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { QueryClientProvider as Provider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { base44 } from '@/api/base44Client';
import { Toaster } from '@/components/ui/toaster';
import Register from '@/pages/Register';
import ScrollToTop from '@/components/ScrollToTop';
import { jsPDF } from 'jspdf';

const REPORT_TYPES = [
  { value: 'preliminary_site_opportunity', label: 'Preliminary Site Opportunity Report' },
  { value: 'full_site_opportunity', label: 'Full Site Opportunity Report' },
  { value: 'reporting_readiness', label: 'Reporting Readiness Review' },
  { value: 'custom', label: 'Custom Report' },
];

const STATUS_ORDER = ['draft','data_collection','analysis','qa','ready','delivered','archived'];
const STATUS_LABELS = {
  draft: 'Draft',
  data_collection: 'Data collection',
  analysis: 'Analysis',
  qa: 'QA',
  ready: 'Ready',
  delivered: 'Delivered',
  archived: 'Archived',
};
const STATUS_STYLES = {
  draft: 'border-white/10 bg-white/5 text-slate-300',
  data_collection: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
  analysis: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
  qa: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
  ready: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100',
  delivered: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  archived: 'border-slate-500/20 bg-slate-500/10 text-slate-400',
};

const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value||0));
const shortDate = value => {
  if(!value) return 'Not set';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
};
const nowIso = () => new Date().toISOString();
const keyFor = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

function downloadReportPdf(report) {
  const pdf = new jsPDF({ unit:'pt', format:'letter' });
  const margin=48, width=612-(margin*2);
  let y=52;
  const add=(value,size=10,weight='normal',gap=16)=>{
    const text=String(value||'');
    pdf.setFont('helvetica',weight);
    pdf.setFontSize(size);
    const lines=pdf.splitTextToSize(text,width);
    if(y+(lines.length*size*1.3)>744){pdf.addPage();y=52;}
    pdf.text(lines,margin,y);
    y+=Math.max(gap,lines.length*size*1.3+6);
  };
  pdf.setTextColor(11,20,36);pdf.setDrawColor(98,209,52);pdf.setLineWidth(3);pdf.line(margin,36,margin+72,36);pdf.setFont('helvetica','bold');pdf.setFontSize(18);pdf.text('RIVET',margin,y);y+=24;
  add(report.title||'EV Site Report',16,'bold',24);
  add(report.address||'',11,'normal',20);
  add('Decision: '+(report.decision_label||report.verdict||'Pending'),13,'bold',18);
  add(report.decision_body||report.executive_summary||'Report generation is still in progress.',10,'normal',18);
  add('Traffic: '+(report.max_aadt?Number(report.max_aadt).toLocaleString()+' AADT':'Not verified'),11,'bold',16);
  add('Mapped charging context: '+(report.charger_source_status==='ok'?Number(report.charger_count||0).toLocaleString():'Source pending'),10,'normal',18);
  if((report.strongest_points||[]).length){add('Strongest points',11,'bold',14);(report.strongest_points||[]).forEach(x=>add('• '+x,9,'normal',13));}
  if((report.open_questions||[]).length){add('Open questions',11,'bold',14);(report.open_questions||[]).forEach(x=>add('• '+x,9,'normal',13));}
  if(report.report_body){
    add('Full report',12,'bold',16);
    String(report.report_body).split('\n').forEach(line=>add(line||' ',9,'normal',12));
  }
  if((report.aliev_source_refs||report.evidence_refs||[]).length){
    add('Evidence references',11,'bold',14);
    (report.aliev_source_refs||report.evidence_refs||[]).slice(0,20).forEach(x=>add(String(x),8,'normal',11));
  }
  add('Evidence boundary',11,'bold',14);
  add(report.source_notes||'Verified, modeled and unknown evidence states remain separate. This report is a screening decision aid, not engineering or investment approval.',9,'normal',14);
  add('Generated: '+(report.generated_at?shortDate(report.generated_at):'Pending'),8,'normal',12);
  const safe=(report.address||'report').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,60)||'report';
  pdf.save('RIVET-'+safe+'.pdf');
}

function Shell({ children }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('rivet-theme') || 'light'; }
    catch { return 'light'; }
  });
  const location = useLocation();
  useEffect(()=>setMenuOpen(false),[location.pathname]);
  useEffect(()=>{
    const dark = theme === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('rivet-theme', theme); } catch {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0B1424' : '#F5F2EA');
  },[theme]);

  const nav = [
    ['/', 'Home', LayoutDashboard],
    ['/new-report', 'New Report', FilePlus2],
    ['/reports', 'Reports', FileText],
    ['/site-plans', 'Site Plans', ShieldCheck],
    ['/clients', 'Clients', Users],
    ['/payments', 'Payments', CreditCard],
    ['/properties', 'Properties', Store],
    ...(user?.role === 'admin' ? [['/admin', 'Settings', Settings]] : []),
  ];

  return <div className="min-h-[100dvh] w-full max-w-full overflow-x-clip rivet-shell">
    <div className="fixed inset-0 pointer-events-none" />
    <header className="safe-top sticky top-0 z-50 w-full max-w-full border-b border-white/10 rivet-header backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1500px] min-w-0 items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button className="rounded-xl border border-white/10 p-2 text-slate-300 lg:hidden" onClick={()=>setMenuOpen(x=>!x)} aria-label="Open navigation">
            {menuOpen ? <X size={19}/> : <Menu size={19}/>}
          </button>
          <NavLink to="/" className="flex items-center gap-3">
            <div className="rivet-logo-tile grid h-10 w-10 shrink-0 place-items-center"><img src="/rivet-icon.svg" alt="" aria-hidden="true" className="h-10 w-10 object-contain"/></div>
            <div>
              <div className="font-heading text-sm font-bold tracking-[.20em] text-white">RIVET</div>
              <div className="text-[10px] uppercase tracking-[.18em] text-slate-500">EV reporting workspace</div>
            </div>
          </NavLink>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={()=>setTheme(t=>t==='dark'?'light':'dark')}
            className="rivet-theme-toggle grid h-9 w-9 place-items-center rounded-xl transition"
            aria-label={theme==='dark'?'Use light mode':'Use dark mode'}
            title={theme==='dark'?'Use light mode':'Use dark mode'}>
            {theme==='dark'?<Sun size={16}/>:<Moon size={16}/>}
          </button>
          <div className="hidden items-center gap-2 sm:flex">
            <NavLink to="/new-report" className="rounded-xl bg-cyan-300 px-3.5 py-2 text-xs font-bold text-slate-950">New report</NavLink>
            <button onClick={()=>logout()} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-white/20 hover:text-white">
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>

    <div className="relative mx-auto grid w-full max-w-[1500px] min-w-0 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className={`${menuOpen?'block':'hidden'} border-b border-white/10 rivet-sidebar p-4 lg:block lg:min-h-[calc(100dvh-66px)] lg:border-b-0 lg:border-r`}>
        <nav className="space-y-1">
          {nav.map(([to,label,Icon])=><NavLink key={to} to={to} end={to==='/'}
            className={({isActive})=>`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive?'bg-cyan-300/10 text-cyan-100 ring-1 ring-cyan-300/15':'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
            <Icon size={17}/><span>{label}</span>
          </NavLink>)}
        </nav>
        <div className="mt-7 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">Simple flow</div>
          <p className="mt-2 text-xs leading-5 text-slate-400">Customer: address → Stripe → report in RIVET. Team: evidence → QA → living report. PDF stays optional.</p>
        </div>
        <div className="mt-4 text-[11px] leading-5 text-slate-600">
          {user?.email || 'Authenticated workspace'}
        </div>
      </aside>
      <main className="safe-bottom w-full min-w-0 max-w-full overflow-x-clip p-4 pb-8 sm:p-6 sm:pb-10 lg:p-8 lg:pb-12">{children}</main>
    </div>
  </div>
}

function PageHeader({ eyebrow, title, subtitle, action }) {
  return <div className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[.22em] text-cyan-300">{eyebrow}</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{subtitle}</p>}
    </div>
    {action}
  </div>
}

function Card({ children, className='' }) {
  return <div className={`w-full min-w-0 max-w-full rivet-card rounded-2xl border border-white/10 ${className}`}>{children}</div>
}

function EmptyState({ icon:Icon=Inbox, title, body, action }) {
  return <div className="grid min-h-[220px] place-items-center p-8 text-center">
    <div>
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-black/20 text-slate-400"><Icon size={21}/></div>
      <h3 className="mt-4 font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  </div>
}

function Status({ value }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] ${STATUS_STYLES[value]||STATUS_STYLES.draft}`}>{STATUS_LABELS[value]||value}</span>
}

function reportReadinessIssues(report, { forDelivery = false } = {}) {
  const issues = [];
  const siteReport = ['preliminary_site_opportunity','full_site_opportunity'].includes(report?.report_type);
  if (!report?.verdict?.trim()) issues.push('Add a clear verdict.');
  if (!report?.executive_summary?.trim()) issues.push('Add an executive summary.');
  if (siteReport && !report?.traffic_summary?.trim()) issues.push('Add the traffic / demand summary.');
  if (!Array.isArray(report?.evidence_refs) || report.evidence_refs.length === 0) issues.push('Attach at least one evidence or source reference.');
  if (!report?.source_notes?.trim()) issues.push('Document source limitations and evidence-state boundaries.');
  if (forDelivery && !report?.delivery_url?.trim()) issues.push('Add the exact customer-facing delivery URL.');
  return issues;
}

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('RIVET reporting runtime error', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="min-h-[100dvh] w-full overflow-x-clip bg-[#050b14] p-6 text-slate-200 grid place-items-center"><div className="w-full max-w-xl rounded-2xl border border-red-400/20 bg-red-400/[.06] p-6"><div className="text-lg font-semibold text-white">RIVET hit a workspace error.</div><p className="mt-2 text-sm leading-6 text-slate-400">Nothing was intentionally deleted. Reload the page once. If the problem remains, capture the exact screen and route so the team can reproduce it.</p><button onClick={()=>window.location.reload()} className="mt-5 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950">Reload workspace</button></div></div>;
  }
}

function useReportingData() {
  const [clients,setClients]=useState([]);
  const [reports,setReports]=useState([]);
  const [invoices,setInvoices]=useState([]);
  const [purchases,setPurchases]=useState([]);
  const [propertyListings,setPropertyListings]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  const refresh = async () => {
    setLoading(true); setError('');
    try {
      const [c,r,i,p,l] = await Promise.all([
        base44.entities.RIVETClient.list('-updated_at',200),
        base44.entities.RIVETReport.list('-updated_at',300),
        base44.entities.RIVETInvoice.list('-updated_at',300),
        base44.entities.RIVETPurchase.list('-updated_at',300),
        base44.entities.RIVETPropertyListing.list('-updated_at',300),
      ]);
      setClients(c||[]); setReports(r||[]); setInvoices(i||[]); setPurchases(p||[]); setPropertyListings(l||[]);
    } catch(e) {
      setError(e?.message||String(e));
    } finally { setLoading(false); }
  };
  useEffect(()=>{ refresh(); },[]);
  return {clients,reports,invoices,purchases,propertyListings,loading,error,refresh,setClients,setReports,setInvoices,setPurchases,setPropertyListings};
}

const ReportingContext = React.createContext(null);
const useReporting = () => React.useContext(ReportingContext);

function Dashboard() {
  const {clients,reports,invoices,purchases,loading,error,refresh}=useReporting();
  const navigate=useNavigate();
  const activeReports=reports.filter(r=>!['delivered','archived'].includes(r.status));
  const ready=reports.filter(r=>r.status==='ready');
  const failedReports=reports.filter(r=>r.generation_state==='failed');
  const unassignedReports=reports.filter(r=>!r.client_id);
  const paidPurchases=purchases.filter(p=>p.status==='paid');
  const stripeRevenue=paidPurchases.reduce((sum,p)=>sum+Number(p.amount_usd||0),0);
  const unpaid=invoices.filter(i=>['sent','overdue'].includes(i.status));

  return <>
    <PageHeader eyebrow="RIVET" title="Reporting workspace"
      subtitle="Customers move from address to secure Stripe checkout to a living RIVET report. The team keeps evidence, QA and delivery controls behind that clean front door."
      action={<button onClick={refresh} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:text-white"><RefreshCcw size={15}/>Refresh</button>} />
    {error && <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Active reports',activeReports.length,ClipboardList,'In production'],
        ['Ready to deliver',ready.length,CheckCircle2,'Passed reporting QA'],
        ['Active clients',clients.filter(c=>c.status==='active').length,Building2,'Reporting relationships'],
        ['Stripe revenue',money(stripeRevenue),CreditCard,`${paidPurchases.length} verified self-service purchase${paidPurchases.length===1?'':'s'} · ${unpaid.length} manual invoice${unpaid.length===1?'':'s'} open`],
      ].map(([label,value,Icon,sub])=><Card key={label} className="p-5">
        <div className="flex items-center justify-between"><div className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500">{label}</div><Icon size={17} className="text-cyan-300"/></div>
        <div className="mt-4 text-3xl font-semibold text-white">{loading?'…':value}</div>
        <div className="mt-2 text-xs text-slate-500">{sub}</div>
      </Card>)}
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <Card>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div><div className="font-semibold text-white">Recent reports</div><div className="mt-1 text-xs text-slate-500">Customer-facing reporting queue</div></div>
          <button onClick={()=>navigate('/reports')} className="text-xs font-semibold text-cyan-200">View all</button>
        </div>
        {reports.length ? <div className="divide-y divide-white/10">
          {reports.slice(0,6).map(r=><button key={r.id} onClick={()=>navigate('/reports')} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-white/[.025]">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/20 text-cyan-300"><FileText size={17}/></div>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{r.title}</div><div className="mt-1 truncate text-xs text-slate-500">{r.client_name||'Unassigned client'} · {r.address}</div></div>
            <Status value={r.status}/><ChevronRight size={16} className="text-slate-600"/>
          </button>)}
        </div> : <EmptyState icon={FileText} title="No reports yet" body="Create the first reporting job and it will appear here."
          action={<button onClick={()=>navigate('/new-report')} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950">Start a report</button>} />}
      </Card>

      <div className="space-y-5">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles size={16} className="text-cyan-300"/>Start here</div>
          <p className="mt-3 text-sm leading-6 text-slate-400">The default customer path is address → Stripe → report inside RIVET. Manual invoicing remains available only when a relationship needs it.</p>
          <button onClick={()=>navigate('/new-report')} className="mt-5 flex w-full items-center justify-between rounded-xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950">New report <ArrowRight size={17}/></button>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Work today</div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3"><span>Report builds needing retry</span><span className={failedReports.length?'font-bold text-amber-300':'font-bold text-emerald-300'}>{failedReports.length}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Reports without a client</span><span className={unassignedReports.length?'font-bold text-amber-300':'font-bold text-emerald-300'}>{unassignedReports.length}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Verified Stripe purchases</span><span className="font-bold text-white">{paidPurchases.length}</span></div>
          </div>
          <div className="mt-5 grid gap-2">
            <button onClick={()=>navigate('/reports')} className="flex w-full items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200">Work reports <ArrowRight size={16}/></button>
            <button onClick={()=>navigate('/clients')} className="flex w-full items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200">Clients <ArrowRight size={16}/></button>
            <button onClick={()=>navigate('/payments')} className="flex w-full items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200">Payments <ArrowRight size={16}/></button>
          </div>
          <p className="mt-4 text-[11px] leading-5 text-slate-600">This dashboard reflects records actually entered and verified inside RIVET. Sales or commitments made elsewhere do not appear here until they are entered into the workspace.</p>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Today’s QA principle</div>
          <p className="mt-3 text-sm leading-6 text-slate-300">A report is not ready because the source exists. It is ready when the recipient can open the exact deliverable, understand the evidence labels and see the intended result.</p>
        </Card>
      </div>
    </div>
  </>
}

function NewReport() {
  const {clients,refresh}=useReporting();
  const navigate=useNavigate();
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [showMore,setShowMore]=useState(false);
  const [suggestions,setSuggestions]=useState([]);
  const [suggesting,setSuggesting]=useState(false);
  const [suggestOpen,setSuggestOpen]=useState(false);
  const [suggestStatus,setSuggestStatus]=useState('');
  const selectedAddressRef=useRef('');
  const [form,setForm]=useState({
    client_id:'', client_name:'', address:'', report_type:'preliminary_site_opportunity',
    title:'', priority:'normal', due_date:'', owner_name:'', owner_email:'',
    latitude:null, longitude:null, state:'', postal_code:''
  });

  useEffect(()=>{
    const q=form.address.trim();
    if(q.length<3 || q===selectedAddressRef.current){ setSuggestions([]); setSuggestOpen(false); setSuggesting(false); setSuggestStatus(''); return; }
    const timer=setTimeout(async()=>{
      setSuggesting(true);
      try{
        const response=await base44.functions.invoke('addressSuggestions',{q});
        const data=response?.data||response;
        const nextSuggestions=Array.isArray(data?.suggestions)?data.suggestions:[];
        setSuggestions(nextSuggestions);
        setSuggestStatus(data?.status||'');
        setSuggestOpen(nextSuggestions.length>0);
      }catch{
        setSuggestions([]);
        setSuggestStatus('provider_error');
        setSuggestOpen(false);
      }finally{ setSuggesting(false); }
    },260);
    return()=>clearTimeout(timer);
  },[form.address]);

  const chooseAddress=s=>{
    selectedAddressRef.current=s.label;
    setForm(current=>({...current,address:s.label,latitude:Number(s.latitude),longitude:Number(s.longitude),state:s.state||'',postal_code:s.postcode||''}));
    setSuggestions([]);
    setSuggestOpen(false);
    setSuggestStatus('');
  };

  const selectedClient=clients.find(c=>c.id===form.client_id);
  const submit=async e=>{
    e.preventDefault();
    if(!form.address.trim()) return setError('Address or site is required.');
    setSaving(true); setError('');
    try{
      const now=nowIso();
      const typeLabel=REPORT_TYPES.find(x=>x.value===form.report_type)?.label||'RIVET Report';
      const payload={
        report_key:keyFor('rivet-report'),
        client_id:form.client_id||'',
        client_name:selectedClient?.company_name||form.client_name.trim(),
        address:form.address.trim(),
        report_type:form.report_type,
        title:form.title.trim()||`${typeLabel} · ${form.address.trim()}`,
        status:'draft',
        priority:form.priority,
        due_date:form.due_date||'',
        owner_name:form.owner_name.trim(),
        owner_email:form.owner_email.trim(),
        top_drivers:[],
        evidence_refs:[],
        source_notes:'',
        core_work_ref:'',
        payment_status:'not_required',
        customer_visible:false,
        generation_state:'not_started',
        detailed_report_state:'not_requested',
        ...(Number.isFinite(form.latitude)&&Number.isFinite(form.longitude)?{latitude:form.latitude,longitude:form.longitude,state:form.state||'',postal_code:form.postal_code||''}:{}),
        created_at:now,updated_at:now
      };
      const created=await base44.entities.RIVETReport.create({...payload,aliev_source_status:'not_requested',aliev_app_id:'69b9b64d86a732029ce0db81'});
      try{
        const response=await base44.functions.invoke('generateQuickReport',{report_id:created.id});
        const data=response?.data||response;
        if(!data?.ok)throw new Error(data?.error||'Report build failed.');
      }catch{
        await refresh();
        navigate(`/reports/${created.id}`);
        return;
      }
      await refresh();
      navigate(`/reports/${created.id}`);
    }catch(err){setError(err?.message||String(err));}
    finally{setSaving(false);}
  };

  return <>
    <PageHeader eyebrow="Report intake" title="Start a new report"
      subtitle="Enter the site. RIVET builds the report and keeps the answer simple." />
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <Card className="p-5 sm:p-7">
        {error&&<div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</div>}
        <div className="grid gap-5 md:grid-cols-2">
          <div className="relative block min-w-0 md:col-span-2"><label className="block"><span className="mb-2 block text-xs font-semibold text-slate-400">Site / property / address</span><div className="relative"><Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600"/><input value={form.address} onChange={e=>{selectedAddressRef.current='';setSuggestStatus('');setForm({...form,address:e.target.value,latitude:null,longitude:null,state:'',postal_code:''})}} onFocus={()=>form.address.trim().length>=3&&suggestions.length&&setSuggestOpen(true)} autoComplete="off" inputMode="search" placeholder="Start typing a U.S. address or place" className="w-full rounded-xl border border-white/10 bg-black/25 py-3 pl-10 pr-10 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-300/50"/>{suggesting&&<div className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-300"/>}</div></label>{suggestOpen&&suggestions.length>0&&<div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-white/10 rivet-address-menu bg-[#081321] p-1 shadow-2xl">{suggestions.map(s=><button key={s.id} type="button" onClick={()=>chooseAddress(s)} className="block w-full rounded-lg px-3 py-3 text-left hover:bg-white/[.06]"><div className="break-words text-sm font-medium text-slate-100">{s.label}</div><div className="mt-1 text-[10px] uppercase tracking-[.12em] text-slate-600">{[s.city,s.state,s.postcode].filter(Boolean).join(' · ') || 'United States'}</div></button>)}</div>}{!suggesting&&form.address.trim().length>=3&&suggestStatus==='empty'&&<div className="mt-2 text-xs text-slate-500">No verified U.S. suggestion found. You can still enter the address manually.</div>}{!suggesting&&suggestStatus==='provider_error'&&<div className="mt-2 text-xs text-amber-300">Address suggestions are temporarily unavailable. You can still enter the address manually.</div>}</div>
          <label className="block md:col-span-2"><span className="mb-2 block text-xs font-semibold text-slate-400">Client</span><select value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})} className="w-full rounded-xl border border-white/10 bg-[#0e1c2d] px-4 py-3 text-sm outline-none focus:border-cyan-300/50"><option value="">No client yet</option>{clients.filter(c=>c.status!=='archived').map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}</select></label>
          <div className="md:col-span-2"><button type="button" onClick={()=>setShowMore(x=>!x)} className="text-xs font-semibold text-slate-500 hover:text-cyan-200">{showMore?'Hide advanced options':'+ Advanced options'}</button></div>
          {showMore&&<>
            <label className="block md:col-span-2"><span className="mb-2 block text-xs font-semibold text-slate-400">Report type</span><select value={form.report_type} onChange={e=>setForm({...form,report_type:e.target.value})} className="w-full rounded-xl border border-white/10 bg-[#0e1c2d] px-4 py-3 text-sm outline-none focus:border-cyan-300/50">{REPORT_TYPES.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
            <label className="block md:col-span-2"><span className="mb-2 block text-xs font-semibold text-slate-400">Report title</span><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Auto-generated if left blank" className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-300/50"/></label>
            <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-400">Priority</span><select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})} className="w-full rounded-xl border border-white/10 bg-[#0e1c2d] px-4 py-3 text-sm outline-none"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
            <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-400">Due date</span><input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none"/></label>
            <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-400">Owner</span><input value={form.owner_name} onChange={e=>setForm({...form,owner_name:e.target.value})} placeholder="Team owner" className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none placeholder:text-slate-600"/></label>
            <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-400">Owner email</span><input type="email" value={form.owner_email} onChange={e=>setForm({...form,owner_email:e.target.value})} placeholder="owner@company.com" className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none placeholder:text-slate-600"/></label>
          </>}
        </div>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={()=>navigate('/reports')} className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300">Cancel</button>
          <button disabled={saving} className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{saving?'Building report…':'Build report'}</button>
        </div>
      </Card>
      <div className="space-y-5">
        <Card className="p-5"><div className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Workflow</div><div className="mt-4 space-y-3">{['Address','Build report','Review','Deliver'].map((x,i)=><div key={x} className="flex items-center gap-3 text-sm text-slate-300"><div className="grid h-6 w-6 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/[.06] text-[10px] font-bold text-cyan-200">{i+1}</div>{x}</div>)}</div></Card>
        <Card className="p-5"><div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-300" size={18}/><p className="text-xs leading-5 text-slate-400">RIVET shows the decision, the strongest reasons and the traffic first. Anything deeper stays out of the way unless you need it.</p></div></Card>
      </div>
    </form>
  </>
}

function Reports() {
  const {reports,refresh}=useReporting();
  const navigate=useNavigate();
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('all');
  const [busy,setBusy]=useState('');
  const filtered=useMemo(()=>reports.filter(r=>{
    const hay=`${r.title} ${r.address} ${r.client_name}`.toLowerCase();
    return hay.includes(query.toLowerCase()) && (status==='all'||r.status===status);
  }),[reports,query,status]);

  const generate=async report=>{
    setBusy(report.id);
    try{
      const response=await base44.functions.invoke('generateQuickReport',{report_id:report.id});
      const data=response?.data||response;
      if(!data?.ok)throw new Error(data?.error||'Report generation failed.');
      await refresh();
      navigate(`/reports/${report.id}`);
    }catch(err){
      window.alert(err?.message||String(err));
    }finally{setBusy('');}
  };

  return <>
    <PageHeader eyebrow="Production queue" title="Reports"
      subtitle="Everything the reporting company is actively assembling, reviewing or delivering."
      action={<NavLink to="/new-report" className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950"><FilePlus2 size={16}/>New report</NavLink>} />
    <Card>
      <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row">
        <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search reports, clients or addresses" className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-300/40"/></div>
        <select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-xl border border-white/10 bg-[#0e1c2d] px-3 py-2.5 text-sm text-slate-300"><option value="all">All statuses</option>{STATUS_ORDER.map(x=><option key={x} value={x}>{STATUS_LABELS[x]}</option>)}</select>
      </div>
      {filtered.length?<div className="divide-y divide-white/10">{filtered.map(r=><div key={r.id} className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">{r.generation_state==='ready'?<span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[.12em] ${r.decision_tone==='green'?'border-emerald-400/25 bg-emerald-400/10 text-emerald-200':r.decision_tone==='amber'?'border-amber-400/25 bg-amber-400/10 text-amber-200':'border-blue-400/25 bg-blue-400/10 text-blue-200'}`}>{r.decision_label||'Quick report ready'}</span>:<span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">{r.generation_state==='failed'?'Report needs retry':'Report not generated'}</span>}{r.priority!=='normal'&&<span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-orange-200">{r.priority}</span>}</div>
            <button onClick={()=>navigate(`/reports/${r.id}`)} className="mt-3 text-left text-lg font-semibold text-white hover:text-cyan-100">{r.title}</button>
            <div className="mt-1 text-sm text-slate-500">{r.client_name||'Unassigned client'} · {r.address}</div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500"><span>Created {shortDate(r.created_at)}</span><span>Due {shortDate(r.due_date)}</span>{r.owner_name&&<span>Owner {r.owner_name}</span>}</div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {r.generation_state==='ready'?<button onClick={()=>navigate(`/reports/${r.id}`)} className="rounded-xl bg-blue-500 px-3.5 py-2.5 text-xs font-bold text-white">Open report</button>:<button disabled={busy===r.id} onClick={()=>generate(r)} className="rounded-xl bg-blue-500 px-3.5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy===r.id?'Building…':r.generation_state==='failed'?'Retry report':'Generate report'}</button>}
            {r.generation_state==='ready'&&<button disabled={busy===r.id} onClick={()=>generate(r)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 disabled:opacity-50">Refresh data</button>}
          </div>
        </div>
        {(r.verdict||r.executive_summary||r.traffic_summary)&&<div className="mt-4 grid gap-3 md:grid-cols-3">
          {r.verdict&&<div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Verdict</div><div className="mt-2 text-sm text-white">{r.verdict}</div></div>}
          {r.executive_summary&&<div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Summary</div><div className="mt-2 line-clamp-3 text-sm text-slate-300">{r.executive_summary}</div></div>}
          {r.traffic_summary&&<div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Traffic</div><div className="mt-2 line-clamp-3 text-sm text-slate-300">{r.traffic_summary}</div></div>}
        </div>}
      </div>)}</div>:<EmptyState icon={FileText} title="No matching reports" body="Create a reporting job or change the filters."/>}
    </Card>
  </>
}

function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { reports, clients, refresh } = useReporting();
  const report = reports.find(r => r.id === id);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!report) return;
    setForm({
      title: report.title || '',
      client_id: report.client_id || '',
      address: report.address || '',
      report_type: report.report_type || 'preliminary_site_opportunity',
      status: report.status || 'draft',
      priority: report.priority || 'normal',
      due_date: report.due_date || '',
      owner_name: report.owner_name || '',
      owner_email: report.owner_email || '',
      verdict: report.verdict || '',
      executive_summary: report.executive_summary || '',
      traffic_summary: report.traffic_summary || '',
      top_drivers: (report.top_drivers || []).join('\n'),
      evidence_refs: (report.evidence_refs || []).join('\n'),
      source_notes: report.source_notes || '',
      report_body: report.report_body || '',
      core_work_ref: report.core_work_ref || '',
      delivery_url: report.delivery_url || '',
    });
  }, [report?.id, report?.updated_at]);

  if (!report || !form) return <>
    <PageHeader eyebrow="Report editor" title="Loading report" subtitle="The report record may still be loading from the reporting ledger." />
    <Card><EmptyState icon={FileText} title="Report not available yet" body="Return to the report queue and open it again." action={<button onClick={()=>navigate('/reports')} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300">Back to reports</button>} /></Card>
  </>;

  const selectedClient = clients.find(c => c.id === form.client_id);
  const save = async e => {
    e.preventDefault();
    setError('');
    setNotice('');
    const proposed = {...report, title:form.title, client_id:form.client_id, report_type:form.report_type, status:form.status, priority:form.priority, due_date:form.due_date, owner_name:form.owner_name, owner_email:form.owner_email, core_work_ref:form.core_work_ref, delivery_url:form.delivery_url};
    const currentIndex = STATUS_ORDER.indexOf(report.status);
    const proposedIndex = STATUS_ORDER.indexOf(form.status);
    if (proposedIndex > currentIndex + 1) { setError('Advance the report one stage at a time so QA cannot be skipped.'); return; }
    if (form.status === 'ready') {
      const issues = reportReadinessIssues(proposed);
      if (issues.length) { setError(`Ready is blocked: ${issues.join(' ')}`); return; }
    }
    if (form.status === 'delivered') {
      if (report.status !== 'ready') { setError('A report must be Ready before it can be marked Delivered.'); return; }
      const issues = reportReadinessIssues(proposed,{forDelivery:true});
      if (issues.length) { setError(`Delivery is blocked: ${issues.join(' ')}`); return; }
    }
    setSaving(true);
    try {
      await base44.entities.RIVETReport.update(report.id, {
        title: form.title.trim() || report.title,
        client_id: form.client_id || '',
        client_name: selectedClient?.company_name || '',
        address: report.address,
        report_type: form.report_type,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || '',
        owner_name: form.owner_name.trim(),
        owner_email: form.owner_email.trim(),
        core_work_ref: form.core_work_ref.trim(),
        delivery_url: form.delivery_url.trim(),
        updated_at: nowIso(),
        ...(form.status === 'delivered' && !report.delivered_at ? { delivered_at: nowIso() } : {})
      });
      await refresh();
      setNotice('Report saved.');
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-300/50";
  let trafficPoints=[];
  try{const parsed=JSON.parse(report.traffic_points_json||'[]');trafficPoints=Array.isArray(parsed)?parsed:[]}catch{}
  const regenerate=async()=>{
    setSaving(true);setError('');setNotice('');
    try{
      const response=await base44.functions.invoke('generateQuickReport',{report_id:report.id});
      const data=response?.data||response;
      if(!data?.ok)throw new Error(data?.error||'Report generation failed.');
      await refresh();
      setNotice('Quick report refreshed with current source data.');
    }catch(err){setError(err?.message||String(err));}
    finally{setSaving(false);}
  };
  const decisionTone=report.decision_tone==='green'
    ? 'border-emerald-400/25 bg-emerald-400/[.07] text-emerald-100'
    : report.decision_tone==='amber'
      ? 'border-amber-400/25 bg-amber-400/[.07] text-amber-100'
      : 'border-blue-400/25 bg-blue-400/[.07] text-blue-100';

  return <>
    <PageHeader eyebrow="EV Site Report" title={report.title}
      subtitle={report.address}
      action={<div className="flex flex-wrap gap-2">{report.generation_state==='ready'&&<button onClick={()=>downloadReportPdf(report)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950"><Download size={15}/>Download PDF</button>}<button onClick={()=>navigate('/reports')} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300">Back to reports</button></div>} />

    {report.generation_state!=='ready'?<Card className="mb-5 p-6 sm:p-8">
      <div className="text-xs font-bold uppercase tracking-[.18em] text-blue-400">Report not built yet</div>
      <h2 className="mt-2 text-2xl font-semibold text-white">Turn this address into the actual report.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">RIVET checks this exact site and builds the report. If something cannot be verified, it stays unknown instead of being filled with sample data.</p>
      {report.generation_state==='failed'&&<div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm leading-6 text-red-100"><div className="font-bold">Last build failed</div><div className="mt-1 text-red-200/80">{report.source_notes||'The source engine did not complete this report. Retry after the blocker is resolved.'}</div></div>}
      <button disabled={saving} onClick={regenerate} className="mt-5 rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving?'Building report…':report.generation_state==='failed'?'Retry report build':'Build report'}</button>
    </Card>:<>
      <Card className={`mb-5 overflow-hidden ${decisionTone}`}>
        <div className="p-6 sm:p-8">
          <div className="text-[10px] font-black uppercase tracking-[.22em] opacity-70">Quick answer</div>
          <div className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{report.decision_label||report.verdict}</div>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">{report.decision_body||report.executive_summary}</p>
          <div className="mt-6 text-xs text-slate-500">Screening decision only. A “yes” means the site earned the next step, not final investment or engineering approval.</div>
        </div>
      </Card>

      <Card className="mb-5 p-6">
        <div className="text-xs font-black uppercase tracking-[.18em] text-blue-400">Why this site</div>
        <div className="mt-4 space-y-3">{(report.strongest_points||report.top_drivers||[]).length?(report.strongest_points||report.top_drivers||[]).slice(0,4).map((x,i)=><div key={i} className="flex gap-3 text-sm leading-6 text-slate-200"><CheckCircle2 size={18} className="mt-1 shrink-0 text-emerald-400"/><span>{x}</span></div>):<div className="text-sm text-slate-500">RIVET has not verified a strong reason to move this site forward yet.</div>}</div>
      </Card>

      <Card className="mb-5 overflow-hidden">
        <div className="border-b border-white/10 p-5 sm:p-6">
          <div className="text-xs font-black uppercase tracking-[.18em] text-blue-400">Traffic</div>
          <div className="mt-2 text-3xl font-black text-white sm:text-4xl">{report.max_aadt?Number(report.max_aadt).toLocaleString()+' AADT':'Traffic not verified'}</div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{report.traffic_summary||'RIVET did not receive a verified traffic count for this site.'}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">AADT is annual average daily traffic. It is not live congestion, footfall or charging sessions.</p>
        </div>
        {trafficPoints.length?<div className="divide-y divide-white/10">{trafficPoints.slice(0,8).map((row,i)=><div key={row.source_id||i} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <div className="min-w-0"><div className="text-sm font-semibold text-white">{[row.route,row.location].filter(Boolean).join(' · ')||'Traffic count point'}</div><div className="mt-1 text-xs text-slate-600">{row.distance_miles!=null?row.distance_miles+' mi from site · ':''}{row.source||report.traffic_source_name}</div></div>
          <div className="text-left sm:text-right"><div className="text-[10px] uppercase tracking-wider text-slate-600">AADT</div><div className="text-lg font-black text-blue-400">{Number(row.aadt||0).toLocaleString()}</div></div>
          <div className="text-left sm:text-right"><div className="text-[10px] uppercase tracking-wider text-slate-600">Year</div><div className="text-sm font-semibold text-slate-300">{row.reporting_year||'—'}</div></div>
        </div>)}</div>:<div className="p-6 text-sm text-slate-500">No verified traffic count was returned for this screening radius. RIVET keeps that as unknown rather than inventing a number.</div>}
      </Card>

      <details className="mb-5 rounded-2xl border border-white/10 bg-white/[.02]">
        <summary className="cursor-pointer list-none p-5 text-sm font-bold text-slate-300">More detail <span className="ml-2 text-xs font-normal text-slate-600">Optional</span></summary>
        <div className="space-y-5 border-t border-white/10 p-5 sm:p-6">
          {!!(report.open_questions||[]).length&&<div>
            <div className="text-xs font-black uppercase tracking-[.18em] text-[#ff9d2e]">What still needs verification</div>
            <div className="mt-3 space-y-3">{report.open_questions.slice(0,5).map((x,i)=><div key={i} className="flex gap-3 text-sm leading-6 text-slate-400"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#ff9d2e]"/><span>{x}</span></div>)}</div>
          </div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-[.12em] text-slate-600">Nearby public charging</div><div className="mt-1 text-sm font-semibold text-slate-300">{report.charger_source_status==='ok'?Number(report.charger_count||0).toLocaleString()+' mapped locations':'Not verified'}</div></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-[.12em] text-slate-600">Last generated</div><div className="mt-1 text-sm font-semibold text-slate-300">{report.generated_at?shortDate(report.generated_at):'Not generated'}</div><button disabled={saving} onClick={regenerate} className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-blue-400 disabled:opacity-50"><RefreshCcw size={13}/>{saving?'Refreshing…':'Refresh data'}</button></div>
          </div>
          {report.report_body&&<div><div className="text-xs font-black uppercase tracking-[.18em] text-slate-500">Report notes</div><div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-400">{report.report_body}</div></div>}
          <div><div className="text-xs font-black uppercase tracking-[.18em] text-slate-500">Evidence trail</div><div className="mt-3 space-y-2">{(report.aliev_source_refs||report.evidence_refs||[]).length?(report.aliev_source_refs||report.evidence_refs||[]).slice(0,20).map((ref,i)=><div key={i} className="break-all rounded-lg border border-white/10 bg-black/20 p-2.5 text-[11px] leading-5 text-blue-300">{ref}</div>):<div className="text-sm text-slate-500">No source URL was returned for this evidence slice.</div>}</div>{report.source_notes&&<div className="mt-4 text-xs leading-5 text-slate-600">{report.source_notes}</div>}</div>
        </div>
      </details>
    </>}

    <details className="rounded-2xl border border-white/10 bg-white/[.02]">
      <summary className="cursor-pointer list-none p-5 text-sm font-bold text-slate-300">Report controls <span className="ml-2 text-xs font-normal text-slate-600">Internal workflow and delivery</span></summary>
      <div className="border-t border-white/10 p-4 sm:p-5">
    <form onSubmit={save} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        {(error || notice) && <div className={`rounded-xl border p-3 text-sm ${error ? 'border-red-400/20 bg-red-400/10 text-red-200' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'}`}>{error || notice}</div>}
        <Card className="p-5 sm:p-7">
          <div className="mb-5 text-sm font-semibold text-white">Report identity</div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2"><span className="mb-2 block text-xs font-semibold text-slate-400">Title</span><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} className={inputClass}/></label>
            <label className="md:col-span-2"><span className="mb-2 block text-xs font-semibold text-slate-400">Site / address</span><input value={report.address||''} readOnly className={inputClass+" cursor-not-allowed opacity-70"}/></label>
            <label><span className="mb-2 block text-xs font-semibold text-slate-400">Client</span><select value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})} className="w-full rounded-xl border border-white/10 bg-[#0e1c2d] px-4 py-3 text-sm"><option value="">Unassigned</option>{clients.filter(c=>c.status!=='archived').map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}</select></label>
            <label><span className="mb-2 block text-xs font-semibold text-slate-400">Report type</span><select value={form.report_type} onChange={e=>setForm({...form,report_type:e.target.value})} className="w-full rounded-xl border border-white/10 bg-[#0e1c2d] px-4 py-3 text-sm">{REPORT_TYPES.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
            <label><span className="mb-2 block text-xs font-semibold text-slate-400">Status</span><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="w-full rounded-xl border border-white/10 bg-[#0e1c2d] px-4 py-3 text-sm">{STATUS_ORDER.map(x=><option key={x} value={x}>{STATUS_LABELS[x]}</option>)}</select></label>
            <label><span className="mb-2 block text-xs font-semibold text-slate-400">Priority</span><select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})} className="w-full rounded-xl border border-white/10 bg-[#0e1c2d] px-4 py-3 text-sm"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
            <label><span className="mb-2 block text-xs font-semibold text-slate-400">Owner</span><input value={form.owner_name} onChange={e=>setForm({...form,owner_name:e.target.value})} className={inputClass}/></label>
            <label><span className="mb-2 block text-xs font-semibold text-slate-400">Owner email</span><input value={form.owner_email} onChange={e=>setForm({...form,owner_email:e.target.value})} className={inputClass}/></label>
            <label><span className="mb-2 block text-xs font-semibold text-slate-400">Due date</span><input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} className={inputClass}/></label>
            <label><span className="mb-2 block text-xs font-semibold text-slate-400">Internal reference</span><input value={form.core_work_ref} onChange={e=>setForm({...form,core_work_ref:e.target.value})} placeholder="Optional job or source reference" className={inputClass}/></label>
          </div>
        </Card>

        <Card className="p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3"><div className="text-sm font-semibold text-white">Source evidence</div><span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[.12em] text-blue-200">{report.aliev_source_status||'not requested'}</span></div>
          <p className="mt-3 text-xs leading-5 text-slate-500">Decision, strongest points, traffic and evidence references are generated from verified source data. They are not manual template fields.</p>
          <div className="mt-5 grid gap-4">
            <div><div className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-600">Evidence state</div><div className="mt-1 text-sm text-slate-300">{report.aliev_evidence_state||'Not returned'}</div></div>
            <div><div className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-600">Last source retrieval</div><div className="mt-1 text-sm text-slate-300">{report.aliev_retrieved_at||'Not returned'}</div></div>
            <div><div className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-600">Evidence references</div><div className="mt-2 space-y-2">{(report.aliev_source_refs||report.evidence_refs||[]).length?(report.aliev_source_refs||report.evidence_refs||[]).map((ref,i)=><div key={i} className="break-all text-xs text-blue-300">{ref}</div>):<div className="text-xs text-slate-600">No source URL was returned for this evidence slice.</div>}</div></div>
          </div>
        </Card>

        <Card className="p-5 sm:p-7">
          <div className="mb-5 text-sm font-semibold text-white">Delivery controls</div>
          <div className="space-y-4">
            <label><span className="mb-2 block text-xs font-semibold text-slate-400">Internal reference</span><input value={form.core_work_ref} onChange={e=>setForm({...form,core_work_ref:e.target.value})} className={inputClass}/></label>
            <label><span className="mb-2 block text-xs font-semibold text-slate-400">Delivery URL</span><input value={form.delivery_url} onChange={e=>setForm({...form,delivery_url:e.target.value})} className={inputClass}/></label>
          </div>
        </Card>

        <div className="flex justify-end"><button disabled={saving} className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{saving?'Saving…':'Save report'}</button></div>
      </div>

      <div className="space-y-5">
        <Card className="p-5">
          <div className="flex items-center justify-between"><Status value={form.status}/><span className="text-xs text-slate-500">{shortDate(report.updated_at)}</span></div>
          <div className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-slate-500">10/10 recipient check</div>
          <div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
            <div>• Exact deliverable opens for the recipient.</div>
            <div>• Verdict, top drivers and traffic are understandable first.</div>
            <div>• Evidence and uncertainty labels survive the final format.</div>
            <div>• Mobile and desktop both render correctly.</div>
            <div>• Delivery link is the customer-facing asset, not an internal preview.</div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Release standard</div>
          <p className="mt-3 text-xs leading-5 text-slate-400">Keep every customer-facing statement tied to evidence, limitations, and the exact approved delivery asset.</p>
        </Card>
      </div>
    </form>
      </div>
    </details>
  </>;
}

function Clients() {
  const {clients,reports,refresh}=useReporting();
  const [open,setOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({company_name:'',contact_name:'',contact_email:'',contact_phone:'',billing_email:'',notes:''});
  const create=async e=>{
    e.preventDefault(); if(!form.company_name.trim())return;
    setSaving(true);
    try{const now=nowIso();await base44.entities.RIVETClient.create({client_key:keyFor('rivet-client'),...form,company_name:form.company_name.trim(),status:'active',created_at:now,updated_at:now});setForm({company_name:'',contact_name:'',contact_email:'',contact_phone:'',billing_email:'',notes:''});setOpen(false);await refresh();}finally{setSaving(false);}
  };
  return <>
    <PageHeader eyebrow="Relationships" title="Clients" subtitle="Customer records, contacts and report activity for the reporting company."
      action={<button onClick={()=>setOpen(true)} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950">Add client</button>} />
    {open&&<Card className="mb-5 p-5"><form onSubmit={create}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <input required value={form.company_name} onChange={e=>setForm({...form,company_name:e.target.value})} placeholder="Company name" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/>
      <input value={form.contact_name} onChange={e=>setForm({...form,contact_name:e.target.value})} placeholder="Contact name" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/>
      <input type="email" value={form.contact_email} onChange={e=>setForm({...form,contact_email:e.target.value})} placeholder="Contact email" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/>
      <input value={form.contact_phone} onChange={e=>setForm({...form,contact_phone:e.target.value})} placeholder="Phone" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/>
      <input type="email" value={form.billing_email} onChange={e=>setForm({...form,billing_email:e.target.value})} placeholder="Billing email" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/>
      <input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Notes" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/>
    </div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={()=>setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300">Cancel</button><button disabled={saving} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950">{saving?'Saving…':'Save client'}</button></div></form></Card>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {clients.map(c=>{const count=reports.filter(r=>r.client_id===c.id).length;return <Card key={c.id} className="p-5"><div className="flex items-start justify-between gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-black/20 text-cyan-300"><Building2 size={18}/></div><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-emerald-200">{c.status}</span></div><h3 className="mt-4 text-lg font-semibold text-white">{c.company_name}</h3><div className="mt-2 text-sm text-slate-500">{c.contact_name||'No contact name'}{c.contact_email?` · ${c.contact_email}`:''}</div><div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-500"><span>{count} report{count===1?'':'s'}</span><span>Updated {shortDate(c.updated_at)}</span></div></Card>})}
      {!clients.length&&<div className="md:col-span-2 xl:col-span-3"><Card><EmptyState icon={Users} title="No clients yet" body="Add the first customer relationship for the reporting company." action={<button onClick={()=>setOpen(true)} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950">Add client</button>}/></Card></div>}
    </div>
  </>
}

function Payments() {
  const {clients,reports,invoices,purchases,refresh}=useReporting();
  const [open,setOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [form,setForm]=useState({client_id:'',report_id:'',description:'RIVET reporting services',amount_usd:'',payment_link:'',due_at:''});
  const create=async e=>{
    e.preventDefault();
    setError('');
    const amount=Number(form.amount_usd);
    if(!form.client_id){setError('Choose the client this reporting invoice belongs to.');return;}
    if(!Number.isFinite(amount)||amount<=0){setError('Enter an invoice amount greater than $0.');return;}
    const client=clients.find(c=>c.id===form.client_id); const report=reports.find(r=>r.id===form.report_id);
    setSaving(true);
    try{const now=nowIso();await base44.entities.RIVETInvoice.create({
      invoice_key:keyFor('rivet-invoice'),client_id:client?.id||'',client_name:client?.company_name||'',
      report_id:report?.id||'',report_key:report?.report_key||'',description:form.description.trim()||'RIVET reporting services',
      amount_usd:amount,currency:'USD',status:'draft',payment_link:form.payment_link.trim(),issued_at:'',due_at:form.due_at?new Date(form.due_at+'T12:00:00').toISOString():'',
      notes:'',created_at:now,updated_at:now
    });setOpen(false);setForm({client_id:'',report_id:'',description:'RIVET reporting services',amount_usd:'',payment_link:'',due_at:''});await refresh();}catch(err){setError(err?.message||String(err));}finally{setSaving(false);}
  };
  const setInvoiceStatus=async(invoice,status)=>{
    setBusy(invoice.id);setError('');
    try{
      const patch={status,updated_at:nowIso()};
      if(status==='sent'&&!invoice.issued_at)patch.issued_at=nowIso();
      if(status==='paid'&&!invoice.paid_at)patch.paid_at=nowIso();
      await base44.entities.RIVETInvoice.update(invoice.id,patch);
      await refresh();
    }catch(err){setError(err?.message||String(err));}
    finally{setBusy('');}
  };
  const stripePaid=purchases.filter(p=>p.status==='paid');
  const stripePending=purchases.filter(p=>p.status==='pending');
  const stripePaidTotal=stripePaid.reduce((s,p)=>s+Number(p.amount_usd||0),0);
  const totalPaid=invoices.filter(i=>i.status==='paid').reduce((s,i)=>s+Number(i.amount_usd||0),0);
  const totalOpen=invoices.filter(i=>['sent','overdue'].includes(i.status)).reduce((s,i)=>s+Number(i.amount_usd||0),0);

  return <>
    <PageHeader eyebrow="Commerce" title="Payments" subtitle="Stripe checkout is the default customer path. Manual invoices stay here as a secondary option for negotiated or enterprise work."
      action={<button onClick={()=>setOpen(true)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300">Manual invoice</button>} />
    <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="p-5"><div className="text-xs uppercase tracking-[.14em] text-slate-500">Stripe verified</div><div className="mt-3 text-2xl font-semibold text-white">{money(stripePaidTotal)}</div><div className="mt-1 text-xs text-slate-500">{stripePaid.length} paid checkout{stripePaid.length===1?'':'s'}</div></Card>
      <Card className="p-5"><div className="text-xs uppercase tracking-[.14em] text-slate-500">Stripe pending</div><div className="mt-3 text-2xl font-semibold text-white">{stripePending.length}</div><div className="mt-1 text-xs text-slate-500">No access until payment verifies</div></Card>
      <Card className="p-5"><div className="text-xs uppercase tracking-[.14em] text-slate-500">Manual paid</div><div className="mt-3 text-2xl font-semibold text-white">{money(totalPaid)}</div></Card>
      <Card className="p-5"><div className="text-xs uppercase tracking-[.14em] text-slate-500">Manual open</div><div className="mt-3 text-2xl font-semibold text-white">{money(totalOpen)}</div></Card>
    </div>
    <Card className="mb-5">
      <div className="border-b border-white/10 px-5 py-4"><div className="font-semibold text-white">Stripe report purchases</div><div className="mt-1 text-xs text-slate-500">Authoritative customer checkout ledger. A browser return never marks a report paid.</div></div>
      {purchases.length?<div className="divide-y divide-white/10">{purchases.map(p=><div key={p.id} className="grid gap-2 p-5 md:grid-cols-[1fr_auto_auto] md:items-center"><div className="min-w-0"><div className="truncate text-sm font-semibold text-white">{p.requested_address||p.offer_name}</div><div className="mt-1 truncate text-xs text-slate-500">{p.buyer_email||'Email pending'} · {p.purchase_key}</div></div><div className="text-sm font-semibold text-white">{money(p.amount_usd)}</div><span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] ${p.status==='paid'?'border-emerald-400/20 bg-emerald-400/10 text-emerald-200':p.status==='pending'?'border-amber-400/20 bg-amber-400/10 text-amber-200':'border-white/10 bg-white/5 text-slate-300'}`}>{p.status}</span></div>)}</div>:<EmptyState icon={CreditCard} title="No Stripe purchases yet" body="Self-service report purchases will appear here after customers start checkout."/>}
    </Card>
    {error&&<div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}
    {open&&<Card className="mb-5 p-5"><form onSubmit={create} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <select required value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})} className="rounded-xl border border-white/10 bg-[#0e1c2d] px-4 py-3 text-sm"><option value="">Choose client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}</select>
      <select value={form.report_id} onChange={e=>setForm({...form,report_id:e.target.value})} className="rounded-xl border border-white/10 bg-[#0e1c2d] px-4 py-3 text-sm"><option value="">Report (optional)</option>{reports.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select>
      <input required type="number" step="0.01" min="0" value={form.amount_usd} onChange={e=>setForm({...form,amount_usd:e.target.value})} placeholder="Amount USD" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/>
      <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Description" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/>
      <input value={form.payment_link} onChange={e=>setForm({...form,payment_link:e.target.value})} placeholder="Payment link (optional)" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/>
      <input type="date" value={form.due_at} onChange={e=>setForm({...form,due_at:e.target.value})} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/>
      <div className="md:col-span-2 xl:col-span-3 flex justify-end gap-2"><button type="button" onClick={()=>setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300">Cancel</button><button disabled={saving} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950">{saving?'Saving…':'Create draft invoice'}</button></div>
    </form></Card>}
    <Card>
      {invoices.length?<div className="divide-y divide-white/10">{invoices.map(i=><div key={i.id} className="flex flex-col gap-3 p-5 md:flex-row md:items-center">
        <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-white">{i.description}</div><div className="mt-1 text-xs text-slate-500">{i.client_name||'No client assigned'}{i.report_key?` · ${i.report_key}`:''}{i.due_at?` · Due ${shortDate(i.due_at)}`:''}</div></div>
        <div className="text-lg font-semibold text-white">{money(i.amount_usd)}</div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-slate-300">{i.status}</span>
        <div className="flex flex-wrap gap-2">
          {i.status==='draft'&&<button disabled={busy===i.id} onClick={()=>setInvoiceStatus(i,'sent')} className="rounded-lg border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-50">Mark sent</button>}
          {['sent','overdue'].includes(i.status)&&<button disabled={busy===i.id} onClick={()=>setInvoiceStatus(i,'paid')} className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">Mark paid</button>}
          {!['paid','void'].includes(i.status)&&<button disabled={busy===i.id} onClick={()=>setInvoiceStatus(i,'void')} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 disabled:opacity-50">Void</button>}
        </div>
      </div>)}</div>:<EmptyState icon={CircleDollarSign} title="No invoices yet" body="Create billing only for the reporting services this company actually uses."/>}
    </Card>
  </>
}


function Properties() {
  const {propertyListings,reports,refresh}=useReporting();
  const [open,setOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [form,setForm]=useState({broker_name:'',broker_email:'',broker_company:'',property_address:'',property_name:'',source_url:'',report_id:'',customer_notes:''});
  const create=async e=>{
    e.preventDefault();setError('');
    if(!form.property_address.trim()){setError('Property address is required.');return;}
    const report=reports.find(r=>r.id===form.report_id);
    setSaving(true);
    try{
      const now=nowIso();
      await base44.entities.RIVETPropertyListing.create({
        listing_key:keyFor('rivet-property'),broker_name:form.broker_name.trim(),broker_email:form.broker_email.trim().toLowerCase(),
        broker_company:form.broker_company.trim(),property_address:form.property_address.trim(),property_name:form.property_name.trim(),
        source_url:form.source_url.trim(),report_id:report?.id||'',report_key:report?.report_key||'',
        qualification_status:report?.generation_state==='ready'?'screening':'submitted',marketplace_status:'not_listed',
        ev_summary:report?.decision_body||'',customer_notes:form.customer_notes.trim(),internal_notes:'',
        created_at:now,updated_at:now
      });
      setOpen(false);setForm({broker_name:'',broker_email:'',broker_company:'',property_address:'',property_name:'',source_url:'',report_id:'',customer_notes:''});
      await refresh();
    }catch(err){setError(err?.message||String(err));}finally{setSaving(false);}
  };
  const patch=async(listing,fields)=>{
    setError('');
    try{await base44.entities.RIVETPropertyListing.update(listing.id,{...fields,updated_at:nowIso()});await refresh();}
    catch(err){setError(err?.message||String(err));}
  };
  return <>
    <PageHeader eyebrow="Commercial property lane" title="Properties"
      subtitle="A separate broker and owner channel built on RIVET reports. Property submission does not imply EV suitability, and marketplace visibility stays gated behind an explicit qualification state."
      action={<button onClick={()=>setOpen(true)} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950">Add property</button>} />
    {error&&<div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}
    {open&&<Card className="mb-5 p-5"><form onSubmit={create} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <input required value={form.property_address} onChange={e=>setForm({...form,property_address:e.target.value})} placeholder="Commercial property address" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none xl:col-span-2"/>
      <input value={form.property_name} onChange={e=>setForm({...form,property_name:e.target.value})} placeholder="Property name (optional)" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/>
      <input value={form.broker_name} onChange={e=>setForm({...form,broker_name:e.target.value})} placeholder="Broker / owner name" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/>
      <input type="email" value={form.broker_email} onChange={e=>setForm({...form,broker_email:e.target.value})} placeholder="Broker email" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/>
      <input value={form.broker_company} onChange={e=>setForm({...form,broker_company:e.target.value})} placeholder="Brokerage / company" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/>
      <select value={form.report_id} onChange={e=>setForm({...form,report_id:e.target.value})} className="rounded-xl border border-white/10 bg-[#0e1c2d] px-4 py-3 text-sm md:col-span-2"><option value="">Link a RIVET report later</option>{reports.map(r=><option key={r.id} value={r.id}>{r.address}</option>)}</select>
      <input value={form.source_url} onChange={e=>setForm({...form,source_url:e.target.value})} placeholder="Listing source URL (optional)" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/>
      <textarea value={form.customer_notes} onChange={e=>setForm({...form,customer_notes:e.target.value})} placeholder="Broker / owner notes" className="min-h-24 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none md:col-span-2 xl:col-span-3"/>
      <div className="md:col-span-2 xl:col-span-3 flex justify-end gap-2"><button type="button" onClick={()=>setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300">Cancel</button><button disabled={saving} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">{saving?'Saving…':'Add property'}</button></div>
    </form></Card>}
    <div className="grid gap-4 xl:grid-cols-2">
      {propertyListings.map(l=><Card key={l.id} className="p-5">
        <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2 text-xs uppercase tracking-[.14em] text-slate-500"><MapPin size={14}/>{l.broker_company||'Commercial property'}</div><h3 className="mt-2 truncate text-lg font-semibold text-white">{l.property_name||l.property_address}</h3><div className="mt-1 text-sm text-slate-500">{l.property_address}</div></div><span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-slate-300">{l.qualification_status}</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-500">Qualification<select value={l.qualification_status} onChange={e=>patch(l,{qualification_status:e.target.value})} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0e1c2d] px-3 py-2.5 text-sm text-slate-200"><option value="submitted">Submitted</option><option value="screening">Screening</option><option value="qualified">Qualified</option><option value="not_qualified">Not qualified</option><option value="held">Held</option></select></label><label className="text-xs text-slate-500">Marketplace<select value={l.marketplace_status} onChange={e=>patch(l,{marketplace_status:e.target.value})} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0e1c2d] px-3 py-2.5 text-sm text-slate-200"><option value="not_listed">Not listed</option><option value="candidate">Candidate</option><option value="published" disabled={l.qualification_status!=='qualified'}>Published</option><option value="paused">Paused</option></select></label></div>
        <div className="mt-4 border-t border-white/10 pt-4 text-xs leading-5 text-slate-500">{l.report_key?'Linked report: '+l.report_key:'No report linked yet. Property remains a candidate until RIVET evidence is attached.'}</div>
      </Card>)}
      {!propertyListings.length&&<div className="xl:col-span-2"><Card><EmptyState icon={Store} title="No commercial properties yet" body="Broker and owner submissions can live here without turning the core reporting product into a generic property marketplace."/></Card></div>}
    </div>
  </>;
}

function Admin() {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Card><EmptyState icon={ShieldCheck} title="Admin access only" body="This area contains workspace configuration controls." /></Card>;
  return <>
    <PageHeader eyebrow="Workspace" title="Settings" subtitle="RIVET reporting workspace access and release controls." />
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><Gauge size={18}/></div><div><div className="font-semibold text-white">Reporting workspace</div><div className="mt-1 text-xs text-slate-500">Intake through delivery</div></div></div>
        <div className="mt-5 space-y-3 text-sm text-slate-300">{['New Report','Reports','Clients','Payments','Properties','Evidence + QA gate'].map(x=><div key={x} className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-300"/>{x}</div>)}</div>
      </Card>
      <Card className="p-6">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-black/20 text-slate-300"><Users size={18}/></div><div><div className="font-semibold text-white">Owner access</div><div className="mt-1 text-xs text-slate-500">Six approved RIVET owner accounts</div></div></div>
        <div className="mt-5 flex items-center gap-2 text-sm text-slate-300"><CheckCircle2 size={15} className="text-emerald-300"/>Owner allowlist is enforced before reporting data loads.</div>
      </Card>
    </div>
    <Card className="mt-5 p-6">
      <div className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Release gate</div>
      <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">Owner controls remain separated from the customer portal. Release requires mobile and desktop smoke tests across account creation, address availability, Stripe return verification, report generation, PDF export, comparison, manual payments and property qualification.</p>
    </Card>
  </>
}


function CustomerPortal() {
  const {user,logout}=useAuth();
  const [reports,setReports]=useState([]);
  const [purchases,setPurchases]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [address,setAddress]=useState('');
  const [suggestions,setSuggestions]=useState([]);
  const [availability,setAvailability]=useState(null);
  const [activeReportId,setActiveReportId]=useState('');
  const [compareIds,setCompareIds]=useState([]);

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const [r,p]=await Promise.all([
        base44.entities.RIVETReport.list('-updated_at',100),
        base44.entities.RIVETPurchase.list('-updated_at',100)
      ]);
      setReports(r||[]);setPurchases(p||[]);
    }catch(err){setError(err?.message||String(err));}
    finally{setLoading(false);}
  };
  useEffect(()=>{load();},[]);

  useEffect(()=>{
    const q=address.trim();
    setAvailability(null);
    if(q.length<3){setSuggestions([]);return;}
    const timer=setTimeout(async()=>{
      try{
        const response=await base44.functions.invoke('addressSuggestions',{q});
        const data=response?.data||response;
        setSuggestions((data?.suggestions||[]).slice(0,6));
      }catch{setSuggestions([]);}
    },260);
    return()=>clearTimeout(timer);
  },[address]);

  const finishPaidReturn=async(purchaseKey,sessionId)=>{
    setBusy('payment');setError('');setNotice('Confirming Stripe payment…');
    try{
      const response=await base44.functions.invoke('verifyReportCheckout',{purchase_key:purchaseKey,stripe_session_id:sessionId});
      const data=response?.data||response;
      if(data?.payment_verified!==true){
        setNotice('Stripe is still confirming the payment. Nothing is lost. Refresh this page in a moment to retry.');
        return;
      }
      setNotice('Payment verified. Building your RIVET report now…');
      if(data.report_id){
        const generated=await base44.functions.invoke('generateQuickReport',{report_id:data.report_id});
        const result=generated?.data||generated;
        if(!result?.ok)throw new Error(result?.error||'Report generation did not complete.');
        setActiveReportId(data.report_id);
      }
      await load();
      window.history.replaceState({},'',window.location.pathname);
      setNotice('Your report is ready and now lives in RIVET. PDF is available as an export.');
    }catch(err){setError(err?.message||String(err));setNotice('');}
    finally{
      setBusy('');
    }
  };

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const payment=params.get('payment');
    const purchaseKey=params.get('purchase_key');
    const sessionId=params.get('stripe_session_id');
    if(payment==='broker_processing'&&purchaseKey&&sessionId)finishPaidReturn(purchaseKey,sessionId);
    else if(payment==='cancelled'){setNotice('Checkout was cancelled. No report access was granted and you can start again whenever you are ready.');window.history.replaceState({},'',window.location.pathname);}
  },[]);

  const checkAvailability=async()=>{
    const q=address.trim();if(!q)return;
    setBusy('availability');setError('');setAvailability(null);
    try{
      const response=await base44.functions.invoke('reportAvailability',{address:q});
      const data=response?.data||response;
      setAvailability(data);
      if(data?.matched_address)setAddress(data.matched_address);
    }catch(err){setError(err?.message||String(err));}
    finally{setBusy('');}
  };

  const checkout=async()=>{
    if(!availability?.available)return;
    setBusy('checkout');setError('');
    try{
      const response=await base44.functions.invoke('createReportCheckout',{
        requested_address:availability.matched_address||address.trim(),
        return_origin:window.location.origin,
        landing_path:window.location.pathname,
        referrer:document.referrer||''
      });
      const data=response?.data||response;
      if(!data?.checkout_url)throw new Error(data?.error||'Stripe checkout could not be created.');
      window.location.assign(data.checkout_url);
    }catch(err){setError(err?.message||String(err));setBusy('');}
  };

  const regenerate=async(report)=>{
    setBusy(report.id);setError('');
    try{await base44.functions.invoke('generateQuickReport',{report_id:report.id});await load();}
    catch(err){setError(err?.message||String(err));}
    finally{setBusy('');}
  };

  const toggleCompare=id=>setCompareIds(current=>current.includes(id)?current.filter(x=>x!==id):(current.length<10?[...current,id]:current));
  const compareReports=reports.filter(r=>compareIds.includes(r.id));
  const active=reports.find(r=>r.id===activeReportId)||null;
  const readyReports=reports.filter(r=>r.generation_state==='ready');

  return <div className="min-h-[100dvh] bg-[#050b14] text-slate-200">
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07101c]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <img src="/luma-rivet.png" alt="RIVET" className="h-10 w-10 rounded-xl bg-white object-cover"/>
        <div className="min-w-0 flex-1"><div className="font-black tracking-[.18em] text-white">RIVET</div><div className="truncate text-[11px] text-slate-500">EV reporting portal · {user?.email}</div></div>
        <button onClick={()=>logout()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white"><LogOut size={14}/>Sign out</button>
      </div>
    </header>
    <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:py-10">
      <div className="mb-7 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <Card className="p-6 sm:p-7">
          <div className="text-[11px] font-bold uppercase tracking-[.18em] text-[#ff9d2e]">Start a report</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">One address. One clean answer.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Enter a commercial site address. RIVET confirms reporting availability before checkout. After Stripe verifies payment, the report is generated into this dashboard and stays here.</p>
          <div className="relative mt-6">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1"><MapPin className="absolute left-4 top-3.5 text-slate-500" size={17}/><input value={address} onChange={e=>setAddress(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();checkAvailability();}}} placeholder="Enter a property address" className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-cyan-300/40"/></div>
              <button disabled={busy==='availability'||address.trim().length<5} onClick={checkAvailability} className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{busy==='availability'?'Checking…':'Check report'}</button>
            </div>
            {!!suggestions.length&&<div className="absolute left-0 right-0 top-[54px] z-20 overflow-hidden rounded-xl border border-white/10 bg-[#0b1726] shadow-2xl">{suggestions.map(s=><button key={s.id||s.label} onClick={()=>{setAddress(s.label);setSuggestions([]);setAvailability(null);}} className="block w-full border-b border-white/5 px-4 py-3 text-left text-sm text-slate-300 last:border-0 hover:bg-white/5">{s.label}</button>)}</div>}
          </div>
          {availability&&<div className={"mt-4 rounded-2xl border p-4 "+(availability.available?'border-emerald-400/20 bg-emerald-400/[.07]':'border-amber-400/20 bg-amber-400/[.07]')}>
            <div className="flex items-start gap-3">{availability.available?<CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={18}/>:<Activity className="mt-0.5 shrink-0 text-amber-300" size={18}/>}<div className="min-w-0 flex-1"><div className="font-semibold text-white">{availability.available?'RIVET report available':'Coverage not confirmed'}</div><div className="mt-1 text-sm leading-6 text-slate-400">{availability.reason}</div>{availability.matched_address&&<div className="mt-2 text-xs text-slate-500">{availability.matched_address}</div>}</div></div>
            {availability.available&&<div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-2xl font-semibold text-white">{money(availability.price_usd||495)}</div><div className="text-xs text-slate-500">Single-site RIVET report · secure Stripe checkout</div></div><button disabled={busy==='checkout'} onClick={checkout} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"><CreditCard size={16}/>{busy==='checkout'?'Opening Stripe…':'Continue to Stripe'}</button></div>}
          </div>}
        </Card>
        <Card className="p-6">
          <div className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">How delivery works</div>
          <div className="mt-5 space-y-4">{[
            ['1','Address','RIVET confirms that the reporting workflow can resolve the site.'],
            ['2','Stripe','Payment is verified server-side before report access is created.'],
            ['3','Living report','The report stays in your RIVET account instead of disappearing into an email attachment.'],
            ['4','PDF export','Download a snapshot when you need to share or archive it.']
          ].map(([n,t,b])=><div key={n} className="flex gap-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-xs font-bold text-cyan-200">{n}</div><div><div className="text-sm font-semibold text-white">{t}</div><div className="mt-1 text-xs leading-5 text-slate-500">{b}</div></div></div>)}</div>
        </Card>
      </div>

      {notice&&<div className="mb-5 rounded-xl border border-cyan-300/20 bg-cyan-300/[.07] p-4 text-sm text-cyan-100">{notice}</div>}
      {error&&<div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Your workspace</div><h2 className="mt-1 text-2xl font-semibold text-white">My reports</h2></div><button onClick={load} className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400"><RefreshCcw size={14}/>Refresh</button></div>
      {loading?<Card className="p-7 text-sm text-slate-500">Loading your RIVET reports…</Card>:reports.length?<div className="grid gap-4 lg:grid-cols-2">{reports.map(r=><Card key={r.id} className="p-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-semibold text-white">{r.address}</div><div className="mt-1 text-xs text-slate-500">{r.generation_state==='ready'?'Generated '+shortDate(r.generated_at):r.generation_state==='failed'?'Generation needs attention':'Report is being prepared'}</div></div><Status value={r.status}/></div>
        {r.generation_state==='ready'?<><div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">Decision</div><div className="mt-2 text-xl font-semibold text-white">{r.decision_label||r.verdict||'Ready'}</div><p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-400">{r.decision_body||r.executive_summary}</p></div><div className="mt-3 rounded-xl border border-white/10 p-3"><div className="text-[10px] uppercase tracking-[.12em] text-slate-500">Traffic</div><div className="mt-1 text-lg font-semibold text-white">{r.max_aadt?Number(r.max_aadt).toLocaleString()+' AADT':'Not verified'}</div></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>setActiveReportId(r.id)} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-bold text-slate-950">Open report</button><button onClick={()=>downloadReportPdf(r)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-300"><Download size={14}/>PDF</button>{readyReports.length>=2&&<button onClick={()=>toggleCompare(r.id)} disabled={!compareIds.includes(r.id)&&compareIds.length>=10} className={"inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold "+(compareIds.includes(r.id)?'border-cyan-300/30 bg-cyan-300/10 text-cyan-100':'border-white/10 text-slate-400')}><GitCompareArrows size={14}/>{compareIds.includes(r.id)?'Selected':'Compare'}</button>}</div></>:<div className="mt-5"><button disabled={busy===r.id||r.payment_status!=='paid'} onClick={()=>regenerate(r)} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-50">{busy===r.id?'Building…':'Build report'}</button></div>}
      </Card>)}</div>:<Card><EmptyState icon={FileText} title="No reports yet" body="Start with an address above. Your purchased reports will stay here after Stripe verifies payment."/></Card>}

      {readyReports.length>=2&&<Card className="mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 font-semibold text-white"><GitCompareArrows size={17} className="text-cyan-300"/>Compare locations</div><div className="mt-1 text-xs text-slate-500">Choose 2 to 10 completed reports.</div></div><div className="text-xs font-semibold text-slate-500">{compareIds.length}/10 selected</div></div>
        {compareReports.length<2?<div className="p-6 text-sm text-slate-500">Select at least two reports above to compare them.</div>:<div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{compareReports.map(r=><div key={r.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="text-sm font-semibold leading-6 text-white">{r.address}</div><div className="mt-3 text-[10px] uppercase tracking-[.12em] text-slate-600">Decision</div><div className="mt-1 text-sm font-bold text-slate-200">{r.decision_label||'Pending'}</div><div className="mt-3 text-[10px] uppercase tracking-[.12em] text-slate-600">Traffic</div><div className="mt-1 text-lg font-black text-cyan-300">{r.max_aadt?Number(r.max_aadt).toLocaleString()+' AADT':'Unknown'}</div></div>)}</div>}
      </Card>}

      {active&&<div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"><div className="mx-auto my-6 max-w-4xl rounded-3xl border border-white/10 bg-[#0b1726] shadow-2xl"><div className="flex items-start gap-4 border-b border-white/10 p-5"><div className="min-w-0 flex-1"><div className="text-xs uppercase tracking-[.15em] text-cyan-300">RIVET report</div><h2 className="mt-2 text-xl font-semibold text-white">{active.address}</h2><div className="mt-1 text-xs text-slate-500">Generated {shortDate(active.generated_at)}</div></div><button onClick={()=>setActiveReportId('')} className="rounded-xl border border-white/10 p-2 text-slate-400"><X size={17}/></button></div><div className="space-y-5 p-5 sm:p-7">
        <div><div className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Decision</div><div className="mt-2 text-3xl font-semibold text-white">{active.decision_label||active.verdict}</div><p className="mt-3 text-sm leading-6 text-slate-300">{active.decision_body||active.executive_summary}</p></div>
        {!!(active.strongest_points||[]).length&&<div><div className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Why this site</div><div className="mt-3 space-y-2">{active.strongest_points.slice(0,4).map((x,i)=><div key={i} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-300">{x}</div>)}</div></div>}
        <div className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="text-xs font-bold uppercase tracking-[.14em] text-cyan-300">Traffic</div><div className="mt-2 text-2xl font-black text-white">{active.max_aadt?Number(active.max_aadt).toLocaleString()+' AADT':'Not verified'}</div><p className="mt-2 text-sm leading-6 text-slate-400">{active.traffic_summary||'No verified traffic summary was returned.'}</p></div>
        <details className="rounded-xl border border-white/10 bg-black/10"><summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-400">More detail <span className="ml-2 text-xs font-normal text-slate-600">Optional</span></summary><div className="space-y-4 border-t border-white/10 p-4">{!!(active.open_questions||[]).length&&<div><div className="text-xs font-bold uppercase tracking-[.14em] text-slate-600">What still needs verification</div><div className="mt-3 space-y-2">{active.open_questions.slice(0,5).map((x,i)=><div key={i} className="rounded-xl border border-amber-400/10 bg-amber-400/[.04] p-3 text-sm leading-6 text-slate-300">{x}</div>)}</div></div>}<div><div className="text-xs font-bold uppercase tracking-[.14em] text-slate-600">Evidence boundary</div><p className="mt-2 text-xs leading-6 text-slate-500">{active.source_notes}</p></div></div></details>
        <div className="flex justify-end"><button onClick={()=>downloadReportPdf(active)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950"><Download size={15}/>Download PDF</button></div>
      </div></div></div>}
    </main>
  </div>;
}


function decodeRivetBase64(value) {
  const raw=atob(String(value||''));
  const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes;
}

async function verifyRivetArtifact(bytes, expected) {
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const actual=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(expected&&actual!==String(expected).toLowerCase())throw new Error(`Artifact hash mismatch: ${actual.slice(0,12)} != ${String(expected).slice(0,12)}`);
  return actual;
}

function SitePlans() {
  const location=useLocation();
  const navigate=useNavigate();
  const [plans,setPlans]=useState([]);
  const [loading,setLoading]=useState(true);
  const [opening,setOpening]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [active,setActive]=useState(null);

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const raw=await base44.functions.invoke('rivetSitePlanBridge',{action:'list'});
      const data=raw?.data||raw;
      if(!data?.ok)throw new Error(data?.error||'Site-plan intake could not be read.');
      setPlans(data.artifacts||[]);
    }catch(e){setError(e?.message||String(e))}
    finally{setLoading(false)}
  };

  useEffect(()=>{load()},[]);

  const closeActive=()=>{
    if(active?.url?.startsWith('blob:'))URL.revokeObjectURL(active.url);
    setActive(null);
    const params=new URLSearchParams(location.search);
    if(params.has('artifact')){params.delete('artifact');navigate({pathname:'/site-plans',search:params.toString()?('?'+params.toString()):''},{replace:true})}
  };

  const openPlan=async artifactKey=>{
    if(!artifactKey||opening)return;
    setOpening(artifactKey);setError('');setNotice('');
    try{
      const raw=await base44.functions.invoke('rivetSitePlanBridge',{action:'get',artifact_key:artifactKey});
      const data=raw?.data||raw;
      if(!data?.ok)throw new Error(data?.error||'Site plan could not be opened.');
      const artifact=data.artifact||{};
      const chunks=[...(data.chunks||[])].sort((a,b)=>Number(a.chunk_index)-Number(b.chunk_index));
      if(!chunks.length||chunks.length!==Number(artifact.chunk_count||0))throw new Error('Site-plan transport is incomplete.');
      let total=0;
      const parts=chunks.map((chunk,index)=>{
        if(Number(chunk.chunk_index)!==index)throw new Error(`Site-plan chunk sequence mismatch at ${index}.`);
        const bytes=decodeRivetBase64(chunk.data_base64);
        total+=bytes.length;
        return bytes;
      });
      const bytes=new Uint8Array(total);
      let offset=0;
      for(const part of parts){bytes.set(part,offset);offset+=part.length}
      await verifyRivetArtifact(bytes,artifact.source_sha256);
      if(active?.url?.startsWith('blob:'))URL.revokeObjectURL(active.url);
      const url=URL.createObjectURL(new Blob([bytes],{type:artifact.mime_type||'application/octet-stream'}));
      setActive({artifact,url});
      const params=new URLSearchParams(location.search);
      params.set('artifact',artifactKey);
      navigate({pathname:'/site-plans',search:'?'+params.toString()},{replace:true});
    }catch(e){setError(e?.message||String(e))}
    finally{setOpening('')}
  };

  useEffect(()=>{
    if(loading||active||opening||!plans.length)return;
    const key=new URLSearchParams(location.search).get('artifact')||'';
    if(key&&plans.some(x=>x.artifact_key===key))openPlan(key);
  },[loading,plans.length,location.search]);

  const copyLink=async plan=>{
    const url=new URL(window.location.origin+'/site-plans');
    url.searchParams.set('artifact',plan.artifact_key);
    try{await navigator.clipboard.writeText(url.toString());setNotice('Exact RIVET team link copied. It opens this site plan after RIVET authentication.')}
    catch(e){setError('Could not copy the RIVET team link.')}
  };

  return <>
    <PageHeader eyebrow="RIVET · team scope" title="Site Plans"
      subtitle="Hash-verified engineering artifacts handed into RIVET. These plans stay inside the RIVET owner workspace and do not expose upstream product navigation or customer access."
      action={<button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300"><RefreshCcw size={15}/>Refresh</button>} />
    {notice&&<div className="mb-5 rounded-xl border border-cyan-300/20 bg-cyan-300/[.07] p-4 text-sm text-cyan-100">{notice}</div>}
    {error&&<div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}
    <Card className="mb-5 p-5">
      <div className="flex items-start gap-3"><ShieldCheck size={19} className="mt-0.5 shrink-0 text-emerald-300"/><div><div className="font-semibold text-white">RIVET owns the team copy after handoff</div><p className="mt-1 text-sm leading-6 text-slate-400">The engineering source remains upstream. RIVET stores an exact byte-for-byte copy bound to the source SHA-256, then verifies that hash again every time a plan opens.</p></div></div>
    </Card>
    {loading?<Card className="p-7 text-sm text-slate-500">Loading RIVET site plans…</Card>:plans.length?<div className="grid gap-4 lg:grid-cols-2">{plans.map(plan=><Card key={plan.artifact_key} className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#ff9d2e]">{plan.site_id||'Site plan'} · engineering handoff</div><div className="mt-2 text-lg font-semibold leading-7 text-white">{plan.address||plan.title||plan.site_id}</div><div className="mt-1 text-xs text-slate-500">Rev {plan.revision||'—'} · {String(plan.evidence_status||'unknown').replaceAll('_',' ')}</div></div>
        <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-300/[.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200">{plan.artifact_state||'ready'}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] uppercase tracking-wider text-slate-600">Exact SHA</div><div className="mt-1 break-all font-mono text-[10px] text-cyan-200">{String(plan.source_sha256||'').slice(0,12)}…</div></div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] uppercase tracking-wider text-slate-600">Imported</div><div className="mt-1 text-slate-300">{shortDate(plan.imported_at)}</div></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={opening===plan.artifact_key} onClick={()=>openPlan(plan.artifact_key)} className="rounded-xl bg-[#1479ff] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{opening===plan.artifact_key?'Verifying…':'Open site plan'}</button>
        <button onClick={()=>copyLink(plan)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-300">Copy team link</button>
      </div>
    </Card>)}</div>:<Card><EmptyState icon={FileText} title="No site plans in RIVET yet" body="Use Send to RIVET from the engineering site-plan workspace. The exact artifact will appear here after its source hash verifies."/></Card>}

    {active&&<div className="fixed inset-0 z-[80] overflow-y-auto bg-black/85 p-3 backdrop-blur-sm sm:p-5"><div className="mx-auto my-3 max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-[#0b1726] shadow-2xl">
      <div className="flex items-start gap-4 border-b border-white/10 p-5">
        <img src="/luma-rivet.png" alt="RIVET" className="h-11 w-11 rounded-xl bg-white object-cover"/>
        <div className="min-w-0 flex-1"><div className="text-[10px] font-black uppercase tracking-[.18em] text-[#ff9d2e]">RIVET SITE PLAN · HASH VERIFIED</div><div className="mt-1 text-xl font-semibold text-white">{active.artifact.address||active.artifact.site_id}</div><div className="mt-1 text-xs text-slate-500">{active.artifact.site_id} · Rev {active.artifact.revision||'—'} · {String(active.artifact.source_sha256||'').slice(0,12)}…</div></div>
        <button onClick={closeActive} className="rounded-xl border border-white/10 p-2 text-slate-400"><X size={18}/></button>
      </div>
      <div className="bg-white">{String(active.artifact.mime_type||'').startsWith('image/')?<img src={active.url} alt={active.artifact.title||'RIVET site plan'} className="block h-auto w-full"/>:<iframe src={active.url} title={active.artifact.title||'RIVET site plan'} className="h-[82vh] w-full"/>}</div>
      <div className="flex flex-col gap-2 border-t border-white/10 p-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>Internal RIVET team artifact · customer_visible false</span><span>Engineering source · exact bytes reverified on open</span></div>
    </div></div>}
  </>;
}

function ReportingApp() {
  const data=useReportingData();
  return <ReportingContext.Provider value={data}><Shell>{data.error&&<div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">Reporting data could not sync: {data.error}. Reload once; if it repeats, capture this exact screen.</div>}<Routes>
    <Route path="/" element={<Dashboard/>}/>
    <Route path="/new-report" element={<NewReport/>}/>
    <Route path="/reports" element={<Reports/>}/>
    <Route path="/reports/:id" element={<ReportDetail/>}/>
    <Route path="/site-plans" element={<SitePlans/>}/>
    <Route path="/clients" element={<Clients/>}/>
    <Route path="/payments" element={<Payments/>}/>
    <Route path="/billing" element={<Payments/>}/>
    <Route path="/properties" element={<Properties/>}/>
    <Route path="/admin" element={<Admin/>}/>
    <Route path="*" element={<Dashboard/>}/>
  </Routes></Shell></ReportingContext.Provider>
}

function RIVETPublic() {
  const useCases = [
    ['Commercial property screening','Evaluate whether a specific commercial address merits deeper EV charging diligence.'],
    ['Traffic + charging context','Bring source-backed site traffic and nearby public charging context into one screening report.'],
    ['Multi-site comparison','Compare 2 to 10 completed RIVET reports when choosing among candidate properties.'],
    ['Broker + owner workflow','Screen owned or listed commercial properties before committing to deeper engineering or financial diligence.'],
  ];
  return <div className="min-h-[100dvh] bg-[#050b14] text-slate-200">
    <header className="border-b border-white/10 bg-[#07101c]/95">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
        <img src="/luma-rivet.png" alt="RIVET" className="h-11 w-11 rounded-xl bg-white object-cover"/>
        <div className="min-w-0 flex-1"><div className="font-black tracking-[.2em] text-white">RIVET</div><div className="text-[11px] uppercase tracking-[.14em] text-slate-500">EV site reporting</div></div>
        <a href="/" className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/[.04]">Sign in</a>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-20">
      <section className="grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
        <div>
          <div className="text-xs font-black uppercase tracking-[.18em] text-[#ff9d2e]">Commercial EV site screening</div>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">Turn an address into an evidence-backed EV site report.</h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-slate-400">RIVET helps commercial property teams screen candidate sites for EV charging infrastructure. Enter an address, confirm report coverage, pay securely, and keep the completed report in a living workspace instead of losing the answer inside an email attachment.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="/register?returnTo=%2F" className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950">Create account</a>
            <a href="/llms.txt" className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300">LLM guide</a>
          </div>
        </div>
        <Card className="p-6 sm:p-7">
          <div className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Single-site report</div>
          <div className="mt-3 text-4xl font-semibold text-white">$495</div>
          <div className="mt-1 text-sm text-slate-500">USD · secure Stripe checkout</div>
          <div className="mt-6 space-y-3 text-sm leading-6 text-slate-300">
            <div>Address coverage check before purchase</div>
            <div>Evidence-backed EV site screening report</div>
            <div>Living report retained in the customer workspace</div>
            <div>Optional PDF export</div>
            <div>2 to 10 location comparison after multiple reports are completed</div>
          </div>
        </Card>
      </section>
      <section className="mt-12 grid gap-4 md:grid-cols-2">
        {useCases.map(([title,body])=><Card key={title} className="p-6"><div className="text-lg font-semibold text-white">{title}</div><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></Card>)}
      </section>
      <section className="mt-12 rounded-3xl border border-white/10 bg-[#0b1726] p-6 sm:p-8">
        <div className="text-xs font-bold uppercase tracking-[.16em] text-cyan-300">How RIVET works</div>
        <div className="mt-5 grid gap-4 md:grid-cols-5">{['Address','Coverage check','Stripe','Living report','Compare / PDF'].map((x,i)=><div key={x} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-600">0{i+1}</div><div className="mt-2 text-sm font-semibold text-white">{x}</div></div>)}</div>
        <p className="mt-6 text-xs leading-6 text-slate-500">RIVET is a screening and reporting product. It does not replace final engineering, utility interconnection studies, permitting, underwriting, legal diligence, or investment approval.</p>
      </section>
      <section className="mt-10 text-sm leading-7 text-slate-500">
        <div className="font-semibold text-slate-300">Machine-readable product information</div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2"><a className="text-cyan-300" href="/llms.txt">llms.txt</a><a className="text-cyan-300" href="/llms-full.txt">llms-full.txt</a><a className="text-cyan-300" href="/rivet-agent.json">rivet-agent.json</a></div>
      </section>
    </main>
  </div>;
}

function RIVETSignIn({ message = 'Sign in to buy, open and compare your RIVET reports. Owner accounts continue into the reporting workspace.' }) {
  const signIn = () => {
    try {
      window.localStorage.removeItem('base44_access_token');
      window.localStorage.removeItem('token');
    } catch {}
    const fromUrl = encodeURIComponent(window.location.href);
    window.location.href = `https://app.base44.com/api/apps/auth/login?app_id=6ab2062323d5c33c7dde7606&from_url=${fromUrl}`;
  };

  return <div className="fixed inset-0 grid place-items-center overflow-hidden bg-[#050b14] p-6 text-center text-slate-200">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(20,121,255,.16),transparent_26%),radial-gradient(circle_at_70%_72%,rgba(255,157,46,.055),transparent_22%)]"/>
    <div className="relative w-full max-w-sm rounded-[28px] border border-white/10 bg-[#0b1726]/95 p-7 shadow-[0_30px_90px_rgba(0,0,0,.45)]">
      <img src="/luma-rivet.png" alt="Luma, RIVET" className="mx-auto h-28 w-28 rounded-[26px] bg-white object-cover shadow-[0_18px_50px_rgba(20,121,255,.28)]"/>
      <div className="mt-5 text-xl font-black tracking-[.24em] text-white">RIVET</div>
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-[.16em] text-[#ff9d2e]">EV reporting workspace</div>
      <p className="mt-5 text-sm leading-6 text-slate-400">{message}</p>
      <button onClick={signIn} className="mt-6 w-full rounded-2xl bg-[#1479ff] px-5 py-3.5 text-sm font-bold text-white shadow-[0_14px_34px_rgba(20,121,255,.28)] active:scale-[.99]">Continue with Google</button>
      <button onClick={()=>{window.location.href='/register?returnTo=%2F'}} className="mt-3 w-full rounded-2xl border border-white/10 px-5 py-3.5 text-sm font-semibold text-slate-300 hover:bg-white/[.04]">Create an account</button>
      <a href="/discover" className="mt-4 inline-block text-xs font-semibold text-cyan-300 hover:text-cyan-200">See what RIVET does</a>
    </div>
  </div>;
}

function AuthenticatedApp() {
  const location=useLocation();
  const { user, isLoadingAuth, isLoadingPublicSettings, isAuthenticated, authError, checkUserAuth, checkAppState } = useAuth();
  const [accessState,setAccessState]=useState('checking');
  const [accessError,setAccessError]=useState('');

  useEffect(()=>{
    if(!isAuthenticated||!user?.email){setAccessState('checking');return;}
    if(user?.role==='admin'||user?.rivet_owner){setAccessError('');setAccessState('owner');return;}

    let cancelled=false;
    (async()=>{
      try{
        const response=await Promise.race([
          base44.functions.invoke('ensureOwnerAccess',{}),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error('RIVET owner access check timed out after 6 seconds')),6000))
        ]);
        const data=response?.data||response;
        if(cancelled)return;
        if(data?.allowed){
          setAccessError('');
          setAccessState('owner');
          checkUserAuth().catch(()=>null);
        }else{
          setAccessError('');
          setAccessState('customer');
        }
      }catch(err){
        if(cancelled)return;
        setAccessError(err?.message||String(err));
        setAccessState('customer');
      }
    })();
    return()=>{cancelled=true};
  },[isAuthenticated,user?.email,user?.role,user?.rivet_owner]);

  if(location.pathname==='/discover') return <RIVETPublic/>;
  if(location.pathname==='/register') return <Register/>;
  if (isLoadingPublicSettings || isLoadingAuth) return <div className="fixed inset-0 grid place-items-center bg-[#050b14]"><div className="text-center"><img src="/luma-rivet.png" alt="Luma, RIVET" className="mx-auto h-20 w-20 rounded-2xl bg-white object-cover shadow-[0_18px_50px_rgba(20,121,255,.24)]"/><div className="mt-4 text-sm font-black tracking-[.24em] text-white">RIVET</div><div className="mt-2 text-xs text-slate-500">Opening reporting workspace…</div></div></div>;
  if (authError) {
    if (authError.type === 'auth_required') return <RIVETSignIn message="Your RIVET session needs to be refreshed." />;
    return <div className="fixed inset-0 grid place-items-center bg-[#050b14] p-6 text-center text-slate-300"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[.035] p-6"><div className="text-lg font-semibold text-white">RIVET could not finish loading.</div><div className="mt-2 text-sm leading-6 text-slate-500">{authError.message||'Unknown authentication error'}</div><button onClick={()=>checkAppState()} className="mt-5 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-white">Retry now</button></div></div>;
  }
  if (!isAuthenticated) return <RIVETSignIn />;
  if(accessState==='checking') return <div className="fixed inset-0 grid place-items-center bg-[#050b14]"><div className="text-center"><img src="/luma-rivet.png" alt="Luma, RIVET" className="mx-auto h-20 w-20 rounded-2xl bg-white object-cover shadow-[0_18px_50px_rgba(20,121,255,.24)]"/><div className="mt-4 text-sm font-black tracking-[.24em] text-white">RIVET</div><div className="mt-2 text-xs text-slate-500">Checking access…</div></div></div>;
  if(accessState==='owner') return <ReportingApp/>;
  return <CustomerPortal/>;
}

export default function App(){
  return <AppErrorBoundary><AuthProvider><Provider client={queryClientInstance}><Router><ScrollToTop/><AuthenticatedApp/></Router><Toaster/></Provider></AuthProvider></AppErrorBoundary>;
}