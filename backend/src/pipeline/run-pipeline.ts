import type { Db } from 'mongodb';
import { getCollections } from '../common/mongodb/collections.js';
import { readFile } from '../common/storage/storage.js';
import { parseEditPlan } from '../common/edit-plan/schema.js';
import type {
  EditPlan,
  EditPlanCaption,
  EditPlanCut,
} from '../common/edit-plan/types.js';
import type { MediaDocument } from '../common/mongodb/schemas/media.schema.js';
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
    const words = await transcribeMedia(media);
    if (await isCancelled()) return void (await fail('cancelled'));

    await setStage('cuts');
    const cuts = detectCuts(words);
    if (await isCancelled()) return void (await fail('cancelled'));

    await setStage('captions');
    const captions = generateCaptions(words);
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

interface WordsResponse {
  words?: Array<{ word: string; start: number; end: number }>;
}

function toTranscriptWords(result: WordsResponse): TranscriptWord[] {
  return (result.words ?? []).map((word) => ({
    text: word.word.trim(),
    startMs: Math.round(word.start * 1000),
    endMs: Math.round(word.end * 1000),
  }));
}

/**
 * Dispatches to whichever provider is configured — matches
 * backend-architecture.md's "Groq/Gemini keys or local Whisper URL" config
 * row. Defaults to the free, self-hosted local server (scripts/whisper_server.py)
 * so nothing costs money until TRANSCRIPTION_PROVIDER is explicitly set to
 * "groq".
 */
async function transcribeMedia(media: MediaDocument): Promise<TranscriptWord[]> {
  const provider = process.env.TRANSCRIPTION_PROVIDER ?? 'local';
  if (provider === 'groq') return transcribeWithGroq(media);
  return transcribeWithLocalWhisper(media);
}

/**
 * scripts/whisper_server.py — a faster-whisper (CPU, int8) wrapper run as a
 * separate local process. Free, no API key, no network dependency.
 */
async function transcribeWithLocalWhisper(media: MediaDocument): Promise<TranscriptWord[]> {
  const url = process.env.WHISPER_LOCAL_URL ?? 'http://127.0.0.1:8090/transcribe';

  const audio = await readFile(media.storageKey);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: media.mimeType }), media.originalFilename);

  const response = await fetch(url, { method: 'POST', body: form });
  if (!response.ok) {
    throw new Error(
      `Local whisper transcription failed (${response.status}): ${await response.text()}. ` +
        'Is scripts/whisper_server.py running?',
    );
  }

  return toTranscriptWords((await response.json()) as WordsResponse);
}

/**
 * Groq's hosted Whisper endpoint — free tier available, but still an
 * external network dependency and API key. Opt in with
 * TRANSCRIPTION_PROVIDER=groq.
 */
async function transcribeWithGroq(media: MediaDocument): Promise<TranscriptWord[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const audio = await readFile(media.storageKey);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: media.mimeType }), media.originalFilename);
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Groq transcription failed (${response.status}): ${await response.text()}`);
  }

  return toTranscriptWords((await response.json()) as WordsResponse);
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
