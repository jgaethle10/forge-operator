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
import type { CreativeCouncilInventory } from './creative-council.js';
import { compileSeriesEpisode } from './series.js';
import type { FilmPlan, MediaProject, SeriesBible, SeriesEpisodePlan } from './types.js';

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
    '  npm run media:studio -- explore <creative-inventory.json> <exploration-batch.json>',
  ].join('\n'));
}

function main() {
  const [command, input, output, optionalPlan] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h') {
    usage();
    return;
  }

  if (command === 'explore') {
    if (!input || !output) {
      usage();
      process.exitCode = 1;
      return;
    }
    const inventory = readJson<CreativeCouncilInventory>(input);
    const exploration = compileExplorationBatch(inventory);
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
