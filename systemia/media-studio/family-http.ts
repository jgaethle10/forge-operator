import type { Express, NextFunction, Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { compileSeriesEpisode } from './series.js';
import type { MediaProject, SeriesBible } from './types.js';

type FamilyCharacter = {
  id?: string;
  name: string;
  role?: string;
  description?: string;
  photoName?: string;
  photoDataUrl?: string;
};

type VideoJob = {
  operation: any;
  status: 'running' | 'ready' | 'failed';
  filePath?: string;
  error?: string;
};

type FallenFamilyDeps = {
  ai: any;
  Type: any;
  generateContentWithFallback: (params: {
    contents: string;
    systemInstruction: string;
    responseSchema: any;
    temperature?: number;
  }) => Promise<{ text: string; modelUsed: string }>;
  parseGeminiError: (error: any) => {
    statusCode: number;
    statusText: string;
    userMessage: string;
  };
  rateLimit: (maxRequests: number, windowMs: number) =>
    (req: Request, res: Response, next: NextFunction) => void;
};

const videoJobs = new Map<string, VideoJob>();

function slug(value: unknown, fallback: string) {
  const result = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return result || fallback;
}

function normalizeCharacters(value: unknown): FamilyCharacter[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 8)
    .map((raw: any, index) => ({
      id: slug(raw?.id || raw?.name, 'character-' + String(index + 1)),
      name: String(raw?.name || '').trim().slice(0, 80),
      role: String(raw?.role || 'Family').trim().slice(0, 80),
      description: String(raw?.description || '').trim().slice(0, 500),
      photoName: raw?.photoName ? String(raw.photoName).slice(0, 200) : undefined,
      photoDataUrl: raw?.photoDataUrl ? String(raw.photoDataUrl) : undefined,
    }))
    .filter((character) => character.name);
}

function fallbackStory(input: {
  premise: string;
  characters: FamilyCharacter[];
  style: string;
}) {
  const lead = input.characters[0];
  const second = input.characters[1] || lead;
  const beats = ['hook', 'setup', 'development', 'turn', 'climax', 'resolution'];
  const titles = [
    'Something Goes Sideways',
    'The Family Has a Plan',
    'The Plan Gets Bigger',
    'The Surprise Problem',
    'Everybody Pitches In',
    'A Very Family Ending',
  ];

  return {
    synopsis: input.premise,
    theme: 'Family, humor, teamwork, and a warm ending.',
    scenes: beats.map((beat, index) => ({
      title: titles[index],
      beat,
      visualPrompt:
        input.style + '. ' + input.premise + ' Scene ' + String(index + 1) + ': ' +
        titles[index] + '. Keep the established family characters visually consistent and family-friendly.',
      action:
        index === 0
          ? lead.name + ' discovers the episode problem.'
          : index === 5
            ? 'The family lands the adventure with a funny, warm final image.'
            : 'The family advances the adventure while the complication grows.',
      durationSec: index === 4 ? 12 : 9,
      dialogue:
        index === 0
          ? [{ speakerId: lead.id, text: 'Okay... this was definitely not the plan.', emotion: 'amused' }]
          : index === 3
            ? [{ speakerId: second.id, text: 'I have an idea. It might be a terrible idea.', emotion: 'playful' }]
            : [],
    })),
  };
}

function imageFromInteraction(interaction: any): { data: string; mimeType: string } | null {
  const direct = interaction?.output_image || interaction?.outputImage;
  if (direct?.data) {
    return {
      data: direct.data,
      mimeType: direct.mime_type || direct.mimeType || 'image/png',
    };
  }

  for (const step of interaction?.steps || []) {
    if (step?.type !== 'model_output') continue;
    for (const item of step?.content || []) {
      if (item?.type === 'image' && item?.data) {
        return {
          data: item.data,
          mimeType: item.mime_type || item.mimeType || 'image/png',
        };
      }
    }
  }

  return null;
}

function parseImageDataUrl(value: unknown) {
  const raw = String(value || '');
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) throw new Error('A valid base64 image data URL is required.');
  if (match[2].length > 4_000_000) {
    throw new Error('Reference image is too large after resizing.');
  }
  return { mimeType: match[1], data: match[2] };
}

export function registerFallenFamilyRoutes(app: Express, deps: FallenFamilyDeps) {
  const { ai, Type, generateContentWithFallback, parseGeminiError, rateLimit } = deps;

  const storySchema = {
    type: Type.OBJECT,
    properties: {
      synopsis: { type: Type.STRING },
      theme: { type: Type.STRING },
      scenes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            beat: { type: Type.STRING },
            visualPrompt: { type: Type.STRING },
            action: { type: Type.STRING },
            durationSec: { type: Type.INTEGER },
            dialogue: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  speakerId: { type: Type.STRING },
                  text: { type: Type.STRING },
                  emotion: { type: Type.STRING },
                },
                required: ['speakerId', 'text'],
              },
            },
          },
          required: ['title', 'beat', 'visualPrompt', 'action', 'durationSec', 'dialogue'],
        },
      },
    },
    required: ['synopsis', 'theme', 'scenes'],
  };

  app.post(
    '/api/fallen/family/episode',
    rateLimit(30, 60 * 60 * 1000),
    async (req: Request, res: Response) => {
      const characters = normalizeCharacters(req.body?.characters);
      const seriesTitle = String(req.body?.seriesTitle || 'Our Family Cartoon').trim().slice(0, 120);
      const episodeTitle = String(req.body?.episodeTitle || 'Episode One').trim().slice(0, 120);
      const premise = String(req.body?.premise || '').trim().slice(0, 4000);
      const style = String(req.body?.style || 'Warm 2D storybook cartoon').trim().slice(0, 300);
      const episodeNumber = Math.max(1, Math.min(999, Number(req.body?.episodeNumber || 1)));

      if (!characters.length || premise.length < 10) {
        res.status(400).json({
          success: false,
          error: 'At least one named character and a clear episode premise are required.',
        });
        return;
      }

      let story: any;
      let storyProvider = 'deterministic-fallback';

      try {
        const cast = characters
          .map((character) =>
            String(character.id) + ': ' + character.name + ' (' + character.role + ') ' +
            (character.description || ''),
          )
          .join('\n');

        const result = await generateContentWithFallback({
          contents:
            'Create a six-scene family-friendly cartoon episode.\n\n' +
            'SERIES: ' + seriesTitle + '\n' +
            'EPISODE: ' + episodeTitle + '\n' +
            'STYLE: ' + style + '\n' +
            'PREMISE: ' + premise + '\n\n' +
            'CAST IDS (speakerId must use only these exact IDs):\n' + cast + '\n\n' +
            'Rules:\n' +
            '- Exactly 6 scenes in this order: hook, setup, development, turn, climax, resolution.\n' +
            '- Preserve the cast descriptions. Do not invent appearance changes.\n' +
            '- Keep humor warm and suitable for a family YouTube cartoon.\n' +
            '- Dialogue should be concise and speakable.\n' +
            '- visualPrompt must describe a single animation shot/sequence without camera jargon overload.\n' +
            '- Do not introduce real-world private facts that were not provided.',
          systemInstruction:
            'You are Fallen Director, Evercraft family-cartoon story department. ' +
            'Build coherent, warm, visually direct episodes with strict recurring-character continuity.',
          responseSchema: storySchema,
          temperature: 0.65,
        });
        story = JSON.parse(result.text);
        storyProvider = result.modelUsed;
      } catch (error) {
        console.warn('Fallen story provider unavailable; using deterministic fallback:', error);
        story = fallbackStory({ premise, characters, style });
      }

      const allowedIds = new Set(characters.map((character) => character.id));
      story.scenes = (Array.isArray(story.scenes) ? story.scenes : [])
        .slice(0, 6)
        .map((scene: any, index: number) => ({
          title: String(scene?.title || 'Scene ' + String(index + 1)).slice(0, 120),
          beat: ['hook', 'setup', 'development', 'turn', 'climax', 'resolution'][index],
          visualPrompt: String(scene?.visualPrompt || '').slice(0, 2500),
          action: String(scene?.action || '').slice(0, 1500),
          durationSec: Math.max(4, Math.min(20, Number(scene?.durationSec || 9))),
          dialogue: (Array.isArray(scene?.dialogue) ? scene.dialogue : [])
            .filter((line: any) => allowedIds.has(String(line?.speakerId || '')))
            .slice(0, 4)
            .map((line: any) => ({
              speakerId: String(line.speakerId),
              text: String(line.text || '').slice(0, 500),
              emotion: String(line.emotion || '').slice(0, 80),
            })),
        }));

      while (story.scenes.length < 6) {
        const fallback = fallbackStory({ premise, characters, style }).scenes[story.scenes.length];
        story.scenes.push(fallback);
      }

      const seriesId = slug(seriesTitle, 'family-cartoon');
      const episodeId =
        seriesId + '-ep-' + String(episodeNumber).padStart(3, '0');

      const bible: SeriesBible = {
        schema: 'evercraft.fallen.series-bible.v1',
        id: seriesId,
        title: seriesTitle,
        logline: String(story.synopsis || premise).slice(0, 800),
        styleRules: [
          style,
          'Preserve approved character identity and recognizable reference traits across every scene.',
          'Family-friendly tone. No silent redesigns between scenes or episodes.',
        ],
        entities: characters.map((character) => ({
          id: character.id!,
          kind: 'character',
          name: character.name,
          description: [character.role, character.description].filter(Boolean).join('. '),
          immutableTraits: { family_role: character.role || 'Family' },
          voiceProfileId: 'fallen-voice-' + character.id + '-v1',
          referenceAssetIds: ['ref-' + character.id],
        })),
        canon: [],
      };

      const dialogue = story.scenes.flatMap((scene: any, sceneIndex: number) =>
        scene.dialogue.map((line: any, lineIndex: number) => ({
          id:
            'scene-' + String(sceneIndex + 1) + '-line-' + String(lineIndex + 1),
          speakerId: line.speakerId,
          text: line.text,
          emotion: line.emotion,
        })),
      );

      const totalDuration = story.scenes.reduce(
        (sum: number, scene: any) => sum + scene.durationSec,
        0,
      );

      const project: MediaProject = {
        id: episodeId,
        title: episodeTitle,
        brief: {
          prompt: premise + '\n\nAnimation style: ' + style,
          format: 'episode',
          durationSec: Math.max(45, Math.min(600, totalDuration)),
          aspectRatio: '16:9',
          style,
          seriesId,
          episodeId,
          episodeNumber,
          dialogue,
          continuityClaims: characters.map((character) => ({
            subjectId: character.id!,
            key: 'family_role',
            value: character.role || 'Family',
          })),
        },
        assets: characters.map((character) => ({
          id: 'ref-' + character.id,
          path: 'upload://fallen-family/' + character.id,
          kind: 'image',
          rights: 'owned',
          tags: ['character', 'reference', 'family-cartoon'],
          notes: character.description,
          entityRefs: [character.id!],
        })),
      };

      try {
        const seriesPlan = compileSeriesEpisode(project, bible);
        res.json({
          success: true,
          data: {
            story: {
              synopsis: String(story.synopsis || premise),
              theme: String(story.theme || 'Family adventure'),
              scenes: story.scenes,
            },
            bible,
            seriesPlan,
            provider: {
              story: storyProvider,
              images: 'gemini-3.1-flash-image',
              video: 'veo-3.1-generate-preview',
            },
          },
        });
      } catch (error) {
        console.error('Fallen episode compilation failed:', error);
        res.status(422).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Fallen could not compile the series episode.',
        });
      }
    },
  );

  app.post(
    '/api/fallen/family/character-sheet',
    rateLimit(12, 60 * 60 * 1000),
    async (req: Request, res: Response) => {
      if (req.body?.consent !== true) {
        res.status(400).json({
          success: false,
          error: 'Reference-photo provider consent is required.',
        });
        return;
      }

      const characters = normalizeCharacters(req.body?.characters).filter(
        (character) => character.photoDataUrl,
      );
      const style = String(req.body?.style || 'Warm 2D storybook cartoon').slice(0, 300);
      const seriesTitle = String(req.body?.seriesTitle || 'Family Cartoon').slice(0, 120);

      if (!characters.length) {
        res.status(400).json({
          success: false,
          error: 'At least one character reference photo is required.',
        });
        return;
      }

      try {
        const input: any[] = [{
          type: 'text',
          text:
            'Create one clean 16:9 animation character lineup for "' + seriesTitle + '". ' +
            'Style: ' + style + '. Use the supplied photos only as identity/reference material. ' +
            'Keep each person recognizable while translating them into one coherent family-friendly cartoon style. ' +
            'Show full-body or three-quarter designs side by side on a simple neutral production-sheet background. ' +
            'Do not add extra people. Do not include text labels inside the image.',
        }];

        for (const character of characters) {
          const parsed = parseImageDataUrl(character.photoDataUrl);
          input.push({
            type: 'text',
            text:
              'Reference for ' + character.name + ', role: ' + character.role + '. ' +
              (character.description || ''),
          });
          input.push({
            type: 'image',
            mime_type: parsed.mimeType,
            data: parsed.data,
          });
        }

        const interaction = await ai.interactions.create({
          model: 'gemini-3.1-flash-image',
          input,
          response_format: {
            type: 'image',
            mime_type: 'image/png',
            aspect_ratio: '16:9',
          },
        });

        const image = imageFromInteraction(interaction);
        if (!image) throw new Error('The image department returned no image.');

        res.json({
          success: true,
          imageDataUrl: 'data:' + image.mimeType + ';base64,' + image.data,
          provider: 'gemini-3.1-flash-image',
          evidenceState: 'provider-returned-not-yet-identity-verified',
        });
      } catch (error: any) {
        console.error('Fallen character sheet generation failed:', error);
        const parsed = parseGeminiError(error);
        res
          .status(
            parsed.statusCode >= 400 && parsed.statusCode < 600
              ? parsed.statusCode
              : 503,
          )
          .json({
            success: false,
            error: parsed.userMessage,
            code: parsed.statusCode,
          });
      }
    },
  );

  app.post(
    '/api/fallen/family/scene-image',
    rateLimit(18, 60 * 60 * 1000),
    async (req: Request, res: Response) => {
      if (req.body?.consent !== true) {
        res.status(400).json({
          success: false,
          error: 'Generation-provider consent is required.',
        });
        return;
      }

      const scene = req.body?.scene || {};
      const style = String(req.body?.style || 'Warm 2D storybook cartoon').slice(0, 300);

      try {
        const input: any[] = [{
          type: 'text',
          text:
            'Create a polished 16:9 animation keyframe. Style: ' + style + '. ' +
            'Scene: ' + String(scene?.title || '') + '. ' +
            'Action: ' + String(scene?.action || '') + '. ' +
            'Visual direction: ' + String(scene?.visualPrompt || '') + '. ' +
            'Preserve the supplied character-sheet identities exactly. ' +
            'Family-friendly, cinematic composition, no captions, no embedded text.',
        }];

        if (req.body?.characterSheetDataUrl) {
          const parsed = parseImageDataUrl(req.body.characterSheetDataUrl);
          input.push({
            type: 'image',
            mime_type: parsed.mimeType,
            data: parsed.data,
          });
        }

        const interaction = await ai.interactions.create({
          model: 'gemini-3.1-flash-image',
          input,
          response_format: {
            type: 'image',
            mime_type: 'image/png',
            aspect_ratio: '16:9',
          },
        });

        const image = imageFromInteraction(interaction);
        if (!image) throw new Error('The image department returned no image.');

        res.json({
          success: true,
          imageDataUrl: 'data:' + image.mimeType + ';base64,' + image.data,
          provider: 'gemini-3.1-flash-image',
          evidenceState: 'provider-returned-not-yet-identity-verified',
        });
      } catch (error: any) {
        console.error('Fallen scene image generation failed:', error);
        const parsed = parseGeminiError(error);
        res
          .status(
            parsed.statusCode >= 400 && parsed.statusCode < 600
              ? parsed.statusCode
              : 503,
          )
          .json({
            success: false,
            error: parsed.userMessage,
            code: parsed.statusCode,
          });
      }
    },
  );

  app.post(
    '/api/fallen/family/video/start',
    rateLimit(6, 60 * 60 * 1000),
    async (req: Request, res: Response) => {
      if (req.body?.consent !== true) {
        res.status(400).json({
          success: false,
          error: 'Generation-provider consent is required.',
        });
        return;
      }

      try {
        const parsedImage = parseImageDataUrl(req.body?.imageDataUrl);
        const scene = req.body?.scene || {};
        const style = String(req.body?.style || 'Family-friendly animation').slice(0, 300);
        const prompt =
          style + '. Animate this approved keyframe into a short family-cartoon shot. ' +
          'Scene: ' + String(scene?.title || '') + '. ' +
          'Action: ' + String(scene?.action || '') + '. ' +
          'Preserve character identity, clothing, proportions, and the established art style. ' +
          'Natural motion, no captions, no new characters.';

        const operation = await ai.models.generateVideos({
          model: 'veo-3.1-generate-preview',
          prompt,
          image: {
            imageBytes: parsedImage.data,
            mimeType: parsedImage.mimeType,
          },
          config: {
            aspectRatio: req.body?.aspectRatio === '9:16' ? '9:16' : '16:9',
            numberOfVideos: 1,
            resolution: '720p',
          },
        });

        const jobId = crypto.randomUUID();
        videoJobs.set(jobId, { operation, status: 'running' });

        res.status(202).json({
          success: true,
          jobId,
          status: 'running',
          provider: 'veo-3.1-generate-preview',
        });
      } catch (error: any) {
        console.error('Fallen pilot video start failed:', error);
        const parsed = parseGeminiError(error);
        res
          .status(
            parsed.statusCode >= 400 && parsed.statusCode < 600
              ? parsed.statusCode
              : 503,
          )
          .json({
            success: false,
            error: parsed.userMessage,
            code: parsed.statusCode,
          });
      }
    },
  );

  app.get(
    '/api/fallen/family/video/:jobId',
    rateLimit(240, 60 * 60 * 1000),
    async (req: Request, res: Response) => {
      const jobId = String(req.params.jobId || '');
      const job = videoJobs.get(jobId);

      if (!job) {
        res.status(404).json({
          success: false,
          status: 'failed',
          error: 'Unknown or expired Fallen video job.',
        });
        return;
      }

      if (job.status === 'ready') {
        res.json({
          success: true,
          status: 'ready',
          videoUrl: '/api/fallen/family/video-file/' + jobId,
        });
        return;
      }

      if (job.status === 'failed') {
        res.status(500).json({
          success: false,
          status: 'failed',
          error: job.error || 'Video generation failed.',
        });
        return;
      }

      try {
        job.operation = await ai.operations.getVideosOperation({
          operation: job.operation,
        });

        if (!job.operation?.done) {
          res.json({ success: true, status: 'running' });
          return;
        }

        const video =
          job.operation?.response?.generatedVideos?.[0]?.video ||
          job.operation?.response?.generated_videos?.[0]?.video;

        if (!video) {
          throw new Error('Video operation completed without a downloadable video.');
        }

        const filePath = path.join(os.tmpdir(), 'fallen-' + jobId + '.mp4');
        await ai.files.download({ file: video, downloadPath: filePath });

        job.filePath = filePath;
        job.status = 'ready';

        const cleanup = setTimeout(() => {
          try {
            if (job.filePath) fs.rmSync(job.filePath, { force: true });
          } catch {}
          videoJobs.delete(jobId);
        }, 60 * 60 * 1000);

        if (typeof cleanup.unref === 'function') cleanup.unref();

        res.json({
          success: true,
          status: 'ready',
          videoUrl: '/api/fallen/family/video-file/' + jobId,
        });
      } catch (error: any) {
        job.status = 'failed';
        job.error = error?.message || String(error);
        console.error('Fallen pilot video poll failed:', error);
        res.status(500).json({
          success: false,
          status: 'failed',
          error: job.error,
        });
      }
    },
  );

  app.get(
    '/api/fallen/family/video-file/:jobId',
    (req: Request, res: Response) => {
      const job = videoJobs.get(String(req.params.jobId || ''));

      if (!job?.filePath || job.status !== 'ready' || !fs.existsSync(job.filePath)) {
        res.status(404).type('text/plain').send('Fallen video is unavailable or expired.');
        return;
      }

      res.setHeader('Cache-Control', 'private, no-store');
      res.type('video/mp4');
      res.sendFile(job.filePath);
    },
  );
}
