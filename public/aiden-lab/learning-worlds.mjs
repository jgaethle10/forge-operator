// Aiden's Lab | reviewed Evercraft learning-world lineage, not an availability feed.
// No child records, private app IDs, unpublished source, or backend controls.
// Discovery-only and historical entries never masquerade as playable experiences.
export const WORLD_STATES=Object.freeze({
  practice_preview:'Playable practice preview',
  interactive_preview:'Interactive science model preview',
  source_viewer:'Source viewer preserved',
  discovery_only:'Product record only',
  historical_rebuild:'Historical build · rebuilding'
});

export const LEARNING_WORLDS=Object.freeze([
  {
    id:'infinite-classroom',icon:'🏰',title:'Infinite Classroom',kind:'Learn and play',
    description:'Six colorful rooms with 18 authored missions, clues and device-local stars. Explore math, reading, science, languages, creativity and calm skills.',
    state:'practice_preview',action:'Enter the practice classroom',
    url:'./classroom/',
    evidence:'Owned, deterministic browser practice preview. The original conversational Luma tutor and per-learner accounts are not restored.',
    source:'https://github.com/jgaethle10/forge-operator/tree/main/public/apps/infinite-classroom/play'
  },
  {
    id:'physics-atlas',icon:'⚛️',title:'Physics Atlas',kind:'Experiment and predict',
    description:'Forces, motion, waves, circuits and matter. The goal is to predict, manipulate, measure and explain, not just read an answer.',
    state:'interactive_preview',action:'Experiment with physics',
    url:'./physics/',
    evidence:'New original Evercraft-owned browser preview with ideal projectile, small-angle pendulum and one-dimensional wave models. It is not a recovery or production-parity proof of the former Physics Atlas.',
    source:'https://github.com/jgaethle10/forge-operator/tree/main/registry/evercraft-physics-atlas'
  },
  {
    id:'earth-atlas',icon:'🌍',title:'Earth & World Atlas',kind:'Explore our planet',
    description:'Maps, places, natural systems, hazards, geography and history. Return the Earth Atlas as an interactive evidence-led world.',
    state:'interactive_preview',action:'Explore the Earth globe',
    url:'./world/',
    evidence:'New first-party educational globe with schematic coastlines and coordinate-based source-linked expeditions. The original Earth Atlas code and feature parity are not recovered; no authoritative map, live sensor or hazard forecast.',
    source:'https://github.com/jgaethle10/forge-operator/blob/main/systemia/migrations/base44-exit/EDUCATION-REBUILD-2026-11-04.md'
  },
  {
    id:'cosmos-atlas',icon:'🪐',title:'Cosmos Atlas',kind:'Journey into space',
    description:'Planets, stars, galaxies, signals and space science, always separating observations, models and open questions.',
    state:'discovery_only',action:'View the Cosmos Atlas record',
    url:'https://github.com/jgaethle10/forge-operator/tree/main/registry/evercraft-cosmos-atlas',
    evidence:'Evidence-led astronomy product record preserved; no independently verified owned full-world launch.',
    source:'https://github.com/jgaethle10/forge-operator/tree/main/registry/evercraft-cosmos-atlas'
  },
  {
    id:'energy-atlas',icon:'⚡',title:'Global Energy Atlas',kind:'Power our world',
    description:'Compare energy systems with source year, units, geography, and uncertainty attached to every claim.',
    state:'discovery_only',action:'View the Energy Atlas record',
    url:'https://github.com/jgaethle10/forge-operator/tree/main/registry/global-energy-atlas',
    evidence:'Public source-bound product record exists; the original comparison experience has not been independently restored on owned infrastructure.',
    source:'https://github.com/jgaethle10/forge-operator/tree/main/registry/global-energy-atlas'
  },
  {
    id:'wildlife-atlas',icon:'🦋',title:'Wildlife Atlas',kind:'Meet the living planet',
    description:'Habitats, migration, adaptation and conservation through verified observations and clearly labeled models.',
    state:'discovery_only',action:'View the Wildlife Atlas record',
    url:'https://github.com/jgaethle10/forge-operator/tree/main/registry/evercraft-wildlife-atlas',
    evidence:'A wildlife-ecology learning product record exists; a complete interactive owned viewer is unverified.',
    source:'https://github.com/jgaethle10/forge-operator/tree/main/registry/evercraft-wildlife-atlas'
  },
  {
    id:'sentinel-intelligence',icon:'🛡️',title:'Sentinel Intelligence',kind:'Understand defense systems',
    description:'Public-history and science learning about technology, observation, readiness and how evidence is evaluated. No live military tracking or tactical controls.',
    state:'historical_rebuild',action:'View the preserved portfolio evidence',
    url:'https://github.com/jgaethle10/forge-operator/blob/main/systemia/saban/estate-inventory.snapshot.json',
    evidence:'Historical Sentinel Intelligence entry is recorded, but its original military learning app source, permissions and full interface are not recovered. This is distinct from live Systemia Sentinel services.',
    source:'https://github.com/jgaethle10/forge-operator/blob/main/systemia/saban/estate-inventory.snapshot.json'
  },
  {
    id:'hidden-world-atlas',icon:'🗺️',title:'Hidden World Atlas',kind:'History beneath our feet',
    description:'Explore historical sites, underground places and evidence from archival maps and original records.',
    state:'source_viewer',action:'Inspect the source viewer',
    url:'https://github.com/jgaethle10/forge-operator/tree/main/public/worlds/hidden-world',
    evidence:'An owned read-only public viewer exists in GitHub source; inclusion here does not certify its public HTTPS route.',
    source:'https://github.com/jgaethle10/forge-operator/tree/main/public/worlds/hidden-world'
  },
  {
    id:'deep-learning',icon:'🧠',title:'Deep Learning Corridors',kind:'Connect every subject',
    description:'Follow a question across physics, Earth, energy, wildlife, history and computing using one shared learning method.',
    state:'historical_rebuild',action:'Read the learning architecture',
    url:'https://github.com/jgaethle10/forge-operator/blob/main/systemia/migrations/base44-exit/EDUCATION-REBUILD-2026-11-04.md',
    evidence:'The owned migration plan preserves shared learning primitives. Cross-world progress, tutor, curriculum graph and full original parity are not yet demonstrated.',
    source:'https://github.com/jgaethle10/forge-operator/blob/main/systemia/migrations/base44-exit/EDUCATION-REBUILD-2026-11-04.md'
  }
]);

export const LEARNING_SEQUENCE=Object.freeze([
  {title:'Predict',description:'What do you think will happen?'},
  {title:'Try it',description:'Change one variable or explore a real source.'},
  {title:'Observe',description:'What happened, and what evidence supports it?'},
  {title:'Explain',description:'Tell the story in your own words.'},
  {title:'Connect',description:'Where else in the world does this idea appear?'}
]);
