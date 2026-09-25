import fs from 'node:fs';
import path from 'node:path';
import { compileFilmPlan } from './director.js';
import { inspectProject } from './inspect.js';
import { renderFilm } from './render.js';
import { compileSeriesEpisode } from './series.js';
import type { FilmPlan, MediaProject, SeriesBible } from './types.js';

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
  ].join('\n'));
}

function main() {
  const [command, input, output, optionalPlan] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h') {
    usage();
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
