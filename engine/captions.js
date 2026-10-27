// Captions per video per language: projects/<name>/captions/<video>-<lang>.srt, timed to the full track
// (each scene padded to its slot), from the clips' word timings. Also prints each scene's start, for
// YouTube chapters.
//   node engine/captions.js brandluka          (every video with complete audio)
//   node engine/captions.js brandluka A1 A2    (only these)
// An edit that doesn't follow the full track (a hand-recorded middle, a wait left in) needs its
// captions shifted in the editor or YouTube Studio.
const fs = require('fs');
const path = require('path');
const { project, scripts, clip, slotOf, hasAudio } = require('./lib');

const MAX_CHARS = 42;
const ts = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Words -> cues: break at a sentence end, or before a line would pass MAX_CHARS.
function cues(words, offset) {
  const out = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    out.push({ start: offset + cur[0].start, end: offset + cur[cur.length - 1].end, text: cur.map((w) => w.text).join(' ') });
    cur = [];
  };
  for (const w of words) {
    if (cur.length && cur.map((x) => x.text).join(' ').length + 1 + w.text.length > MAX_CHARS) flush();
    cur.push(w);
    if (/[.?!।]["”]?$/.test(w.text)) flush();
  }
  flush();
  // Hold each cue until the next starts (max 1.5 s past its last word), so text doesn't blink.
  out.forEach((c, i) => (c.end = Math.min(out[i + 1] ? out[i + 1].start : c.end + 1.5, c.end + 1.5)));
  return out;
}

const [name, ...ids] = process.argv.slice(2);
const p = project(name);
fs.mkdirSync(p.captions, { recursive: true });
for (const v of scripts(p).filter((v) => !ids.length || ids.includes(v.id))) {
  const missing = v.scenes.filter((s) => !hasAudio(p, v, s)).map((s) => s.id);
  if (!v.scenes.length || missing.length) {
    console.warn(`skip ${v.id}: no audio or timings for ${missing.join(', ') || 'any scene'} (run engine/audio.js first)`);
    continue;
  }
  let at = 0;
  const starts = [];
  const srt = Object.fromEntries(p.languages.map((l) => [l, []]));
  for (const s of v.scenes) {
    starts.push(`${mmss(at)} ${s.id}`);
    for (const l of p.languages) srt[l].push(...cues(JSON.parse(fs.readFileSync(clip(p, v, s, l, '.words.json'), 'utf8')), at));
    at += slotOf(p, v, s);
  }
  for (const l of p.languages)
    fs.writeFileSync(path.join(p.captions, `${v.id}-${l}.srt`), srt[l].map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n'));
  console.log(`${v.id} (${mmss(at)}): ${starts.join(' · ')}`);
}
