import { generateObject } from 'ai';
import { resolveModel } from './llm.js';
import { editPlanSchema, type EditPlan } from '../../common/edit-plan/index.js';
import type { TranscribedWord } from '../../common/media-processing/whisper.service.js';

const SYSTEM_PROMPT = `You are a video-editing assistant. Given a transcript (word-level
timestamps, in milliseconds) and the source video's duration, produce an edit plan: cuts to
remove filler words/silences, captions grouped into natural phrases from the transcript words,
and optional overlays (title/chapter/broll-marker) at moments that deserve emphasis. All
startMs/endMs must stay within [0, durationMs] and endMs must be greater than startMs for every
item. Do not invent words that are not in the transcript — every caption word must come from it.`;

const editPlanContentSchema = editPlanSchema.omit({
  version: true,
  templateId: true,
  sourceMediaId: true,
  durationMs: true,
});

export interface GenerateEditPlanParams {
  templateId: string;
  sourceMediaId: string;
  durationMs: number;
  words: TranscribedWord[];
}

/**
 * Turns a word-timestamp transcript into a schema-valid EditPlan. One retry
 * on a bad/garbled response (re-send the same prompt once), then throw —
 * caller surfaces a "regenerate" action rather than retrying forever.
 */
export async function generateEditPlan(params: GenerateEditPlanParams): Promise<EditPlan> {
  const { templateId, sourceMediaId, durationMs, words } = params;
  const transcript = words
    .map((w) => `[${Math.round(w.start * 1000)}-${Math.round(w.end * 1000)}] ${w.word}`)
    .join(' ');

  const prompt = `durationMs: ${durationMs}\ntranscript: ${transcript}`;
  const model = resolveModel();

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { object } = await generateObject({
        model,
        schema: editPlanContentSchema,
        system: SYSTEM_PROMPT,
        prompt,
      });
      return { version: 1, templateId, sourceMediaId, durationMs, ...object };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Edit-plan generation failed after retry: ${(lastError as Error)?.message}`);
}
