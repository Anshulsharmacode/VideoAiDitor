# AI Video Editor: Complete Build Guide

> Upload a raw video → AI adds captions, callouts and cuts → user edits on a timeline → export.
> Stack: **NestJS + Next.js + Remotion**, built with **free tools** and near-zero cost.

---

## Table of Contents

1. [The Core Idea](#1-the-core-idea)
2. [Full Pipeline](#2-full-pipeline)
3. [Free Tech Stack](#3-free-tech-stack)
4. [Architecture (NestJS)](#4-architecture-nestjs)
5. [The Edit Plan JSON](#5-the-edit-plan-json)
6. [How "Styles" Work](#6-how-styles-work)
7. [Proper Video Editor (Timeline)](#7-proper-video-editor-timeline)
8. [API Endpoints](#8-api-endpoints)
9. [Build Roadmap](#9-build-roadmap)
10. [Keeping Cost Near Zero](#10-keeping-cost-near-zero)
11. [Risks and Tips](#11-risks-and-tips)
12. [Next Steps](#12-next-steps)

---

## 1. The Core Idea

The AI does **not** edit pixels. It produces an **edit plan (JSON)**. A renderer turns that JSON into video.

```
Raw video → Transcript → LLM → Edit-plan JSON → Preview/Editor → Render → Final video
```

- The **JSON is your project file**.
- The browser preview and the final export both read the **same JSON**, so what the user sees is what they get.
- The user can edit the JSON visually in the editor.

---

## 2. Full Pipeline

| #   | Step         | What happens                                                       | Tool                                 |
| --- | ------------ | ------------------------------------------------------------------ | ------------------------------------ |
| 1   | Upload       | User uploads raw video; create a small proxy copy for fast preview | FFmpeg, Cloudflare R2                |
| 2   | Transcribe   | Speech to text with **word-level timestamps**                      | Groq Whisper API (or faster-whisper) |
| 3   | Understand   | LLM finds key words, filler words, hook, callout spots             | Gemini / Groq free tier              |
| 4   | Plan         | LLM outputs edit-plan JSON (validated)                             | zod                                  |
| 5   | Clean        | Remove silences and filler words                                   | FFmpeg                               |
| 6   | Preview/Edit | User tweaks captions, timing, style                                | Remotion Player + timeline           |
| 7   | Export       | Render final video from JSON                                       | Remotion + FFmpeg                    |
| 8   | Deliver      | Save and return download link                                      | Cloudflare R2                        |

Optional extras later: background removal (sticker-style cutout), face-tracked 9:16 crop, b-roll, music.

---

## 3. Free Tech Stack

| Need                            | Free tool                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| Speech to text                  | **Groq Whisper API** (free tier) or **faster-whisper** (local)                          |
| AI brain                        | **Gemini free tier**, **Groq free tier**, or **Ollama** (local)                         |
| Cut, convert, export            | **FFmpeg**                                                                              |
| Captions and callouts rendering | **Remotion** (free for individuals and small teams; check license for larger companies) |
| Person cutout                   | **rembg** (Python)                                                                      |
| Face tracking / 9:16 crop       | **MediaPipe**                                                                           |
| Backend                         | **NestJS**                                                                              |
| Frontend                        | **Next.js** (React)                                                                     |
| Database                        | **Postgres** via Neon or Supabase free tier + Prisma                                    |
| Queue                           | **BullMQ + Redis** (Docker locally or Upstash free)                                     |
| Storage                         | **Cloudflare R2** (10 GB free)                                                          |
| Stock clips                     | **Pexels API**                                                                          |
| Timeline UI                     | **@xzdarcy/react-timeline-editor**                                                      |
| Drag/resize on video            | **react-moveable**                                                                      |
| State + undo/redo               | **Zustand + zundo**                                                                     |
| Audio waveform                  | **wavesurfer.js**                                                                       |
| Hosting                         | **Vercel** (UI) + your own PC (processing)                                              |

---

## 4. Architecture (NestJS)

Use NestJS for **orchestration only**. Keep AI and video work in tools that are best at them.

### What NestJS handles

- Upload endpoint, job status, download link
- Auth, user credits, database
- Job queue so long jobs run in the background
- LLM calls (Gemini/Groq Node SDKs)
- FFmpeg (`fluent-ffmpeg`)
- Triggering Remotion renders (Node/React, fits naturally)

### Whisper / rembg / MediaPipe are Python-first

| Option                                   | How                                                                 | Cost                  |
| ---------------------------------------- | ------------------------------------------------------------------- | --------------------- |
| **A. Whisper API** (recommended for MVP) | Call Groq's Whisper API from NestJS                                 | Free tier             |
| **B. Python microservice**               | Small FastAPI app running faster-whisper; NestJS calls it over HTTP | Free, runs on your PC |

Choosing A keeps your whole stack in TypeScript.

### Diagram

```
Next.js (UI + Editor)
        |
   NestJS API  ----->  Redis (BullMQ queue)
        |                     |
     Postgres           Worker (separate process)
                              |
          1. Groq Whisper  → words + timestamps
          2. Gemini        → edit-plan JSON
          3. FFmpeg        → cut silences
          4. Remotion      → captions + callouts
          5. Cloudflare R2 → save + return link
```

### Suggested modules

```
src/
├── upload/        # receive file, save to storage
├── transcribe/    # call Whisper
├── planner/       # call LLM, validate JSON with zod
├── render/        # FFmpeg + Remotion
├── projects/      # CRUD for edit-plan JSON
├── jobs/          # BullMQ queue and status
└── auth/          # users and credits
```

---

## 5. The Edit Plan JSON

This is the heart of the app. Example:

```json
{
  "version": 1,
  "fps": 30,
  "size": { "width": 1080, "height": 1920 },
  "style": "bold-sticky",
  "tracks": [
    {
      "id": "t1",
      "type": "video",
      "items": [{ "id": "v1", "src": "raw.mp4", "start": 0, "end": 30 }]
    },
    {
      "id": "t2",
      "type": "caption",
      "items": [
        {
          "id": "c1",
          "text": "in a style like this",
          "start": 1.2,
          "end": 2.4,
          "style": "pill"
        }
      ]
    },
    {
      "id": "t3",
      "type": "sticker",
      "items": [
        {
          "id": "s1",
          "text": "UPLOAD",
          "color": "yellow",
          "x": 70,
          "y": 10,
          "start": 4,
          "end": 7
        }
      ]
    },
    {
      "id": "t4",
      "type": "audio",
      "items": [
        { "id": "a1", "src": "music.mp3", "start": 0, "end": 30, "volume": 0.2 }
      ]
    }
  ],
  "zooms": [{ "at": 6.5, "scale": 1.2, "duration": 0.5 }]
}
```

**Important:** validate every LLM response with `zod` or `class-validator`. LLMs sometimes return broken JSON, so add a retry.

### Prompt idea for the LLM

> You are a video editor. Given this transcript with word timestamps, return ONLY valid JSON matching this schema: key words to highlight, filler words to cut, sticky-note callout text and timing, and zoom moments. No explanation, no markdown.

---

## 6. How "Styles" Work

A style is **not AI**. It is a **template**, a Remotion component that defines:

- Fonts and colors
- Caption animation (pop, highlight current word, etc.)
- Callout shapes (sticky notes, pills, arrows)
- Transitions and zoom behavior

The AI decides **what** to show and **when**. The template decides **how it looks**.

The prompt box in apps like the one in your screenshot ("pacing, callouts, colours") is just an LLM that converts natural language into style parameters in the JSON.

Start with **2-3 hand-made styles**.

---

## 7. Proper Video Editor (Timeline)

### Layout

```
+-----------------------------+------------------+
|                             |   Properties     |
|    Video preview            |   text, font,    |
|    (Remotion Player)        |   color, size    |
|                             |                  |
+-----------------------------+------------------+
| Timeline                                       |
| Video    [===== clip A =====][== clip B ==]    |
| Captions [hi][this][is][a][test]               |
| Stickers      [UPLOAD]      [PICK A STYLE]     |
| Audio    [~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]    |
+------------------------------------------------+
```

### Features, in build order

1. Preview with play/pause (Remotion Player reads the JSON)
2. Timeline showing tracks; drag to move, resize to trim
3. Click an item → edit text, color, style in the properties panel
4. Drag/resize text and stickers on the video (react-moveable)
5. Split, delete, duplicate
6. Undo/redo (Zustand + zundo)
7. Auto-save JSON to backend every few seconds
8. Export button → NestJS queues render using the same JSON

### Editing captions like a document

Let users edit captions as **text by words** (like a Google Doc). It is much easier than dragging blocks, and the word timestamps update the timeline.

### Use a proxy video in the editor

Edit on the **low-resolution proxy**. Use the original file only at export. This keeps the browser fast.

### MVP scope warning

A full CapCut-style editor is huge. For the MVP support only:

- Edit caption text
- Move/resize items on the timeline
- Change style
- Delete items

Skip transitions, keyframes and effects until users ask.

---

## 8. API Endpoints

| Method | Endpoint                 | Purpose                                     |
| ------ | ------------------------ | ------------------------------------------- |
| POST   | `/uploads`               | Upload raw video (resumable)                |
| POST   | `/projects`              | Create project; triggers AI plan generation |
| GET    | `/projects/:id`          | Load edit-plan JSON                         |
| PUT    | `/projects/:id`          | Save edited JSON (auto-save)                |
| POST   | `/projects/:id/export`   | Queue the final render                      |
| GET    | `/jobs/:id`              | Job status and progress                     |
| GET    | `/projects/:id/download` | Get final video link                        |

### Database (Prisma, minimal)

```prisma
model User {
  id       String    @id @default(uuid())
  email    String    @unique
  credits  Int       @default(3)
  projects Project[]
}

model Project {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  videoUrl  String
  proxyUrl  String?
  plan      Json     // the edit-plan JSON
  status    String   // uploaded | planning | ready | rendering | done | failed
  outputUrl String?
  createdAt DateTime @default(now())
}
```

---

## 9. Build Roadmap

| Week | Goal                                                       |
| ---- | ---------------------------------------------------------- |
| 1    | Script that transcribes a video and prints word timestamps |
| 2    | LLM returns validated JSON; FFmpeg removes silences        |
| 3    | Remotion draws animated captions from the JSON             |
| 4    | Sticky-note callouts and auto-zoom                         |
| 5    | NestJS API + queue + upload page                           |
| 6    | Editor: Remotion Player + timeline + properties panel      |
| 7    | Undo/redo, auto-save, export                               |
| 8+   | Style presets, credits, background removal, b-roll, music  |

**Tip:** build it first as a plain script (`node main.js video.mp4`). Add the website after the pipeline works.

**MVP niche:** talking-head videos for creators and founders. Do one thing well before going broad.

---

## 10. Keeping Cost Near Zero

- Develop and process on **your own laptop/PC**
- Use **Google Colab free GPU** if local Whisper is slow
- Use Whisper `small` or `base` models
- Preview runs **in the browser**, so it costs nothing
- Only the final export uses server CPU
- Don't host heavy rendering in the cloud until you have real users
- When you launch, charge **credits per video** so each user covers their own cost
- Track cost per minute of video early (transcription + LLM + render)

---

## 11. Risks and Tips

- **Competition:** Opus Clip, Submagic, Captions, CapCut. Win with a niche or a unique style, not a general tool.
- **Quality:** Always let users edit the AI output. "80% right and not editable" frustrates people.
- **Latency:** Process in the background, show progress, never a blank spinner.
- **Separate processes:** Run the worker apart from the API so renders don't slow endpoints.
- **Start as a monolith:** One NestJS app first. No microservices.
- **Licensing:** Use royalty-free music and b-roll only. Check Remotion's license before commercial use at scale.
- **Free-tier limits:** Groq and Gemini free tiers have rate limits; add retries and a fallback.
- **Security:** Limit upload size and file types; scan for abuse; delete old files to save storage.

---

## 12. Next Steps

1. Create the NestJS project and the folder structure above.
2. Write the upload + Groq Whisper module (word timestamps).
3. Write the planner module (Gemini + zod validation).
4. Build one Remotion composition that renders captions from the JSON.
5. Add the Next.js editor with Remotion Player and the timeline.

Ask for starter code for any step to continue.

video-editor-backend/
├── prisma/
│ ├── schema.prisma
│ └── migrations/
├── src/
│ ├── main.ts # API entry point
│ ├── worker.ts # Worker entry point (separate process)
│ ├── app.module.ts
│ │
│ ├── config/
│ │ ├── configuration.ts # env variables loader
│ │ └── env.validation.ts # validate env with zod
│ │
│ ├── common/
│ │ ├── filters/
│ │ │ └── http-exception.filter.ts
│ │ ├── guards/
│ │ │ └── jwt-auth.guard.ts
│ │ ├── decorators/
│ │ │ └── current-user.decorator.ts
│ │ ├── interceptors/
│ │ │ └── logging.interceptor.ts
│ │ └── utils/
│ │ ├── file.util.ts # temp files, cleanup
│ │ └── time.util.ts # seconds <-> frames
│ │
│ ├── prisma/
│ │ ├── prisma.module.ts
│ │ └── prisma.service.ts
│ │
│ ├── auth/
│ │ ├── auth.module.ts
│ │ ├── auth.controller.ts # register, login
│ │ ├── auth.service.ts
│ │ ├── strategies/
│ │ │ └── jwt.strategy.ts
│ │ └── dto/
│ │ ├── login.dto.ts
│ │ └── register.dto.ts
│ │
│ ├── users/
│ │ ├── users.module.ts
│ │ ├── users.service.ts # credits deduct/add
│ │ └── users.controller.ts
│ │
│ ├── storage/
│ │ ├── storage.module.ts
│ │ └── storage.service.ts # Cloudflare R2 (S3 API): upload, signed URL, delete
│ │
│ ├── upload/
│ │ ├── upload.module.ts
│ │ ├── upload.controller.ts # POST /uploads (signed URL or multipart)
│ │ ├── upload.service.ts
│ │ └── dto/
│ │ └── create-upload.dto.ts
│ │
│ ├── projects/
│ │ ├── projects.module.ts
│ │ ├── projects.controller.ts # CRUD + export
│ │ ├── projects.service.ts
│ │ └── dto/
│ │ ├── create-project.dto.ts
│ │ └── update-project.dto.ts
│ │
│ ├── transcribe/
│ │ ├── transcribe.module.ts
│ │ ├── transcribe.service.ts # Groq Whisper -> word timestamps
│ │ └── types/
│ │ └── transcript.type.ts
│ │
│ ├── planner/
│ │ ├── planner.module.ts
│ │ ├── planner.service.ts # LLM call + retry + validate
│ │ ├── prompts/
│ │ │ └── edit-plan.prompt.ts
│ │ └── schemas/
│ │ └── edit-plan.schema.ts # zod schema (shared with frontend)
│ │
│ ├── media/
│ │ ├── media.module.ts
│ │ ├── ffmpeg.service.ts # proxy, extract audio, cut silences
│ │ └── silence-detect.service.ts
│ │
│ ├── render/
│ │ ├── render.module.ts
│ │ ├── render.service.ts # runs Remotion renderMedia()
│ │ └── remotion/ # Remotion project (can be its own package)
│ │ ├── index.ts
│ │ ├── Root.tsx
│ │ ├── compositions/
│ │ │ └── MainVideo.tsx # reads the edit-plan JSON
│ │ ├── components/
│ │ │ ├── Captions.tsx
│ │ │ ├── StickyNote.tsx
│ │ │ └── ZoomLayer.tsx
│ │ └── styles/ # style templates
│ │ ├── bold-sticky.ts
│ │ ├── minimal.ts
│ │ └── neon.ts
│ │
│ ├── jobs/
│ │ ├── jobs.module.ts # BullMQ setup
│ │ ├── jobs.controller.ts # GET /jobs/:id (status/progress)
│ │ ├── jobs.service.ts
│ │ └── processors/
│ │ ├── pipeline.processor.ts # upload -> transcribe -> plan
│ │ └── export.processor.ts # final render
│ │
│ └── health/
│ └── health.controller.ts
│
├── test/
│ └── app.e2e-spec.ts
│
├── storage-tmp/ # temp files (gitignored)
├── docker-compose.yml # Postgres + Redis
├── Dockerfile
├── .env.example
├── .gitignore
├── nest-cli.json
├── package.json
└── tsconfig.json

API routes (NestJS backend)

Base URL: /api/v1. All routes except auth and health need Authorization: Bearer <JWT>.

Auth
Method Route Purpose
POST /auth/register Create account
POST /auth/login Get JWT token
POST /auth/refresh Refresh token
GET /auth/me Current user info
Users and credits
Method Route Purpose
GET /users/me Profile and credits left
PATCH /users/me Update profile
GET /users/me/credits Credit balance and history
Uploads
Method Route Purpose
POST /uploads/sign Get a signed R2 URL so the browser uploads directly (saves your server bandwidth)
POST /uploads/complete Tell the backend the upload finished
DELETE /uploads/:id Delete the uploaded file
Projects
Method Route Purpose
POST /projects Create a project from an upload (starts the AI pipeline)
GET /projects List my projects (with pagination)
GET /projects/:id Get project and the edit-plan JSON
PUT /projects/:id Save the full edited JSON (auto-save)
PATCH /projects/:id Update title, style, settings only
DELETE /projects/:id Delete project and files
POST /projects/:id/duplicate Copy a project
AI actions (re-run parts of the pipeline)
Method Route Purpose
POST /projects/:id/regenerate Re-run the AI plan
POST /projects/:id/prompt Natural-language edit (“make captions bigger, add more callouts”)
POST /projects/:id/restyle Apply a different style to the existing plan
Transcript
Method Route Purpose
GET /projects/:id/transcript Get words with timestamps
PUT /projects/:id/transcript Save edited caption text
Styles
Method Route Purpose
GET /styles List available style templates
GET /styles/:id Style details and preview data
Export
Method Route Purpose
POST /projects/:id/export Queue the final render (body: { resolution, ratio, format })
GET /projects/:id/exports List past exports
GET /exports/:id/download Get a signed download link
Jobs and progress
Method Route Purpose
GET /jobs/:id Status: queued, running, done, failed, plus progress %
GET /jobs/:id/events Live progress via SSE (simpler than websockets)
POST /jobs/:id/cancel Cancel a running job
Assets (optional)
Method Route Purpose
GET /assets/music List royalty-free music
GET /assets/broll?q=coffee Search Pexels b-roll
POST /projects/:id/assets Add your own image, audio, or clip
Health
Method Route Purpose
GET /health Check API, DB, and Redis
Typical flow

1. POST /auth/login
2. POST /uploads/sign -> browser uploads file to R2
3. POST /uploads/complete
4. POST /projects -> returns { projectId, jobId }
5. GET /jobs/:jobId/events -> progress bar until "done"
6. GET /projects/:id -> load JSON into editor
7. PUT /projects/:id -> auto-save while editing
8. POST /projects/:id/export -> returns { jobId }
9. GET /exports/:id/download -> final video
   Example request and response
   http
   POST /api/v1/projects
   {
   "uploadId": "up_123",
   "title": "My first reel",
   "style": "bold-sticky",
   "ratio": "9:16",
   "instructions": "fast pacing, yellow sticky-note callouts"
   }
   json
   {
   "projectId": "prj_456",
   "jobId": "job_789",
   "status": "queued"
   }
   Tips
   MVP routes only: auth/login, uploads/sign, projects (create, get, put), projects/:id/export, jobs/:id, exports/:id/download. Add the rest later.
   Use SSE for progress instead of websockets. It is simpler and works well with NestJS (@Sse()).
   Validate bodies with DTOs (class-validator) and validate the plan JSON on PUT /projects/:id with the zod schema.
   Check ownership on every :id route so users can only access their own projects.
   Rate-limit /projects and /export with @nestjs/throttler. They are the expensive routes.
