# Tutorial Studio: plan

Status: plan only. Nothing below is built yet except the existing CLI engine (`engine/`, `projects/brandluka/`).

## 1. Goal

A standalone app on one Windows computer that makes finished tutorial and explainer videos with no manual editing:
research the app or topic, write the script, record the screencast with a timed cursor, add voice, avatar, stock
footage and text animation, and export an MP4 per language. Any scene can be fixed and re-rendered on its own.

## 2. Decisions

| Area | Decision |
|---|---|
| Where it runs | This computer only. UI in a browser tab on `localhost`. |
| Platform | Windows only. |
| Language | TypeScript on Node. `engine/` is migrated to TypeScript over time and keeps working until each part is replaced. |
| UI | React + Vite. |
| Database | PostgreSQL 16 (installed as a Windows service). |
| Job queue | pg-boss on Postgres. No Redis. |
| Knowledge search | pgvector + Postgres full-text search (hybrid). |
| Database library | Drizzle (preferred over Prisma for pgvector and raw SQL). |
| Recording | Playwright driving the installed Chrome, with Playwright's own video recording. |
| Rendering | Remotion + ffmpeg. |
| Languages | English and Bengali first. More languages are added as configuration, not code. |
| Python | Not used. Add later only as an optional side process if a feature needs it. |
| Packaging | `start.bat` / `stop.bat`. An Electron wrapper is optional and not planned now. |

## 3. Architecture

```
Browser UI (React, served on localhost)
        | HTTP + server-sent events (live progress)
Local server (Node + TypeScript)
   |- API
   |- Job runner ............ pg-boss queues with per-kind concurrency
   |- Pipeline stages ....... research, script, plan, voice, record, avatar, b-roll, render, QA
   |- Providers ............. Claude, ElevenLabs, HeyGen, Pexels, embeddings
   |- Result cache + cost ledger (every paid call goes through one function)
PostgreSQL 16 ............... data, jobs, knowledge (pgvector), costs
Workspace folder ............ all media files on disk
Tools ....................... Playwright + Chrome, Remotion, ffmpeg
```

- During development the UI runs on Vite (`5173`) and the server on `4000`. In normal use the server serves the
  built UI on one port.
- API keys live in a local `.env`, edited from the Settings page. They are sent only to the provider they belong to.

## 4. Code layout

```
engine/            existing CLI, kept working during the migration
app/
  server/          API, job runner, stages, providers, database
  ui/              React + Vite
  remotion/        compositions: tutorial, explainer, callouts, zoom, captions, avatar, b-roll
  shared/          types and schemas (script, scene, step, timeline)
docs/PLAN.md       this file
start.bat, stop.bat, status.bat
workspace/         your data (gitignored)
```

## 5. Organisation: project-wise, two video types

A **project** is one app (for example Brandluka). Each project holds:

- **Settings:** app URL, demo login (encrypted), brand colours and logo, default voice, avatar, languages, tone.
- **Knowledge:** crawled pages, the navigation map, glossary, approved scripts, proven click paths, your docs.
- **Tutorials:** step-by-step videos of the real app, grouped into series (for example "Getting started").
- **Explainers:** concept and story videos built from animation, screenshots, stock footage and avatar.
- **Library:** project-only clips, intro/outro, music.
- **Costs:** spend per video and per model.

Tutorials and explainers have **separate menus and separate "New" wizards**, but share one engine, one `videos`
table (with a `type` column) and the same voice, render and cost code. A scene in either type can be any scene type,
so mixed videos are possible.

| | Tutorial | Explainer |
|---|---|---|
| Purpose | How to do something in the app | What something is, why it matters |
| Main visual | Real app recording with cursor | Animation, screenshots, stock footage, text |
| Needs live app | Yes | No (may use it) |
| Script style | Step by step | Hook, problem, idea, benefit, call to action |
| Planning stage | Click planning | Visual planning |

## 6. Files on disk

```
workspace/
  <project>/
    project.json
    knowledge/            uploaded docs, crawl snapshots
    library/
    tutorials/<video>/
    explainers/<video>/
      script.json         scenes, narration per language, graphics
      steps.json          verified browser actions per scene (screen scenes)
      visuals.json        chosen visual per scene (other scene types)
      audio/<scene>-<lang>.mp3 + .words.json
      raw/screen.webm + clicks.json
      avatar/<lang>.mp4
      broll/<clip>.mp4
      out/final-<lang>.mp4, final-<lang>.srt, chapters.txt
  logs/
  .run/app.pid
```

Every stage reads and writes these files. Rerunning a stage replaces only its own outputs, and later stages become stale.

## 7. Pipeline

| # | Stage | What it does | Runs for |
|---|---|---|---|
| 1 | Research | Local crawl with Playwright (text, labels, screenshots, nav map), reuse knowledge, web search only for topic research. | Both |
| 2 | Script | One call writes all scenes in all languages. Each scene gets a type, an intent and optional graphics. Editable before continuing. | Both |
| 3a | Click planning | An agent reads the live page, proposes an action, runs it, keeps only actions that worked. Reuses proven paths from knowledge first. Each step is tied to a narration word. Unsolved scenes are flagged for hand-fixing. | Screen scenes |
| 3b | Visual planning | Picks a visual per scene: screenshot, animated text or diagram, stock clip, avatar, or a short app clip. | Other scenes |
| 4 | Voice | ElevenLabs text-to-speech with timestamps (one call gives audio and word timings). Only changed scenes are re-voiced. | Both |
| 5 | Record | Replays steps in Chrome with the drawn cursor and click ripple, timed to the word timings. Saves video and click positions. | Screen scenes |
| 6 | Avatar | Uploads the narration to HeyGen and renders the avatar, one render per language. Optional. | Both |
| 7 | B-roll | Pexels search, download, trim, cache. Optional. | Both |
| 8 | Render | Remotion: recording, audio, zoom toward clicks, callouts, motion text, captions, avatar overlay, b-roll, intro/outro, music. One MP4 per language. | Both |
| 9 | QA | Local checks first (silence, black frames, overruns, length). Vision check only on flagged frames. | Both |

Timing uses the existing `cue('word')` idea from `engine/record.js`: actions fire on narration words, so editing the
script re-times the cursor automatically. One recording serves all languages where scene slots allow; the render
step is repeated per language.

## 8. Models and providers

| Stage | Provider / model |
|---|---|
| Outline, summaries, translation passes | Claude Sonnet 5.5 (`claude-sonnet-5-5`) |
| Script (EN + BN) | Claude Fable 5.1 (`claude-fable-5-1`) or Opus 5.5 (`claude-opus-5-5`), chosen by testing |
| Click planning | Claude Fable 5.1 or Opus 5.5, after a cheaper first attempt where it works |
| QA frame checks, knowledge summaries | Claude Haiku 5.5 (`claude-haiku-5-5`) |
| Topic research | Claude with its built-in web search tool |
| Voice and cloning | ElevenLabs |
| Avatar | HeyGen (endpoints to be checked against current docs) |
| Stock footage | Pexels (licensed, free). No YouTube downloads. |
| Embeddings | Local multilingual model via transformers.js by default; Voyage AI as fallback |

Each stage's model (and its fallback) is a setting, not code. Bengali is written directly in Bengali, not translated
line by line, with product names kept in English.

## 9. Cost control

Rules for the whole app:

1. **Free work first.** Crawling, parsing, dedup, search, silence and frame checks run locally.
2. **Never pay twice.** Every paid result is stored with a hash of its inputs and model; same input means reuse.
3. **Cheapest model that works.** Start cheap, escalate only when the output fails validation.
4. **Fewer, bigger calls.** One script call covers all scenes and languages.
5. **Prompt caching.** Project knowledge and instructions sit at the start of every prompt.
6. **Batch API** for work that isn't urgent (knowledge summaries, re-indexing).
7. **Estimate, then confirm.** Paid steps show an estimate first. Budgets per video and per month pause the run.

Expected calls per video:

| Stage | Calls | How they stay low |
|---|---|---|
| Research | 0-1 | Local crawl, reused knowledge |
| Script | 1 | All languages in one call, cached prefix |
| Click planning | a few per scene | Proven paths reused, page text before screenshots, cheap model first |
| Voice | 1 per scene per language | Timestamps endpoint replaces the separate alignment call; unchanged text skipped |
| Avatar | 1 per language | One render for the full narration |
| B-roll | free | Pexels, clips cached |
| QA | 0 to a few | Local checks first |
| Knowledge | batched | Only new or changed content |

Note: the current `engine/audio.js` makes two calls per clip (speech, then forced alignment). The plan moves to one;
check that the timestamps are as accurate for Bengali first.

### Cost recording and display

Every paid call writes a `usage` row: time, project, video, scene, stage, provider, exact model, units (tokens,
characters, seconds, calls), cost, and whether it was a retry, retake or failure. Real usage comes from provider
responses; prices come from an editable price table and are saved on each row, so past costs don't change. A model
without a price is flagged, never shown as zero.

Shown in the UI:

- **New video:** estimate by stage and model before any paid step.
- **Video editor:** live cost counter with per-stage breakdown.
- **Finished video:** final table by model (calls, units, cost, total, cost per minute), useful spend vs retries,
  and money saved by cache hits.
- **Costs page and project Costs tab:** totals by day, month, project, provider and model, chart, CSV export.

## 10. Knowledge base (self-building)

Entries come from the pipeline itself, at no extra call: crawled pages and nav map, click paths that worked,
approved scripts, retake notes, and your uploads.

The system decides what to keep, rules first (free):

- Drop noise: headers, footers, cookie banners, repeated menus, tiny fragments.
- Drop duplicates by hash and by similarity.
- Skip unchanged pages (content hash matches the last crawl).
- Keep only what proved useful: successful steps, approved scripts, pages a video used.
- Mark entries stale when a re-crawl shows the page changed, and flag the videos that used them.
- Score by usage; archive entries unused for a long time.

AI is used only on new or changed content that passed the filters: Haiku turns it into short facts and glossary
terms, in batches. Only new or changed chunks are embedded. Retrieval is hybrid (full-text for exact labels, vector
for meaning), filtered by project and language.

The project **Knowledge** tab shows what was added and why, with options to remove or pin entries. No manual work
is required.

## 11. Data model (main tables)

- `projects`: name, app URL, encrypted login, brand, defaults, languages
- `languages`: code, name, voice, caption font, text direction
- `videos`: project, type (tutorial/explainer), series, title, brief, languages, voice, avatar, options, status, outputs
- `scenes`: video, index, scene type, title, intent, narration per language, steps, visual, graphics, status
- `voices`: name, kind (preset/cloned), ElevenLabs voice id, consent date
- `avatars`: name, kind (upload/prompt), image, HeyGen id, consent date, status
- `knowledge_chunks`: project, source, language, text, hash, embedding (pgvector), full-text index, score, last used, stale
- `result_cache`: input hash, model, output, cost
- `usage`: per paid call (see section 9)
- `prices`: provider, model, unit, price, valid from
- `events`: per-video progress log
- pg-boss's own job tables

## 12. Screens

Sidebar:

```
Dashboard
Projects
  inside a project: Overview . Tutorials . Explainers . Knowledge . Library . Costs
All videos        (both types, filter by type)
Voices
Avatars
Costs
Settings
```

- **Dashboard:** projects, recent videos with status, this month's spend.
- **Project overview:** settings, login test, knowledge status, re-crawl.
- **Tutorials:** list grouped by series; "New tutorial" wizard (task, starting page, languages, voice, avatar, options, estimate). Series planner proposes tutorials from the app map.
- **Explainers:** list by topic; "New explainer" wizard (topic, audience, tone, languages, voice, avatar, options, estimate).
- **Video editor:** scene list; per scene the narration, steps or visual, graphics and a preview; buttons to rewrite, re-plan, re-voice, re-record or re-render one scene; progress bar, live log, live cost.
- **Preview and export:** play, switch language, download MP4 and SRT, chapter times, final cost table.
- **Voices:** upload samples, consent tick-box, preview, default.
- **Avatars:** upload image or write a prompt, consent tick-box for real likenesses, preview, default.
- **Knowledge:** entries, sources, stale flags, search test.
- **Costs:** spend by period, project, provider and model; budgets.
- **Settings:** API keys with "test connection", model per stage, Chrome path, resolution, workspace folder, price table, backup, shut down.

## 13. Start, stop and status

**`start.bat`**

1. Check Node version and that PostgreSQL is reachable (and that pgvector is installed).
2. Install dependencies only when `package.json` changed.
3. Create `.env` from the example if missing; first launch opens Settings.
4. If the app is already running, just open the browser.
5. Run database migrations.
6. Start the server in the background, write `workspace/.run/app.pid`, log to `workspace/logs/`.
7. Wait until the server answers, then open the browser.
8. If the last shutdown wasn't clean, clean up the stale PID file and mark interrupted jobs resumable.

**`stop.bat`**

1. Ask the server to shut down through a local endpoint.
2. Jobs pause at a safe point (between stages or scenes) and resume on next start. A recording in progress asks
   whether to wait or cancel.
3. Close recorder Chrome windows and database connections.
4. Force-stop after about 30 seconds if needed, then remove the PID file.

**`status.bat`** shows whether the app is running, its port, and any running job. Settings has a "Shut down"
button that does the same as `stop.bat`. The first run offers desktop shortcuts. A "Back up" button runs `pg_dump`
and copies the workspace.

## 14. Rules and limits

- Voice cloning and uploaded likenesses require a consent tick-box, stored with the voice or avatar.
- Stock footage from licensed sources only. Other footage only as a file you supply yourself.
- Demo-account logins are encrypted in the database.
- Remotion is free for individuals; check its licence before any commercial use.

## 15. This computer (checked 2026-10-27)

Surface Laptop 3: i7-1065G7 (4 cores / 8 threads), 15.6 GB RAM, Intel Iris Plus, 256 GB NVMe SSD, Windows 11 Pro.
Installed: Node 24, Git, Chrome 155, PostgreSQL 16 (running service), `ffmpeg-static` in the repo.

- Capable, but rendering will be slow (a guess of 15-40 minutes per 5-minute 1080p video per language; measure it).
- **Only 18 GB free on C:.** Free at least 50 GB, or put `workspace/` on an external SSD.
- **pgvector is not installed** for PostgreSQL 16.
- Render on mains power with the best-performance power mode. Preview at 720p, render 1080p only for the final.
- One recording and one render at a time.

## 16. Build order

1. **Foundation:** TypeScript server, Postgres with Drizzle, pg-boss, workspace layout, result cache, cost ledger and price table, `start.bat`/`stop.bat`/`status.bat`, UI shell, Settings, import of `projects/brandluka`.
2. **Existing engine in the UI:** voice, record and captions run from the interface with live progress; estimates and the Costs page.
3. **Research and script:** local crawl, project knowledge (pgvector), script generation in EN and BN, editable script view.
4. **Click planning agent:** test on Brandluka and two other apps; series planner; stale-video detection after re-crawl.
5. **Remotion render:** captions, callouts, zoom, intro/outro; drop the external screen recorder.
6. **Explainers:** Explainers menu and wizard, visual planning, explainer templates (title cards, bullet reveals, counters, screenshot pans).
7. **Voice cloning and avatars:** Voices and Avatars pages, HeyGen render and overlay.
8. **B-roll and QA:** Pexels search and trim, local checks, flagged-frame vision checks.
9. **Polish:** per-scene retakes everywhere, budgets, backups, error handling.

Steps 1-5 give a working, fully automatic tutorial maker for simple apps.

## 17. Risks

- The click planner will not solve every flow on complex apps; hand-editing steps is the fallback.
- HeyGen API details and plan limits need checking before step 7.
- Rendering is slow on this laptop.
- Bengali voice quality, timestamp accuracy, caption fonts and lip-sync need early testing.
- Low disk space on this computer.

## 18. Open items

- Confirm Drizzle (vs Prisma).
- Pick the embedding model after a Bengali quality test.
- Check current provider prices and fill the price table.
- Verify HeyGen endpoints and ElevenLabs Bengali support.
- Free disk space and install pgvector before step 3.
