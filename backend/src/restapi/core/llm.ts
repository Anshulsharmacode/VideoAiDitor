import type { LanguageModel } from 'ai';
import { google } from '@ai-sdk/google';

/**
 * Single place that knows about LLM providers. Call sites (core/plan.ts)
 * never import a provider package directly — adding Claude/GPT later is a
 * new `case` here, not a change at every call site. Swappable without a
 * code change via LLM_PROVIDER/LLM_MODEL env vars.
 */
export function resolveModel(): LanguageModel {
  const provider = process.env.LLM_PROVIDER ?? 'google';
  const modelId = process.env.LLM_MODEL ?? 'gemini-2.5-flash';

  switch (provider) {
    case 'google':
      return google(modelId);
    default:
      throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
  }
}
