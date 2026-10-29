// Browser-only mirror of the local Work Saban mission formation vocabulary.
// This does not call the local runtime, dispatch models or initiate any side effect.
const ROLES=Object.freeze({
  director:{name:'Mission Director',description:'Clarifies the objective, result and constraints.'},
  researcher:{name:'Research Specialist',description:'Plans evidence-gathering and source checks.'},
  analyst:{name:'Data Analyst',description:'Plans data checks, calculations and key findings.'},
  writer:{name:'Communications Specialist',description:'Plans the writing for the intended audience.'},
  designer:{name:'Presentation Designer',description:'Plans the structure for visuals and slides.'},
  operations:{name:'Workflow Engineer',description:'Plans process steps, dependencies and controls.'},
  auditor:{name:'Quality Auditor',description:'Plans independent checks and flags missing evidence.'},
  coordinator:{name:'Delivery Coordinator',description:'Plans the reviewed handoff and approval points.'}
});
const SIGNALS=Object.freeze({
  analyst:/\b(data|spreadsheet|excel|csv|numbers|revenue|sales|budget|finance|financial|trend|metric|kpi|forecast|calculate|compare|report)\b/i,
  researcher:/\b(research|investigate|find|source|market|competitor|survey|compare|evaluate|why|evidence)\b/i,
  writer:/\b(write|email|message|letter|memo|draft|proposal|copy|announce|summary|summarize|newsletter|respond)\b/i,
  designer:/\b(slides?|presentations?|decks?|pitch|visual|charts?|graphics?|design|powerpoint)\b/i,
  operations:/\b(workflow|process|project|schedule|plan|coordinate|organize|inventory|automate|procedure|onboard|operations)\b/i
});
const PERMISSION_GATES=[
  'Connecting or reading private files or accounts',
  'Sending messages or publishing on your behalf',
  'Changing business records or triggering workflows',
  'Spending money or creating an order'
];
const normalizeTask=task=>{
  if(typeof task!=='string')throw new TypeError('Enter a task in plain language.');
  const clean=task.normalize('NFKC').trim();
  if(clean.length<8)throw new Error('Describe the task in at least eight characters.');
  if(clean.length>4000)throw new Error('Keep the task under 4,000 characters.');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(clean))throw new Error('Remove unsupported control characters.');
  return clean;
};
const assign=(id,phase,dependencies)=>({
  id,role:ROLES[id].name,responsibility:ROLES[id].description,
  phase,depends_on:dependencies,state:'proposed_not_running'
});
export function planTask(task){
  const request=normalizeTask(task);
  const specialists=Object.entries(SIGNALS).filter(([,re])=>re.test(request)).map(([key])=>key);
  if(!specialists.length)specialists.push('researcher');
  const team=[
    assign('director','scope',[]),
    ...specialists.map(id=>assign(id,'specialist',['director'])),
    assign('auditor','verify',specialists),
    assign('coordinator','delivery',['auditor'])
  ];
  const waves=[['director'],specialists,['auditor'],['coordinator']];
  return {
    schema:'evercraft.work-saban.browser-plan.v1',
    task:request,
    state:'proposed_not_running',
    execution_started:false,
    customer_data_transmitted:false,
    team,
    waves,
    permission_gates:[...PERMISSION_GATES],
    note:'Browser-generated planning preview. No agents have been launched and no files have been read.'
  };
}
