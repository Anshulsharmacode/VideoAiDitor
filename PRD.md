# VideoAiDitor PRD: AI auto-edit + manual editor

## Problem

Creators have raw footage but lack the time or skill to add captions, pick a
visual style, and place relevant stickers/emoji. Manual editing in
general-purpose tools is slow; fully-automatic tools give no control over the
result. VideoAiDitor's goal is to do the first pass automatically, then hand
the user a normal editor to fix or change anything.

## Target user

Short-form content creators (Shorts/Reels/TikTok-style clips, podcast clips,
talking-head videos) who want a polished, captioned, styled video fast, with
the ability to tweak the result before publishing.

## User journey

1. **Upload** a raw video.
2. **Auto-edit (AI)**: the system transcribes the audio, auto-generates
   captions with word-level timing, auto-selects a visual template, and
   auto-places relevant stickers/emoji based on what's being said. It also
   suggests cuts for filler words and silence.
3. **Edit (manual)**: the user opens the result in an editor that shows the
   AI's draft already applied. They can change anything — caption text,
   timing, or style; swap the template; move, add, or remove stickers;
   accept/reject suggested cuts.
4. **Export**: the user renders the final video using whatever they ended up
   with, whether untouched AI output or fully hand-edited.

## In scope (this phase)

- Transcription with word-level timestamps.
- Auto-captioning with karaoke-style active-word highlight.
- A seeded catalog of hand-authored visual templates (caption style, color
  theme, pacing) — not user- or AI-created templates yet.
- A static, bundled sticker/emoji library, AI-selected by keyword/sentiment
  matching against the transcript — not AI-generated sticker images.
- Filler-word and silence auto-trim suggestions.
- A full manual editor (Remotion Player-based) that can override every
  decision the AI made.
- Versioned saves and export rendering via the render service.

## Explicitly out of scope (this phase)

- A template-builder UI. Templates are authored as JSON and seeded directly
  into the catalog by the team.
- AI-generated custom sticker/image assets. Stickers come only from the
  bundled static library.
- Auto background music selection, auto b-roll footage sourcing, and auto
  vertical reframing. These are tracked as future additions — the edit-plan
  schema's `overlays` field is deliberately left extensible so they can be
  added later without a format change.

## Success criteria

- A user can upload a video and get a watchable auto-edited draft — with
  captions, a template, and at least one relevant sticker — without touching
  the editor.
- Every field the AI sets (caption text/timing, sticker placement, template
  choice) is editable in the editor using the exact same data the AI wrote.
  There are no "AI-only" fields the editor can't reach.
- The editor's live preview and the final exported render are visually
  identical, because both consume the same `EditPlan` document and the same
  Remotion composition code.

## Related docs

- `schema.md` — database schema, including the `styles` and `stickers`
  catalogs, and the `EditPlan` JSON contract (under `editor_states`) shared
  by the pipeline, editor, and render service.
- `backend-architecture.md` — service boundaries and request flows this
  feature slots into.
