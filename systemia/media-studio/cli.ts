import fs from 'node:fs';
import path from 'node:path';
import { compileFilmPlan } from './director.js';
import { inspectProject } from './inspect.js';
import { renderFilm } from './render.js';
import { buildSabanProductionInventory } from './production-runtime.js';
import { buildCreativeCouncilInventory } from './creative-council.js';
import { buildShotTournamentInventory, type ShotCandidate } from './shot-tournament.js';
import {
  objectiveEditabilityReceipt,
  prepareVisualObservationPacket,
} from './visual-observer.js';
import { compileExplorationBatch } from './shot-exploration.js';
import type { CreativeCouncilInventory, CreativeCouncilReconciliation } from './creative-council.js';
import { compileSeriesEpisode } from './series.js';
import { buildVisualStageHtml } from './visual-stage-html.js';
import { compileWorldIntelStage, type WorldIntelStageInput } from './world-intel-stage.js';
import { compileJournalEducationStage, type JournalFallenProductionBrief } from './journal-education.js';
import type { VisualStage } from './visual-stage.js';
import { buildDistributedRenderPlan, type RenderAssetManifestRow } from './distributed-render.js';
import type { FilmPlan, MediaProject, SeriesBible, SeriesEpisodePlan } from './types.js';
import {
  compileStudioJourney,
  compileStudioRoomStage,
  type StudioJourneyStop,
  type StudioRoomStageInput,
} from './studio-world.js';
import {
  compileVirtualProductionEpisode,
  type VirtualProductionEpisode,
} from './virtual-production.js';
import {
  prepareHostPlate,
  type HostPlatePrepInput,
} from './host-plate.js';
import {
  buildVisualFinishPlan,
  buildVisualModelPlan,
  type VisualFinishRequest,
  type VisualModelEndpoint,
  type VisualShotRequest,
} from './model-fabric.js';
import {
  assessProductionGrade,
  type ProductionBeatQualityInput,
} from './production-grade-gate.js';

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown) {
  const full = path.resolve(filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function usage() {
  console.log([
    'Evercraft Media Studio v0',
    '',
    'Commands:',
    '  npm run media:studio -- plan <project.json> <plan.json>',
    '  npm run media:studio -- render <plan.json> <output.mp4>',
    '  npm run media:studio -- build <project.json> <output.mp4> [plan.json]',
    '  npm run media:studio -- series <project.json> <bible.json> <series-plan.json>',
    '  npm run media:studio -- inventory <series-plan.json> <inventory.json>',
    '  npm run media:studio -- council <plan.json> <creative-inventory.json>',
    '  npm run media:studio -- tournament <candidates.json> <tournament-inventory.json>',
    '  npm run media:studio -- observe <candidate.json> <observation-bundle.json> [frame-dir]',
    '  npm run media:studio -- explore <creative-bundle.json> <exploration-batch.json>',
    '  npm run media:studio -- stage <visual-stage.json> <stage.html>',
    '  npm run media:studio -- world-intel <story.json> <visual-stage.json> [stage.html]',
    '  npm run media:studio -- journal-story <journal-brief.json> <visual-stage.json> [receipt.json]',
    '  npm run media:studio -- render-plan <render-plan-input.json> <distributed-plan.json>',
    '  npm run media:studio -- studio-room <room.json> <visual-stage.json>',
    '  npm run media:studio -- studio-journey <journey.json> <journey-plan.json>',
    '  npm run media:studio -- virtual-production <episode.json> <production-plan.json> [stage.html]',
    '  npm run media:studio -- host-plate <prep.json> <receipt.json>',
    '  npm run media:studio -- model-plan <payload.json> <model-plan.json>',
    '  npm run media:studio -- finish-plan <payload.json> <finish-plan.json>',
    '  npm run media:studio -- production-grade <beats.json> <report.json>',
  ].join('\n'));
}

function main() {
  const [command, input, output, optionalPlan] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h') {
    usage();
    return;
  }

  if (command === 'journal-story') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const brief = readJson<JournalFallenProductionBrief>(input);
    const bundle = compileJournalEducationStage(brief);
    writeJson(output, bundle.stage);
    if (optionalPlan) writeJson(optionalPlan, bundle.receipt);
    console.log(`Journal education stage created: ${path.resolve(output)}`);
    if (optionalPlan) console.log(`Journal/Fallen receipt created: ${path.resolve(optionalPlan)}`);
    return;
  }

  if (command === 'model-plan') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const payload = readJson<{ request: VisualShotRequest; endpoints: VisualModelEndpoint[] }>(input);
    const plan = buildVisualModelPlan(payload.request, payload.endpoints);
    writeJson(output, plan);
    console.log(`Visual model plan created: ${path.resolve(output)}`);
    return;
  }

  if (command === 'finish-plan') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const payload = readJson<{ request: VisualFinishRequest; endpoints: VisualModelEndpoint[] }>(input);
    const plan = buildVisualFinishPlan(payload.request, payload.endpoints);
    writeJson(output, plan);
    console.log(`Visual finish plan created: ${path.resolve(output)}`);
    return;
  }

  if (command === 'production-grade') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const beats = readJson<ProductionBeatQualityInput[]>(input);
    const report = assessProductionGrade(beats);
    writeJson(output, report);
    console.log(`Production-grade report created: ${path.resolve(output)}`);
    if (report.status !== 'accepted') process.exitCode = 2;
    return;
  }

  if (command === 'studio-room') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const room = readJson<StudioRoomStageInput>(input);
    const stage = compileStudioRoomStage(room);
    writeJson(output, stage);
    console.log(`Studio room stage created: ${path.resolve(output)}`);
    return;
  }

  if (command === 'studio-journey') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const journeyInput = readJson<{ id: string; stops: StudioJourneyStop[] }>(input);
    const journey = compileStudioJourney(journeyInput);
    writeJson(output, journey);
    console.log(`Studio journey created: ${path.resolve(output)}`);
    return;
  }

  if (command === 'host-plate') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const request = readJson<HostPlatePrepInput>(input);
    const receipt = prepareHostPlate(request);
    writeJson(output, receipt);
    console.log(`Host performance plate created: ${receipt.outputPath}`);
    console.log(`Host plate receipt created: ${path.resolve(output)}`);
    return;
  }

  if (command === 'virtual-production') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const episode = readJson<VirtualProductionEpisode>(input);
    const plan = compileVirtualProductionEpisode(episode);
    writeJson(output, plan);
    if (optionalPlan) {
      fs.mkdirSync(path.dirname(path.resolve(optionalPlan)), { recursive: true });
      fs.writeFileSync(path.resolve(optionalPlan), buildVisualStageHtml(plan.stage), 'utf8');
    }
    console.log(`Virtual production plan created: ${path.resolve(output)}`);
    if (optionalPlan) console.log(`Virtual production stage HTML created: ${path.resolve(optionalPlan)}`);
    return;
  }

  if (command === 'render-plan') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const payload = readJson<{
      id: string;
      stage: VisualStage;
      assetScopeId?: string;
      assets?: RenderAssetManifestRow[];
      maxFramesPerShard?: number;
    }>(input);
    const plan = buildDistributedRenderPlan(payload);
    writeJson(output, plan);
    console.log(`Distributed render plan created: ${path.resolve(output)}`);
    console.log(`Frames: ${plan.totalFrames}; shards: ${plan.shards.length}; fps: ${plan.fps}`);
    return;
  }

  if (command === 'world-intel') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const story = readJson<WorldIntelStageInput>(input);
    const stage = compileWorldIntelStage(story);
    writeJson(output, stage);
    if (optionalPlan) {
      fs.mkdirSync(path.dirname(path.resolve(optionalPlan)), { recursive: true });
      fs.writeFileSync(path.resolve(optionalPlan), buildVisualStageHtml(stage), 'utf8');
    }
    console.log(`World-intelligence visual stage created: ${path.resolve(output)}`);
    if (optionalPlan) console.log(`Visual stage HTML created: ${path.resolve(optionalPlan)}`);
    return;
  }

  if (command === 'stage') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const stage = readJson<VisualStage>(input);
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(path.resolve(output), buildVisualStageHtml(stage), 'utf8');
    console.log(`Visual stage HTML created: ${path.resolve(output)}`);
    return;
  }

  if (command === 'explore') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const bundle = readJson<{ inventory: CreativeCouncilInventory; reconciliation: CreativeCouncilReconciliation }>(input);
    const exploration = compileExplorationBatch(bundle.inventory, bundle.reconciliation);
    writeJson(output, exploration);
    console.log(`Shot exploration batch created: ${path.resolve(output)}`);
    return;
  }

  if (command === 'observe') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const candidate = readJson<ShotCandidate>(input);
    const packet = prepareVisualObservationPacket({
      candidate,
      outputDir: optionalPlan,
    });
    const editability = objectiveEditabilityReceipt(packet);
    writeJson(output, {
      schema: 'evercraft.fallen.visual-observation-bundle.v1',
      packet,
      objectiveReceipts: [editability],
    });
    console.log(`Visual observation bundle created: ${path.resolve(output)}`);
    return;
  }

  if (command === 'tournament') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const payload = readJson<{
      shotId: string;
      creativeGenomeDigest: string;
      candidates: ShotCandidate[];
    }>(input);
    const inventory = buildShotTournamentInventory(payload);
    writeJson(output, inventory);
    console.log(`Shot tournament inventory created: ${path.resolve(output)}`);
    return;
  }

  if (command === 'council') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const plan = readJson<FilmPlan>(input);
    const inventory = buildCreativeCouncilInventory(plan);
    writeJson(output, inventory);
    console.log(`Creative council inventory created: ${path.resolve(output)}`);
    return;
  }

  if (command === 'inventory') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const seriesPlan = readJson<SeriesEpisodePlan>(input);
    const inventory = buildSabanProductionInventory(seriesPlan.productionNeeds);
    writeJson(output, inventory);
    console.log(`Saban production inventory created: ${path.resolve(output)}`);
    return;
  }

  if (command === 'series') {
    if (!input || !output || !optionalPlan) {
      usage();
      process.exitCode = 1;
      return;
    }
    const project = inspectProject(readJson<MediaProject>(input));
    const bible = readJson<SeriesBible>(output);
    const seriesPlan = compileSeriesEpisode(project, bible);
    writeJson(optionalPlan, seriesPlan);
    console.log(`Series plan created: ${path.resolve(optionalPlan)}`);
    return;
  }

  if (!input || !output) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (command === 'plan') {
    const project = inspectProject(readJson<MediaProject>(input));
    const plan = compileFilmPlan(project);
    writeJson(output, plan);
    console.log(`Plan created: ${path.resolve(output)}`);
    if (plan.warnings.length) console.warn(plan.warnings.join('\n'));
    return;
  }

  if (command === 'render') {
    const plan = readJson<FilmPlan>(input);
    const rendered = renderFilm(plan, output);
    console.log(`Film rendered: ${rendered}`);
    return;
  }

  if (command === 'build') {
    const project = inspectProject(readJson<MediaProject>(input));
    const plan = compileFilmPlan(project);
    if (optionalPlan) writeJson(optionalPlan, plan);
    const rendered = renderFilm(plan, output);
    console.log(`Film rendered: ${rendered}`);
    if (optionalPlan) console.log(`Plan saved: ${path.resolve(optionalPlan)}`);
    if (plan.warnings.length) console.warn(plan.warnings.join('\n'));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
