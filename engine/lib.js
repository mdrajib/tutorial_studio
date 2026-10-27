// Shared by audio.js, captions.js and record.js: the project folder, its scripts, and the clip paths
// and record-to slots all three must agree on.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffprobe = require('ffprobe-static').path;

const ROOT = path.join(__dirname, '..');

// projects/<name>/: project.json plus env. The project's own .env (its demo login) wins over the root
// .env (the ElevenLabs key), since dotenv never overrides a variable already set.
function project(name) {
  const dir = path.join(ROOT, 'projects', name || '');
  if (!name || !fs.existsSync(path.join(dir, 'project.json')))
    throw new Error(`no projects/${name || '<name>'}/project.json (projects: ${fs.readdirSync(path.join(ROOT, 'projects')).join(', ')})`);
  require('dotenv').config({ path: path.join(dir, '.env'), quiet: true });
  require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
  if (!Array.isArray(config.languages) || !config.languages.length) throw new Error(`projects/${name}/project.json: "languages" missing`);
  return { name, dir, config, languages: config.languages, audio: path.join(dir, 'audio'), captions: path.join(dir, 'captions') };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const duration = (f) =>
  Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

// Videos (## A1. Title) and scenes (### A1-S01. Title (about N s)) with one "- **EN:** text" line per
// language, from every projects/<name>/scripts/*.md in name order.
function scripts(p) {
  const sd = path.join(p.dir, 'scripts');
  const md = fs.readdirSync(sd).filter((f) => f.endsWith('.md')).sort()
    .map((f) => fs.readFileSync(path.join(sd, f), 'utf8')).join('\n');
  const videos = [];
  let video, scene;
  for (const line of md.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^## ([A-Z]+\d+[a-z]?)\. (.+)$/))) {
      video = { id: m[1], title: m[2], dir: `${m[1]}-${slug(m[2])}`, scenes: [] };
      videos.push(video);
    } else if ((m = line.match(/^### ([A-Z]+\d+[a-z]?-S\d+)\. ?(.+?)(?: \(about .+\))?$/)) && video) {
      scene = { id: m[1], title: m[2], text: {} };
      video.scenes.push(scene);
    } else if ((m = line.match(/^- \*\*([A-Z]{2,3}):\*\* (.+)$/)) && scene) {
      scene.text[m[1].toLowerCase()] = m[2].trim();
    }
  }
  return videos;
}

const clip = (p, v, s, lang, ext = '.mp3') => path.join(p.audio, v.dir, `${s.id}-${slug(s.title)}-${lang}${ext}`);
// Record-to slot in whole seconds: the longest language + 1 s. The screen take, the full tracks and the
// captions all use it, so every language lines up with the same footage.
const slotOf = (p, v, s) => Math.ceil(Math.max(...p.languages.map((l) => duration(clip(p, v, s, l)))) + 1);
const hasAudio = (p, v, s) => p.languages.every((l) => fs.existsSync(clip(p, v, s, l)) && fs.existsSync(clip(p, v, s, l, '.words.json')));

module.exports = { ROOT, project, slug, duration, scripts, clip, slotOf, hasAudio };
