import {createMystery,revealNext,suspicionScores,accuse,readMysteryCheckpoint,writeMysteryCheckpoint} from './mystery.mjs';
import {createWorld as createSocietyWorld} from './world.mjs';

// Optional local experiment under the canonical Window projection. Not another engine.
export function mountMysteryLab(getWorld) {
  const parent=document.querySelector('.layout');
  if(!parent||document.querySelector('#mystery-lab'))return;
  const section=document.createElement('section');
  section.id='mystery-lab';
  section.className='mystery-lab sidepanel';
  section.setAttribute('aria-label','The Missing Blueprint playable fictional mystery');
  section.innerHTML=`<div class="mystery-heading"><div><span class="eyebrow">EXPERIMENT 002 / SOCIAL DEDUCTION</span><h2>The Missing Blueprint</h2><p>Someone moved a workshop blueprint. Examine witnesses, separate testimony from records, and decide what the evidence supports.</p></div><span class="mystery-label">FICTIONAL · RULE-BASED</span></div>
    <div class="mystery-columns"><div><h3>Evidence board <span id="mystery-progress"></span></h3><ol id="mystery-clues" aria-label="Revealed evidence"></ol><button type="button" id="mystery-reveal">Examine next clue</button></div>
    <div><h3>Resident files</h3><div id="mystery-suspects"></div><label for="mystery-choice">Who moved the blueprint?</label><select id="mystery-choice" aria-label="Select suspect"></select><button type="button" id="mystery-accuse">Submit theory</button><p id="mystery-result" role="status" aria-live="polite"></p><button type="button" id="mystery-reset">New fictional case</button></div></div>
    <p class="mystery-disclaimer">Your fictional case progress is saved locally on this device, and reloads can resume it. A deterministic puzzle projected from existing Mossmere residents and relationships. Statements are generated fixtures, not independent AI testimony. Scores are evidence weights, not probabilities. No choice changes the shared world or a real person's record.</p>`;
  parent.insertAdjacentElement('afterend',section);
  const $=id=>section.querySelector('#'+id);
  // Both the Window and Worlds reconstruct from the same original fictional town fixture.
  const scenarioWorld=createSocietyWorld(0,818);
  const resumed=readMysteryCheckpoint(localStorage,scenarioWorld);
  let state=resumed?.state??createMystery(scenarioWorld,0);
  let choice=resumed?.choice??state.suspects[0].id;
  const persist=()=>writeMysteryCheckpoint(localStorage,state,choice);
  function render(){
    const scores=suspicionScores(state);
    $('mystery-progress').textContent=state.revealed+'/'+state.maxReveals+' examined';
    const items=state.clues.slice(0,state.revealed).map(clue=>{
      const li=document.createElement('li');
      const tag=document.createElement('small');
      tag.textContent=clue.source+' · '+clue.reliability.replaceAll('_',' ');
      const p=document.createElement('p');p.textContent=clue.text;li.append(tag,p);return li;
    });
    if(!items.length){const li=document.createElement('li');li.textContent='The files are sealed. Begin with the workshop access register.';items.push(li);}
    $('mystery-clues').replaceChildren(...items);
    const cards=state.suspects.map(s=>{
      const div=document.createElement('div');div.className='mystery-suspect';
      const strong=document.createElement('strong');strong.textContent=s.name+' · '+s.job;
      const small=document.createElement('small');small.textContent='Evidence weight: '+scores[s.id];
      div.append(strong,small);return div;
    });
    $('mystery-suspects').replaceChildren(...cards);
    const select=$('mystery-choice');
    select.replaceChildren(...state.suspects.map(s=>{
      const option=document.createElement('option');option.value=s.id;option.textContent=s.name;return option;
    }));
    select.value=choice;
    $('mystery-reveal').disabled=Boolean(state.accusation)||state.revealed===state.maxReveals;
    $('mystery-accuse').disabled=Boolean(state.accusation)||state.revealed<3;
    if(state.accusation){
      const answer=state.suspects.find(s=>s.id===state.answerId)?.name||'Unknown';
      $('mystery-result').textContent=(state.accusation.correct?'Theory supported. ':'Theory not supported. ')+
        'The fictional case identifies '+answer+' as the person who moved the blueprint. Motive was not proven.';
    }else $('mystery-result').textContent=state.revealed<3?
      'Examine three clues before submitting a theory.':'Submit a theory now, or inspect another clue.';
  }
  $('mystery-choice').addEventListener('change',e=>{choice=e.target.value;persist();});
  $('mystery-reveal').addEventListener('click',()=>{state=revealNext(state);persist();render();});
  $('mystery-accuse').addEventListener('click',()=>{state=accuse(state,choice);persist();render();});
  $('mystery-reset').addEventListener('click',()=>{
    state=createMystery(scenarioWorld,(state.seed+1)%1_000_001);
    choice=state.suspects[0].id;persist();render();
  });
  render();
}
