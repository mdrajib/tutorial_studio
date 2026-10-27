# tutorial-studio

Narrated, cursor-synced screen tutorials for any web app. The engine is in `engine/`, and each app gets its own folder under `projects/`.

```
engine/      audio.js · captions.js · record.js · lib.js   (no app-specific code)
projects/<app>/
  project.json   url, languages, ElevenLabs voice, cursor colour, login form selectors
  scripts/*.md   narration: "## A1. Title", "### A1-S01. Title (about N s)", "- **EN:** ..." per language
  videos.js      click steps per scene, timed with cue('word') to the narration
  .env           DEMO_EMAIL / DEMO_PASSWORD (localhost demo account only)
  audio/ captions/   generated (gitignored)
```

## Setup

```
npm install
cp .env.example .env                                   # ELEVENLABS_API_KEY
cp projects/brandluka/.env.example projects/brandluka/.env
```

## Make a video

1. Write the scenes in `projects/<app>/scripts/*.md`.
2. `node engine/audio.js <app> A1` generates the clips, word timings, `A1-full-<lang>.mp3` and `audio/README.md`.
3. Add the A1 click steps to `projects/<app>/videos.js`, then check the timing with `node engine/record.js <app> A1 en --dry`.
4. Start your screen recorder, then run `node engine/record.js <app> A1 en`. Do one take per language.
5. `node engine/captions.js <app> A1` writes the `.srt` files and prints the chapter times.
6. In the editor, lay `A1-full-<lang>.mp3` under the take at 0:00 and cut any waits the run flagged.

Retake one scene's audio with `--force A1-S04` (or `A1-S04-bn`). Re-record from a scene onward with `--from A1-S04`.
For hand-driven parts, use `node engine/record.js <app> open register`, which gives you the same Chrome and cursor under your own mouse.

## New app

Copy `projects/brandluka/` to `projects/<app>/`, then edit `project.json` and replace the scripts and `videos.js`.
