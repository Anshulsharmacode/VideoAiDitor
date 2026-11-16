# Edit-plan workflow (transcript → LLM → render bindings)

Status: planning. Nothing in this doc is built yet except the pieces marked **(exists)**.

## Where things actually stand today

- Storage: MongoDB (`users`, `teams`, `projects`, `media`, `videoTemplates`, `subscriptions`,
  `creditTransactions`). No `jobs`/queue collection — there is no BullMQ/Redis in this repo.
- Media upload: `MediaService.uploadAndRegister` **(exists)** writes the raw file to local disk
  (`common/storage/storage.ts`) and creates a `media` row. No proxy/low-res copy is generated.
- Transcription: `common/media-processing/whisper.service.ts` **(exists)** — in-process Node,
  via `@huggingface/transformers` (ONNX whisper, CPU). Not a Python sidecar, not an external API.
- Background removal: `common/media-processing/background-removal.service.ts` **(exists)** —
  in-process Node, via `@tensorflow/tfjs-node` + `body-pix`, ffmpeg for frame I/O.
- Templates: `common/template-render.ts` + `videoTemplates` collection **(exists)** — a template
  is a list of `TemplateLayer`s; `TemplateRenderer.render(bindings)` fills them with concrete
  values (video trims, whisper words, etc.) for a given point in time. This is the renderer side
  of "the JSON is the project file" — it's already in place, it just has nothing feeding it yet.
- Rendering to an actual output file (Remotion or ffmpeg composition) is **not built**. Today
  `template-render.ts` only produces the data a renderer would consume.
- Nothing calls an LLM anywhere in the repo yet. `src/restapi/core/llm.ts` and
  `src/restapi/core/plan.ts` exist as empty placeholder files — this doc is the plan for what
  goes in them.

## The pipeline this doc plans

```
media upload (exists)
   -> WhisperService.transcribe (exists)           words: [{word, start, end}]
   -> core/plan.ts: buildEditPlan(...)              calls core/llm.ts, validates with
                                                     common/edit-plan/schema.ts (exists)
   -> persist the EditPlan (new: on the project or a new collection, see below)
   -> template-render.ts TemplateRenderer.render(bindings from EditPlan)   (exists, unwired)
   -> [not built] actual video render (ffmpeg/Remotion) from the rendered layers
```

Background removal is a separate, optional pre-step on a specific media item (e.g. "cut out the
presenter"), not part of the main transcript→plan chain — it produces a `.mov` with alpha that
becomes a video-slot binding, same as any other uploaded media.

## `core/llm.ts` — provider-agnostic model client

One function, `resolveModel()`, returns an `ai` SDK `LanguageModel` based on env vars:

- `LLM_PROVIDER` (default `google`) — add a `case` here per provider; start with Gemini via
  `@ai-sdk/google` since that's the preferred default, no other provider wired yet.
- `LLM_MODEL` (default `gemini-2.5-flash`).

Nothing else lives here. Call sites never import `@ai-sdk/google` directly — only `core/llm.ts`
does — so adding Claude/GPT later is a new `case`, not a change at every call site.

## `core/plan.ts` — the actual planning logic

One function: `generateEditPlan({ templateId, sourceMediaId, durationMs, words })`.

- Builds a compact transcript string from `words` (`[startMs-endMs] word`, matching
  `TranscribedWord` from `whisper.service.ts`).
- Calls `generateObject` (from the `ai` package) with:
  - `model: resolveModel()` from `core/llm.ts`
  - `schema`: the existing `editPlanSchema` from `common/edit-plan/schema.ts`, minus
    `version`/`templateId`/`sourceMediaId`/`durationMs` (those are known already, not something
    to ask the model to invent)
  - a system prompt describing the cuts/captions/overlays contract (filler/silence cuts,
    caption grouping, title/chapter/broll overlays), with the hard constraint that timestamps
    must stay inside `[0, durationMs]` and the model must not invent words not in the transcript.
- Re-attaches the known fields and returns a full `EditPlan`, already schema-valid because
  `generateObject` enforces the JSON schema on the way out.
- On failure (bad model output, network, rate limit), throw — caller decides retry policy. Start
  with **one retry, no queue** (see Open questions).

## Persisting the plan

Simplest option that fits the current schema style: add an `editPlan: EditPlan | null` field to
the `projects` collection (projects already map 1:1 to "a video being produced"), rather than a
new collection. Revisit a separate `editPlans` collection only if a project ever needs more than
one plan (e.g. regenerate-and-compare).

## Wiring into `restapi`

Not building endpoints yet per your last instruction (plan first). When we do:

- `POST /api/v1/teams/:teamId/projects/:projectId/edit-plan` — body: `{ sourceMediaId }`.
  Looks up the media, runs it through `WhisperService` if not already transcribed, then
  `core/plan.ts`'s `generateEditPlan`, saves to the project, returns the plan.
- `PUT` on the same route to let the user hand-edit the plan afterward (validated with
  `safeParseEditPlan`, same as the old Readme's "auto-save the JSON" idea).

## Env vars this introduces

```
LLM_PROVIDER=google
LLM_MODEL=gemini-2.5-flash
GOOGLE_GENERATIVE_AI_API_KEY=...
```

## Decisions for the three questions above (defaults — say if you want different)

1. **Sync, no queue, for now.** Whisper + one LLM call for a few minutes of video is seconds.
   Add BullMQ/Redis only once a real render step (below) makes a request take minutes, not before.
2. **One retry** on a schema-invalid response (re-send the same prompt once), then fail with a
   clear error and let the user hit "regenerate" — no silent infinite retry loop.
3. **Background removal stays manual and separate.** It's a transform on one `media` item
   (`POST .../media/:id/remove-background` → new media row), not something `core/plan.ts` decides
   to invoke. The LLM never triggers processing, it only plans timing/text.

## Labeling the video: the part that's actually missing

Important distinction: `TemplateRenderer.render()` **(exists)** only produces *data* — which
layer is active at time `t`, with what text/trim. It draws nothing. There is currently no code
anywhere that turns that into actual video pixels. That's "labeling the video" — burning the
captions/overlays from the `EditPlan` + template onto the real frames — and it doesn't exist yet.

Two ways to build it, given everything else here is already Node-only, ffmpeg-for-I/O, no Python:

| Approach | How | Fit for this project |
|---|---|---|
| **A. ffmpeg filter graph** | Generate a `drawtext`/`overlay`/`crop` filter chain per layer, each gated by `enable='between(t,startMs/1000,endMs/1000)'`, from the `RenderedTemplate`. One ffmpeg process does cut+caption+overlay+encode in one pass. | Fast, no extra deps, but per-word caption animation (word-pop scale, karaoke color-sweep) is awkward/limited in `drawtext` — you're fighting ffmpeg's expression language for anything beyond "text appears/disappears". |
| **B. Frame-by-frame canvas compositor** | Reuse the exact pattern `background-removal.service.ts` already uses: decode frames via ffmpeg, draw each frame with `@napi-rs/canvas` (background, video-slot frame cropped/scaled by `fit`, captions styled per `animation` — word-pop/karaoke/none —, image/text layers), pipe raw frames back into ffmpeg to encode + mux audio. | Matches `TemplateCaptionStyle.animation` exactly (full control over per-word styling/position), reuses `ffmpeg.util.ts` helpers already written. Heavier per-frame CPU cost than (A), but videos here are short-form/talking-head, not feature-length.

Recommendation: **B**, same reasoning as choosing tfjs-node/transformers.js over a Python
sidecar — it's the option that actually satisfies what the schema already promises
(`word-pop`/`karaoke` animations), not a cheaper option that only approximates it.

This would live as `common/render/compositor.ts` (the per-frame draw logic, taking a
`RenderedTemplate` + a `tMs` and returning a drawn canvas) plus a `render.service.ts` that drives
it frame-by-frame using `decodeFramesRgb24`/an audio-muxing encoder, analogous to
`BackgroundRemovalService`.

### Cuts (removing filler/silence)

The `EditPlan.cuts` ranges need to be *removed*, not drawn — so the compositor must map "output
frame time" to "source time with cut ranges skipped" before calling `TemplateRenderer`, rather
than literally cutting/concatenating files. One pass, no separate trim+concat step.

## Decided

- **Render approach: B, the canvas compositor.** Matches the schema's `word-pop`/`karaoke`
  animations exactly; reuses the `ffmpeg.util.ts` pipe pattern already written.
- **Priority: render to a real `.mp4` now**, not JSON-only pending a future frontend. Build order:
  `core/llm.ts` → `core/plan.ts` → persist `EditPlan` on `projects` → `common/render/` compositor.
- Audio: remap the voice track through the same cut ranges as video, in the same encoder pass
  (parallel PCM stream muxed alongside the composited video frames), so sync is automatic rather
  than something a separate `atrim`/`concat` step could drift from.

## Build order (next steps)

1. `src/restapi/core/llm.ts` — `resolveModel()` (done in this doc's design, not yet coded).
2. `src/restapi/core/plan.ts` — `generateEditPlan(...)` (ditto).
3. Persist: add `editPlan: EditPlan | null` to the `projects` collection.
4. `common/render/compositor.ts` — pure function: `(renderedTemplate, tMs) => frame (RGBA buffer)`.
5. `common/render/render.service.ts` — drives the compositor frame-by-frame over the cut-remapped
   timeline, pipes frames + remapped audio PCM into an ffmpeg encoder (mux to `.mp4`), mirroring
   `BackgroundRemovalService`'s structure.
6. Wire a `POST .../projects/:id/render` endpoint once 1-5 work end to end on one test project.
