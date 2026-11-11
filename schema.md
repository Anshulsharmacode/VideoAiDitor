# VideoAiDitor Database Schema

Proposed relational schema: each project belongs to a team, owned by one user (`teams.owner_id`). A personal workspace is a team with one owner.

## Conventions

- Use UUIDs for IDs and UTC timestamps.
- Store password hashes, never plain passwords.
- Store video files on local disk for now (see `backend-architecture.md`'s Local storage layout); `storage_key` is a path relative to `STORAGE_ROOT`. Swapping to S3/R2 later only changes the storage adapter, not this field.
- Validate status and role values with database constraints or enums.

## users

| Field         | Type      | Notes                                |
| ------------- | --------- | ------------------------------------ |
| id            | UUID      | Primary key                          |
| name          | text      | Display name                         |
| email         | text      | Required; unique after normalization |
| password_hash | text      | Password authentication hash         |
| status        | text      | active, suspended, deleted           |
| created_at    | timestamp | Creation time                        |
| updated_at    | timestamp | Last update time                     |

## teams

| Field      | Type      | Notes                                           |
| ---------- | --------- | ----------------------------------------------- |
| id         | UUID      | Primary key                                     |
| name       | text      | Team or workspace name                          |
| owner_id   | UUID      | References users.id; must also be a team member |
| created_at | timestamp | Creation time                                   |
| updated_at | timestamp | Last update time                                |

## projects

| Field      | Type      | Notes                     |
| ---------- | --------- | ------------------------- |
| id         | UUID      | Primary key               |
| team_id    | UUID      | References teams.id       |
| created_by | UUID      | References users.id       |
| name       | text      | Project name              |
| status     | text      | active, archived, deleted |
| created_at | timestamp | Creation time             |
| updated_at | timestamp | Last update time          |

Control project access through team membership and role.

## media

| Field             | Type      | Notes                                                                                                                                            |
| ----------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| id                | UUID      | Primary key                                                                                                                                      |
| project_id        | UUID      | References projects.id                                                                                                                           |
| uploaded_by       | UUID      | References users.id                                                                                                                              |
| storage_key       | text      | Path relative to `STORAGE_ROOT` on local disk for now, e.g. `uploads/{teamId}/{mediaId}/original.mp4`; same shape as a future object-storage key |
| original_filename | text      | Original filename                                                                                                                                |
| type              | text      | video, audio, image                                                                                                                              |
| mime_type         | text      | File content type                                                                                                                                |
| size_bytes        | bigint    | Nonnegative file size                                                                                                                            |
| duration_ms       | bigint    | Nullable for images or before metadata extraction                                                                                                |
| status            | text      | uploading, processing, ready, failed                                                                                                             |
| created_at        | timestamp | Creation time                                                                                                                                    |
| updated_at        | timestamp | Last update time                                                                                                                                 |

A project can contain multiple media files.

## editor_states

| Field         | Type      | Notes                                                                                                     |
| ------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| project_id    | UUID      | Primary key; references projects.id                                                                       |
| timeline_json | JSON      | The edit plan: tracks, clips, cuts, captions, stickers, overlays, and media references. See schema below. |
| settings_json | JSON      | Resolution, aspect ratio, frame rate, and other editor settings                                           |
| version       | integer   | Starts at 1; increment on each save for conflict detection                                                |
| updated_by    | UUID      | References users.id                                                                                       |
| created_at    | timestamp | First save time                                                                                           |
| updated_at    | timestamp | Last save time                                                                                            |

Store one current saved state per project. Referenced media must belong to the project. Reject saves based on an outdated version to prevent accidental overwrites. Add a separate revisions table if history is needed.

### timeline_json: the edit plan

This is the shared contract between the pipeline (AI auto-edit), the editor,
and the render service. The pipeline writes the first draft; the editor
reads/writes the same shape; the render service only reads it. Validate with
a runtime schema (e.g. zod) at every write boundary.

```ts
interface EditPlan {
  version: 1;
  templateId: string; // references styles.id
  sourceMediaId: string; // references media.id
  durationMs: number;

  cuts: Array<{
    id: string;
    startMs: number;
    endMs: number; // trims/removes filler/silence; renderer only plays these ranges
    reason?: "filler" | "silence" | "manual";
  }>;

  captions: Array<{
    id: string;
    startMs: number;
    endMs: number;
    text: string;
    words?: Array<{ text: string; startMs: number; endMs: number }>; // for karaoke highlight
  }>;

  stickers: Array<{
    id: string;
    stickerKey: string; // references stickers.key
    startMs: number;
    durationMs: number;
    position: { x: number; y: number }; // normalized 0-1, editor-draggable
    size: number;
    source: "ai" | "manual"; // UI badge only; never affects rendering
  }>;

  overlays: Array<{
    // chapter titles, hooks, b-roll markers — extensible slot
    id: string;
    kind: "title" | "chapter" | "broll-marker";
    startMs: number;
    endMs: number;
    data: Record<string, unknown>;
  }>;
}
```

Pipeline planning is split into small, independently re-runnable steps rather
than one LLM call producing the whole plan: transcribe → detect cuts →
generate captions → classify sticker moments (LLM function-call matched
against `stickers.tags`) → pick template → assemble + validate.

## styles

| Field                 | Type      | Notes                                                                       |
| --------------------- | --------- | --------------------------------------------------------------------------- |
| id                    | UUID      | Primary key                                                                 |
| key                   | text      | Stable slug, e.g. "bold-karaoke"; unique                                    |
| name                  | text      | Display name                                                                |
| category              | text      | shorts, talking-head, podcast-clip, general                                 |
| caption_json          | JSON      | Font, size, color, highlight color, position, animation, max words per line |
| theme_json            | JSON      | Color grade, border asset, watermark, intro/outro asset keys                |
| sticker_defaults_json | JSON      | Default sticker size, entrance animation, default duration                  |
| pacing_json           | JSON      | Cut aggressiveness, whether auto-zoom is allowed                            |
| created_at            | timestamp | Creation time                                                               |
| updated_at            | timestamp | Last update time                                                            |

Templates ("styles") are hand-authored JSON documents seeded by the team, not created through a UI in this phase. Referenced from an edit plan by `templateId` (see the `timeline_json` schema under `editor_states` above). Served read-only via the planned `GET /styles`, `GET /styles/:id` routes.

## stickers

| Field             | Type      | Notes                                                                                    |
| ----------------- | --------- | ---------------------------------------------------------------------------------------- |
| id                | UUID      | Primary key                                                                              |
| key               | text      | Stable slug, e.g. "money-bag"; unique                                                    |
| asset_key         | text      | Object storage key or bundled asset path                                                 |
| kind              | text      | emoji, sticker                                                                           |
| tags              | text[]    | Keywords matched against transcript content/sentiment, e.g. ["money", "finance", "cash"] |
| default_animation | text      | pop, bounce, fade                                                                        |
| created_at        | timestamp | Creation time                                                                            |
| updated_at        | timestamp | Last update time                                                                         |

Static, bundled sticker/emoji library seeded by the team in this phase; the AI planner only selects from this catalog by matching `tags`, it does not generate new sticker images.

## jobs

| Field              | Type      | Notes                                                                 |
| ------------------ | --------- | ---------------------------------------------------------------------- |
| id                 | UUID      | Primary key                                                            |
| team_id            | UUID      | References teams.id                                                   |
| project_id         | UUID      | References projects.id                                                |
| kind               | text      | pipeline, render                                                       |
| status             | text      | running, completed, failed                                             |
| stage              | text      | Current step, e.g. transcribe, cuts, captions, stickers, template, save, render, upload |
| error              | text      | Nullable; set on failure                                              |
| cancel_requested   | boolean   | Default false; checked between stages                                 |
| created_at         | timestamp | Creation time                                                          |
| updated_at         | timestamp | Last update time; bump on every stage/status change                   |

No queue or broker — the API creates this row, then calls the pipeline or
render function directly (`await`ed or fire-and-forget) and that function
updates `stage`/`status`/`error` as it runs. The editor polls `GET /jobs/:id`.
On process startup, mark any row stuck at `status: "running"` past a timeout
as `failed`, since a restart means nothing is still running it.

## subscriptions

| Field                    | Type      | Notes                                                        |
| ------------------------ | --------- | ------------------------------------------------------------ |
| id                       | UUID      | Primary key                                                  |
| team_id                  | UUID      | References teams.id                                          |
| plan_name                | text      | Plan identifier, such as free, pro, business                 |
| status                   | text      | trialing, active, past_due, canceled, expired                |
| billing_provider         | text      | Nullable payment provider name                               |
| provider_subscription_id | text      | Nullable; unique together with billing_provider when present |
| billing_period_start     | timestamp | Period start                                                 |
| billing_period_end       | timestamp | Period end; must follow its start                            |
| created_at               | timestamp | Creation time                                                |
| updated_at               | timestamp | Last update time                                             |

Keep subscription history and enforce at most one current subscription per team. Define which statuses count as current when implementing billing.

## credit_transactions

| Field           | Type      | Notes                                                                          |
| --------------- | --------- | ------------------------------------------------------------------------------ |
| id              | UUID      | Primary key                                                                    |
| team_id         | UUID      | References teams.id                                                            |
| project_id      | UUID      | Nullable; references projects.id for project-related usage                     |
| amount          | bigint    | Signed integer credits: positive for grants/refunds, negative for usage/expiry |
| reason          | text      | plan_grant, purchase, usage, refund, expiry                                    |
| idempotency_key | text      | Required; unique per team to prevent duplicate transactions                    |
| created_at      | timestamp | Transaction time                                                               |

Credit transactions are append-only. Correct mistakes with compensating transactions.

- Credits remaining: sum of all transaction amounts for a team.
- Credits used in a period: absolute sum of negative usage transactions in that period. Refunds are recorded separately.
- Record grants and expiry explicitly. Define the credit expiry policy before implementation.
- Check balance and record deductions atomically to prevent concurrent requests from overspending.
- A transaction's project, when provided, must belong to the same team.

## Relationships and indexes

- A team has many projects, subscriptions over time, and credit transactions.
- A project has many media files and one current editor state.
- Index foreign keys used for lookups, especially projects.team_id, media.project_id, and subscriptions.team_id.
- Index credit_transactions on `(team_id, created_at)` and enforce uniqueness on `(team_id, idempotency_key)`.
- Index styles and stickers on `key` (unique) and stickers on `tags` for keyword matching.
- Index jobs on `(project_id, created_at)` and on `status` for the startup stale-job sweep.
- Define deletion and retention rules before implementation, including treatment of billing records and stored media.

## Future additions

- Exports: render settings, output storage keys, and export status.
- Invitations: invite users before they get access to a team.
- Editor revisions: saved history and restoration.
