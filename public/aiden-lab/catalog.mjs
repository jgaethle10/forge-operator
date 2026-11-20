// Aiden's Lab starter science atlas. Each entry has an explicitly bounded evidence trail.
// "source_code" means a source implementation exists, not a validated scientific result.
// "public_page" means a public viewer exists in the repo, not a verified live deployment.
// "branch" means exploratory work is visible on a named branch, not production-ready.
export const CATEGORIES = Object.freeze([
  'All', 'Health & medicine', 'Life sciences', 'Earth & environment',
  'Ocean & archaeology', 'Space & flight', 'Physics & materials', 'Computing & robotics'
]);

export const TOPICS = Object.freeze([
  {
    id:'medical-evidence', icon:'🧬', category:'Health & medicine', title:'The Medical Evidence Desk',
    summary:'How can we separate promising medical research from a claim that has actually been tested?',
    question:'What do a paper, an abstract, a trial registration and a verified outcome each really tell us?',
    evidence:'Evercraft has PubMed discovery, abstract processing, review packet and evidence-triage source modules in the Systemia organism directory.',
    unknown:'Independent full-text appraisal, clinical validation and permission to publish conclusions are not established by this code.',
    state:'source_code',
    links:[{label:'PubMed source-ingestion module',url:'https://github.com/jgaethle10/forge-operator/blob/main/systemia/organism/medical-abstract-evidence.mjs'},{label:'PubMed search',url:'https://pubmed.ncbi.nlm.nih.gov/'}]
  },
  {
    id:'clinical-trials', icon:'🩺', category:'Health & medicine', title:'Inside Clinical Trials',
    summary:'Follow the difference between a study being registered and a treatment being proven.',
    question:'How do published papers match up with registered studies, their protocols and reported outcomes?',
    evidence:'Repository modules implement registered-trial discovery, registry identifier cross-checking and protocol-to-publication text comparison.',
    unknown:'An identifier match or automated comparison does not establish a treatment is safe, effective or approved.',
    state:'source_code',
    links:[{label:'Clinical-trial research module',url:'https://github.com/jgaethle10/forge-operator/blob/main/systemia/organism/medical-registered-trial-lane.mjs'},{label:'Official clinical trial registry',url:'https://clinicaltrials.gov/'}]
  },
  {
    id:'biomedical-watch', icon:'🔬', category:'Health & medicine', title:'Biology in the Headlines',
    summary:'A reading room for oncology, neurological disease, genetics and public-health papers.',
    question:'Which biomedical questions are researchers studying, and which findings still need stronger verification?',
    evidence:'A medical evidence-brief module groups sampled PubMed titles by research topic and records source metadata and publication limitations.',
    unknown:'Title-grouping is not a systematic literature review, a measure of disease trends, or a verified clinical discovery.',
    state:'source_code',
    links:[{label:'Medical evidence brief module',url:'https://github.com/jgaethle10/forge-operator/blob/main/systemia/organism/medical-evidence-brief.mjs'},{label:'Browse biomedical literature',url:'https://pubmed.ncbi.nlm.nih.gov/'}]
  },
  {
    id:'fungal-defense', icon:'🍄', category:'Life sciences', title:'The Fungal Frontier',
    summary:'Explore fungal surveillance, resistance and the questions behind protective science.',
    question:'How could trustworthy public evidence improve our understanding of fungal threats and prevention?',
    evidence:'Evercraft has a dedicated research/fungal-defense-001 branch in its canonical repository.',
    unknown:'The existence of a research branch does not establish an operating surveillance system, proven prevention or clinical recommendations.',
    state:'branch',
    links:[{label:'Fungal Defense research branch',url:'https://github.com/jgaethle10/forge-operator/tree/research/fungal-defense-001'}]
  },
  {
    id:'earth-watch', icon:'🌋', category:'Earth & environment', title:'The Restless Earth',
    summary:'Earthquakes, volcanoes and the data that help us observe a moving planet.',
    question:'What do fresh geological observations tell us, and what can they not predict?',
    evidence:'The Systemia science-hazard-watch module uses documented USGS earthquake and volcano source endpoints.',
    unknown:'This page does not fetch live events, issue warnings or predict earthquakes or eruptions.',
    state:'source_code',
    links:[{label:'Science-hazard watch code',url:'https://github.com/jgaethle10/forge-operator/blob/main/systemia/organism/science-hazard-watch.mjs'},{label:'USGS Earthquake Hazards Program',url:'https://earthquake.usgs.gov/'}]
  },
  {
    id:'water', icon:'💧', category:'Earth & environment', title:'Water, Snow & Watersheds',
    summary:'Trace snowpack, reservoirs, basin conditions and the questions behind freshwater resilience.',
    question:'How do weather, snowmelt, drainage and water management connect across a watershed?',
    evidence:'A watershed-intelligence research module and Yakima-region profile exist in the public repository.',
    unknown:'Current field conditions and forecast accuracy require new dated observations; this atlas contains no live readings.',
    state:'source_code',
    links:[{label:'Watershed intelligence module',url:'https://github.com/jgaethle10/forge-operator/blob/main/systemia/research-service/watershed-intelligence.mjs'},{label:'Watershed research documentation',url:'https://github.com/jgaethle10/forge-operator/tree/main/systemia/research-service'}]
  },
  {
    id:'infrastructure', icon:'🛰️', category:'Earth & environment', title:'The Living Infrastructure Map',
    summary:'Use geographic science to understand infrastructure conditions, constraints and uncertainty.',
    question:'How can mapping and source provenance reveal infrastructure issues without overstating danger?',
    evidence:'Evercraft maintains a public Evermaps surface and source-backed geospatial infrastructure work.',
    unknown:'A mapped report is not automatically an independently verified hazard or a current on-site assessment.',
    state:'public_page',
    links:[{label:'Explore Evermaps',url:'../evermaps/'},{label:'Public map source',url:'https://github.com/jgaethle10/forge-operator/tree/main/public/evermaps'}]
  },
  {
    id:'underwater', icon:'🌊', category:'Ocean & archaeology', title:'Beneath the Surface',
    summary:'Underwater observation, field evidence and the mystery of what our maps leave out.',
    question:'How can underwater records and spatial viewers help people examine difficult-to-see environments?',
    evidence:'Evercraft has a public Subsea Watch viewer and supporting core and sample data files.',
    unknown:'A rendered view is not confirmation that a location has been physically surveyed or a hazard verified.',
    state:'public_page',
    links:[{label:'Explore Subsea Watch',url:'../subsea-watch/'},{label:'Read the Subsea source code',url:'https://github.com/jgaethle10/forge-operator/tree/main/public/subsea-watch'}]
  },
  {
    id:'submerged-heritage', icon:'🏺', category:'Ocean & archaeology', title:'Lost Places, Found Questions',
    summary:'Explore underwater heritage, mapped locations, and the science of careful reconstruction.',
    question:'What can geospatial evidence and historical context tell us about submerged sites?',
    evidence:'Evercraft maintains a Submerged Heritage public atlas and a structured sites GeoJSON file.',
    unknown:'Site coordinates, interpretations and historical attribution require external corroboration; exploration is not excavation.',
    state:'public_page',
    links:[{label:'Open the Submerged Heritage atlas',url:'../submerged-heritage/'},{label:'Inspect the location dataset',url:'https://github.com/jgaethle10/forge-operator/blob/main/public/submerged-heritage/sites.geojson'}]
  },
  {
    id:'aaar', icon:'🚀', category:'Space & flight', title:'From Flight to Space',
    summary:'Meet Anniston Aerospace, Aerodynamics & Robotics, Evercraft’s flight and space engineering program.',
    question:'Which designs can be simulated, measured and validated before physical experiments?',
    evidence:'A feature branch for Anniston AAAR mission control exists in the canonical repository.',
    unknown:'A program interface or simulation proposal is not flight certification, manufacturing readiness, or physical test proof.',
    state:'branch',
    links:[{label:'Anniston AAAR program branch',url:'https://github.com/jgaethle10/forge-operator/tree/feature/anniston-aaar-mission-control-20261119'}]
  },
  {
    id:'flight-sentinel', icon:'✈️', category:'Space & flight', title:'Why Aircraft Stay Safe',
    summary:'Investigate aviation safety signals, failure prevention and the discipline of evidence-based flight engineering.',
    question:'How can verified safety information guide simulation and research into failure modes?',
    evidence:'A dedicated Flight Sentinel research branch exists for aviation and infrastructure guardian exploration.',
    unknown:'No airworthiness finding, aircraft repair, flight test or FAA approval is asserted by this directory.',
    state:'branch',
    links:[{label:'Flight Sentinel research branch',url:'https://github.com/jgaethle10/forge-operator/tree/research/flight-sentinel-infrastructure-guardian-001'}]
  },
  {
    id:'superconductors', icon:'🧲', category:'Physics & materials', title:'The Superconductor Question',
    summary:'Physics is full of striking claims. What would it take to independently test one?',
    question:'Which experimental details make materials-science claims reproducible?',
    evidence:'Evercraft has a superconductivity observational-audit research branch.',
    unknown:'An observational audit is not evidence of a new superconductor, independently reproduced effect or commercial material.',
    state:'branch',
    links:[{label:'Superconductor audit branch',url:'https://github.com/jgaethle10/forge-operator/tree/science/supercon-observational-audit-20261029'}]
  },
  {
    id:'spatial-worlds', icon:'🌐', category:'Computing & robotics', title:'Worlds as Laboratories',
    summary:'Use interactive spatial worlds to ask how movement, perception and environments work.',
    question:'What can an interactive simulation teach us, and what requires a real-world test?',
    evidence:'Evercraft Worlds includes spatial-perception modules and a perception-lab directory in the repository.',
    unknown:'Virtual visuals and synthetic simulations do not validate real-world physical behavior by themselves.',
    state:'public_page',
    links:[{label:'Explore Evercraft Worlds',url:'../worlds/'},{label:'Spatial perception source code',url:'https://github.com/jgaethle10/forge-operator/blob/main/public/worlds/spatial-perception.mjs'}]
  },
  {
    id:'frontier', icon:'🤖', category:'Computing & robotics', title:'The Frontier Question Engine',
    summary:'Follow how a coordinated research system chooses questions while keeping its evidence visible.',
    question:'Can a research machine explore bold ideas without confusing observations, assumptions and decisions?',
    evidence:'The Systemia organism contains a Kaidance frontier-cycle module and related proof code.',
    unknown:'Research orchestration code alone does not prove continuous autonomous operation, original scientific results or peer review.',
    state:'source_code',
    links:[{label:'Frontier-cycle implementation',url:'https://github.com/jgaethle10/forge-operator/blob/main/systemia/organism/kaidance-frontier-cycle.mjs'},{label:'Research scoping public surface',url:'../research/'}]
  }
]);

export const STATE_LABELS = Object.freeze({
  source_code:'Research code exists',
  public_page:'Public explorer in repo',
  branch:'Exploratory branch'
});
