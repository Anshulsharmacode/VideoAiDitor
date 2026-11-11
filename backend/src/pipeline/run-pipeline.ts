import type { Db } from 'mongodb';
import { getCollections } from '../common/mongodb/collections.js';
import { parseEditPlan } from '../common/edit-plan/schema.js';
import type {
  EditPlan,
  EditPlanCaption,
  EditPlanCut,
  EditPlanSticker,
} from '../common/edit-plan/types.js';
import type { MediaDocument } from '../common/mongodb/schemas/media.schema.js';
import type { StickerDocument } from '../common/mongodb/schemas/sticker.schema.js';
import type { StyleDocument } from '../common/mongodb/schemas/style.schema.js';
import type { PipelineStage } from '../common/mongodb/schemas/job.schema.js';

export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface RunPipelineParams {
  jobId: string;
  teamId: string;
  projectId: string;
  mediaId: string;
}

export async function runPipeline(
  db: Db,
  params: RunPipelineParams,
): Promise<void> {
  const collections = getCollections(db);
  const { jobId, teamId, projectId, mediaId } = params;

  const setStage = (stage: PipelineStage) =>
    collections.jobs.updateOne(
      { _id: jobId },
      { $set: { stage, updatedAt: new Date() } },
    );

  const isCancelled = async (): Promise<boolean> => {
    const job = await collections.jobs.findOne({ _id: jobId });
    return job?.cancelRequested === true;
  };

  const fail = (error: string) =>
    collections.jobs.updateOne(
      { _id: jobId },
      { $set: { status: 'failed', error, updatedAt: new Date() } },
    );

  try {
    await setStage('prepare');
    const media = await prepareMedia(collections.media, mediaId);
    if (await isCancelled()) return void (await fail('cancelled'));

    await setStage('transcribe');
    const words = transcribeMedia(media);
    if (await isCancelled()) return void (await fail('cancelled'));

    await setStage('cuts');
    const cuts = detectCuts(words);
    if (await isCancelled()) return void (await fail('cancelled'));

    await setStage('captions');
    const captions = generateCaptions(words);
    if (await isCancelled()) return void (await fail('cancelled'));

    await setStage('stickers');
    const stickerCatalog = await collections.stickers.find().toArray();
    const stickers = classifyStickers(words, stickerCatalog);
    if (await isCancelled()) return void (await fail('cancelled'));

    await setStage('template');
    const styleCatalog = await collections.styles.find().toArray();
    const templateId = pickTemplate(words, styleCatalog);
    if (await isCancelled()) return void (await fail('cancelled'));

    await setStage('save');
    const plan: EditPlan = {
      version: 1,
      templateId,
      sourceMediaId: mediaId,
      durationMs: media.durationMs ?? lastWordEndMs(words),
      cuts,
      captions,
      stickers,
      overlays: [],
    };
    const validatedPlan = parseEditPlan(plan);

    const now = new Date();
    await collections.editorStates.updateOne(
      { _id: projectId },
      {
        $set: {
          projectId,
          timeline: validatedPlan,
          updatedBy: teamId,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: projectId,
          version: 1,
          settings: {
            resolution: { width: 1080, height: 1920 },
            aspectRatio: '9:16',
            frameRate: 30,
          },
          createdAt: now,
        },
      },
      { upsert: true },
    );

    await collections.jobs.updateOne(
      { _id: jobId },
      { $set: { status: 'completed', updatedAt: new Date() } },
    );
  } catch (error) {
    await fail(
      error instanceof Error ? error.message : 'Unknown pipeline error',
    );
  }
}

async function prepareMedia(
  mediaCollection: ReturnType<typeof getCollections>['media'],
  mediaId: string,
): Promise<MediaDocument> {
  const media = await mediaCollection.findOne({ _id: mediaId });
  if (!media) throw new Error(`Media ${mediaId} not found`);
  if (media.status !== 'ready')
    throw new Error(`Media ${mediaId} is not ready (status: ${media.status})`);
  return media;
}

function transcribeMedia(_media: MediaDocument): TranscriptWord[] {
  return [
    { text: 'This', startMs: 0, endMs: 300 },
    { text: 'is', startMs: 300, endMs: 500 },
    { text: 'a', startMs: 500, endMs: 600 },
    { text: 'placeholder', startMs: 600, endMs: 1200 },
    { text: 'transcript.', startMs: 1200, endMs: 1800 },
  ];
}

function detectCuts(_words: TranscriptWord[]): EditPlanCut[] {
  return [];
}

function generateCaptions(words: TranscriptWord[]): EditPlanCaption[] {
  if (words.length === 0) return [];
  return [
    {
      id: 'caption-1',
      startMs: words[0].startMs,
      endMs: words[words.length - 1].endMs,
      text: words.map((word) => word.text).join(' '),
      words,
    },
  ];
}

function classifyStickers(
  _words: TranscriptWord[],
  _stickerCatalog: StickerDocument[],
): EditPlanSticker[] {
  return [];
}

function pickTemplate(
  _words: TranscriptWord[],
  styleCatalog: StyleDocument[],
): string {
  const [firstStyle] = styleCatalog;
  if (!firstStyle) throw new Error('No styles seeded; cannot pick a template');
  return firstStyle._id;
}

function lastWordEndMs(words: TranscriptWord[]): number {
  return words.length > 0 ? words[words.length - 1].endMs : 0;
}
