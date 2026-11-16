// Evercraft Worlds / permissioned quest-master v0.
// Data-only proposals. No live language model or server authority is implied.
// The same validator may later be used for untrusted, model-proposed quests.
import {applyCommand,validateWorld} from './world-core.mjs';

export const QUEST_SCHEMA = 'evercraft.worlds.quest-proposal.v1';
export const QUEST_RECEIPT_SCHEMA = 'evercraft.worlds.quest-receipt.v1';
const PLACE_KINDS = new Set(['tree','flower','bench','lamp','rock','mushroom']);
const SKY_KINDS = new Set(['day','sunset','night']);
const MAX_QUEST_STEPS = 3;
const MAX_SHAREABLE_OBJECTS = 40;
const BOUNDED_COORD = 16;
const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, expected) => Object.keys(value).sort().join('|') === [...expected].sort().join('|');
const cleanText = (value, max) => typeof value === 'string' &&
  value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);

export function validateQuestProposal(proposal) {
  if (!isRecord(proposal) ||
      !exactKeys(proposal, ['schema','title','story','narrator','steps']) ||
      proposal.schema !== QUEST_SCHEMA ||
      !cleanText(proposal.title, 72) || !cleanText(proposal.story, 240) ||
      !['Pip','Momo','Lumi'].includes(proposal.narrator) ||
      !Array.isArray(proposal.steps) ||
      proposal.steps.length < 1 || proposal.steps.length > MAX_QUEST_STEPS) {
    throw Error('quest_proposal_invalid');
  }
  for (const step of proposal.steps) {
    if (!isRecord(step)) throw Error('quest_step_invalid');
    if (step.type === 'place') {
      if (!exactKeys(step, ['type','kind','x','z']) ||
          !PLACE_KINDS.has(step.kind) ||
          !Number.isFinite(step.x) || !Number.isFinite(step.z) ||
          Math.abs(step.x) > BOUNDED_COORD || Math.abs(step.z) > BOUNDED_COORD) {
        throw Error('quest_step_invalid');
      }
    } else if (step.type === 'sky') {
      if (!exactKeys(step, ['type','value']) || !SKY_KINDS.has(step.value)) {
        throw Error('quest_step_invalid');
      }
    } else {
      throw Error('quest_step_invalid');
    }
  }
  return proposal;
}

const TEMPLATES = {
  garden: {
    title: 'The Lantern Bloom', narrator: 'Pip',
    story: 'Pip wants to welcome the fireflies with a fresh flower and a golden evening.',
    steps: [{type:'place',kind:'flower',x:4,z:2},{type:'sky',value:'sunset'}]
  },
  workshop: {
    title: 'The Inventor’s Corner', narrator: 'Momo',
    story: 'Momo has a brilliant idea: a little lamp and a bench to make the workshop feel alive.',
    steps: [{type:'place',kind:'lamp',x:2,z:-2},{type:'place',kind:'bench',x:-2,z:-1}]
  },
  stars: {
    title: 'A Light for the Stars', narrator: 'Lumi',
    story: 'Lumi is staying up late to watch the sky. Make a warm beacon for the stargazers.',
    steps: [{type:'sky',value:'night'},{type:'place',kind:'lamp',x:5,z:3}]
  }
};

// Offline authored story seeds, not generative AI. The player chooses a theme.
export function draftQuest(world, request='') {
  validateWorld(world);
  if (typeof request !== 'string' || request.length > 120) throw Error('quest_request_invalid');
  const text = request.trim().toLowerCase();
  const key = /night|star|moon|dark/.test(text) ? 'stars' :
    /workshop|invent|bench|machine|build/.test(text) ? 'workshop' : 'garden';
  return validateQuestProposal({schema:QUEST_SCHEMA,...structuredClone(TEMPLATES[key])});
}

export function describeQuestStep(step) {
  const checked = validateQuestProposal({
    schema:QUEST_SCHEMA,title:'Preview',story:'Proposed scene changes',narrator:'Pip',steps:[step]
  }).steps[0];
  return checked.type === 'place'
    ? 'Place '+checked.kind+' at '+checked.x+', '+checked.z
    : 'Set sky to '+checked.value;
}

function commandFor(step) {
  return step.type === 'place' ?
    'add '+step.kind+' at '+step.x+', '+step.z : 'sky '+step.value;
}

// Preview actually applies each step against a CLONE, so it catches capacity
// failures and unsupported action semantics before an approval is presented.
export function previewQuest(world, proposal) {
  validateWorld(world);
  const quest = validateQuestProposal(proposal);
  let scene = structuredClone(world);
  const steps = [];
  for (const action of quest.steps) {
    if (action.type === 'place' && scene.objects.length >= MAX_SHAREABLE_OBJECTS) {
      throw Error('quest_scene_capacity_reached');
    }
    const before = scene.revision;
    const result = applyCommand(scene,commandFor(action));
    if (result.world === scene || result.world.revision !== before + 1) {
      throw Error('quest_action_rejected');
    }
    scene = result.world;
    steps.push({action:describeQuestStep(action),message:result.message,revision:scene.revision});
  }
  return {world:scene,steps,original_revision:world.revision};
}

// The caller must explicitly authorize an exact proposal against an exact
// scene revision. No vault writes, inventory edits, accounts, chats, or code execution.
export function executeQuest(world, proposal, {authorized=false,expectedRevision}={}) {
  if (authorized !== true) throw Error('quest_approval_required');
  validateWorld(world);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== world.revision) {
    throw Error('quest_world_version_conflict');
  }
  const {world:next,steps} = previewQuest(world,proposal);
  const quest = validateQuestProposal(proposal);
  return {
    world:next,
    receipt:{
      schema:QUEST_RECEIPT_SCHEMA,
      title:quest.title,
      narrator:quest.narrator,
      from_revision:world.revision,
      to_revision:next.revision,
      actions:steps,
      status:'applied_to_local_scene_only'
    }
  };
}
