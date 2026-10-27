// Drives a full-screen Chrome through one tutorial video while your screen recorder (Camtasia, OBS)
// records. Each scene lasts exactly its slot (longest language + 1 s, same as audio.js), so the full
// narration track lines up with no re-timing. A drawn cursor + click ripple is injected because the
// script never moves the real mouse. Click steps live in projects/<name>/videos.js.
//   node engine/record.js brandluka A1 bn            (one take per language; the cursor follows that narration)
//   node engine/record.js brandluka A1 en --dry      (print cue times only, no browser)
//   node engine/record.js brandluka A1 bn --from A1-S04   (retake from that scene on; splice it in the edit)
//   node engine/record.js brandluka open register    (same Chrome + cursor, driven by your own mouse)
// Auto-login only on localhost, from the project's .env; on a live site you log in yourself.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { project, scripts, clip, slotOf, hasAudio } = require('./lib');

const p = project(process.argv[2]);
const BASE = (process.env.APP_URL || p.config.url || '').replace(/\/+$/, '');
if (!BASE) throw new Error(`set "url" in projects/${p.name}/project.json or APP_URL in its .env`);
const SCALE = process.env.SCALE || p.config.scale || '1.1'; // browser zoom; 1.5 for bigger on-screen text
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const COLOR = p.config.cursorColor || '#7300d9';
const COUNTDOWN_S = 3; // still seconds before scene 1
const START_IN_S = 15; // on-screen countdown: time to press Record
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

// Drawn cursor: follows mousemove, ripples on mousedown, survives page loads via sessionStorage.
const CURSOR_JS = `(() => {
  const COLOR = ${JSON.stringify(COLOR)};
  const start = () => {
    const c = document.createElement('div');
    c.innerHTML = '<svg width="64" height="64" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6-3.6 6.9z" fill="' + COLOR + '" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-11px,-5px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))';
    const pos = JSON.parse(sessionStorage.getItem('__cursor') || '[960,540]');
    const place = (x, y) => { c.style.left = x + 'px'; c.style.top = y + 'px'; };
    place(...pos);
    document.documentElement.appendChild(c);
    // Hide the real pointer over the page; recorders draw it on their own layer otherwise.
    const hide = document.createElement('style'); hide.textContent = '*{cursor:none!important}'; document.documentElement.appendChild(hide);
    addEventListener('mousemove', (e) => { place(e.clientX, e.clientY); sessionStorage.setItem('__cursor', JSON.stringify([e.clientX, e.clientY])); }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:4px solid ' + COLOR + ';background:' + COLOR + '2e;left:' + e.clientX + 'px;top:' + e.clientY + 'px;transition:transform .5s ease-out,opacity .5s ease-out;transform:scale(.3)';
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.4)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', start) : start();
})();`;

function actions(page) {
  let at = { x: 960, y: 540 };
  // Eased glide to the element's centre; real mouse events so hover styles show.
  async function moveTo(target, ms = 700) {
    const loc = typeof target === 'string' ? page.locator(target).first() : target;
    await loc.waitFor();
    let b = await loc.boundingBox();
    if (!b) throw new Error(`not visible: ${target}`);
    // Off screen: glide the page there (a jump-cut scroll looks broken on video), then aim.
    const vh = await page.evaluate(() => innerHeight);
    if (b.y < 90 || b.y + b.height > vh - 40) {
      await scrollBy(b.y + b.height / 2 - vh / 2, 600);
      await sleep(150);
      b = await loc.boundingBox();
    }
    const to = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    // Clock-driven, not step-counted: each mouse.move round-trip to Chrome takes time too.
    const begin = Date.now();
    for (let t = 0; t < 1; ) {
      t = Math.min(1, (Date.now() - begin) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await page.mouse.move(at.x + (to.x - at.x) * e, at.y + (to.y - at.y) * e);
      await sleep(8);
    }
    at = to;
  }
  // Timed to the narration: `t` = ms into the current scene (from cue()). The glide starts early so
  // the cursor lands on the item as its name is spoken.
  const GLIDE = 700;
  const until = (t) => sleep(api.sceneStart + t - Date.now());
  async function pointAt(target, t) {
    await until(t - GLIDE);
    await moveTo(target, GLIDE);
  }
  // Arrive ~1 s before the word (rest on a button before clicking), click on it.
  async function clickAt(target, t) {
    await pointAt(target, t - 900);
    await until(t);
    // The page may have shifted since the glide: re-aim at the element's current spot before pressing.
    const loc = typeof target === 'string' ? page.locator(target).first() : target;
    const b = await loc.boundingBox();
    if (b) {
      const to = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      if (Math.hypot(to.x - at.x, to.y - at.y) > 3) {
        await page.mouse.move(to.x, to.y);
        at = to;
      }
    }
    await page.mouse.down();
    await page.mouse.up();
  }
  async function scrollBy(dy, ms) {
    const steps = Math.round(ms / 16);
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, dy / steps);
      await sleep(16);
    }
  }
  async function smoothScrollTo(selector, ms = 1200) {
    const dy = await page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().top - 120);
    await scrollBy(dy, ms);
  }
  // Click into a field as it is named and type at a readable pace. Demo text only.
  async function typeAt(target, text, t) {
    await pointAt(target, t);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.type(text, { delay: 30 });
  }
  const api = { sceneStart: Date.now(), moveTo, until, pointAt, clickAt, smoothScrollTo, scrollBy, typeAt };
  return api;
}

// cue('dashboard') = ms into the scene when that word is spoken. Each call searches after the previous
// cue, so a repeated word is fine. Pass every language's form: cue('balance', 'ব্যালেন্স'). Words
// match by prefix, so 'workspaces' also finds Bangla "Workspaces-এ".
function cuer(words, id) {
  let from = 0;
  // \p{M} kept: vowel signs in Bangla and other Indic scripts are marks, not letters.
  const norm = (s) => s.toLowerCase().replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, '');
  return (...alts) => {
    const i = words.findIndex((w, j) => j >= from && alts.some((a) => norm(w.text).startsWith(a.toLowerCase())));
    if (i < 0) throw new Error(`${id}: no word ${alts.join('/')} in the narration`);
    from = i + 1;
    return words[i].start * 1000;
  };
}

const launch = (kiosk) =>
  chromium.launch({
    executablePath: CHROME,
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'], // hides the "controlled by automated software" bar
    // kiosk: no address bar for scripted takes; open mode keeps it reachable (F11 / Ctrl+T).
    args: [kiosk ? '--kiosk' : '--start-fullscreen', `--force-device-scale-factor=${SCALE}`, '--disable-infobars'],
  });
// bypassCSP: a strict script-src blocks waitForFunction and the injected cursor.
async function newPage(browser) {
  const context = await browser.newContext({ viewport: null, bypassCSP: true });
  await context.addInitScript(CURSOR_JS);
  return context.newPage();
}

(async () => {
  if (process.argv[3] === 'open') {
    // Pass the path without a leading slash (`open register`): Git Bash rewrites "/register".
    const browser = await launch(false);
    const page = await newPage(browser);
    await page.goto(`${BASE}/${(process.argv[4] || '').replace(/^\/+/, '')}`);
    console.log('Chrome is open; close it when the take is done.');
    await new Promise((r) => browser.on('disconnected', r));
    return;
  }

  const VIDEOS = require(path.join(p.dir, 'videos.js'))({ base: BASE });
  const videoId = process.argv[3];
  const lang = process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4] : p.languages[0];
  const video = VIDEOS[videoId];
  if (!video) throw new Error(`usage: node engine/record.js ${p.name} <${Object.keys(VIDEOS).join('|')}|open> [${p.languages.join('|')}] [--dry] [--from <scene>]`);
  if (!p.languages.includes(lang)) throw new Error(`language must be one of ${p.languages.join(', ')}`);
  const from = process.argv.includes('--from') ? process.argv[process.argv.indexOf('--from') + 1] : null;
  if (from) {
    if (!video.scenes[from]) throw new Error(`no scene ${from} in ${videoId}`);
    const ids = Object.keys(video.scenes);
    video.scenes = Object.fromEntries(ids.slice(ids.indexOf(from)).map((id) => [id, video.scenes[id]]));
  }

  // Slots and word timings from the audio. A silent video carries fixed `slots` (ms) and no timings.
  let slot = video.slots, words = {};
  if (!slot) {
    const v = scripts(p).find((x) => x.id === videoId);
    if (!v) throw new Error(`no ## ${videoId}. section in projects/${p.name}/scripts`);
    const missing = Object.keys(video.scenes).filter((id) => !v.scenes.some((s) => s.id === id && hasAudio(p, v, s)));
    if (missing.length) throw new Error(`no audio or word timings for ${missing.join(', ')}; run engine/audio.js ${p.name} ${videoId} first`);
    slot = {};
    for (const s of v.scenes.filter((s) => video.scenes[s.id])) {
      slot[s.id] = slotOf(p, v, s) * 1000;
      words[s.id] = JSON.parse(fs.readFileSync(clip(p, v, s, lang, '.words.json'), 'utf8'));
    }
  }

  // --dry: print when each cursor move lands, from the word timings alone (no browser).
  if (process.argv.includes('--dry')) {
    const stub = new Proxy(() => stub, { get: (_, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => 0 : stub), apply: () => stub });
    for (const [id, run] of Object.entries(video.scenes)) {
      const log = (kind) => async (_t, t) => console.log(`  ${id} ${kind} at ${(t / 1000).toFixed(1)} s (slot ${slot[id] / 1000} s)`);
      await run(stub, { until: async () => {}, moveTo: async () => {}, smoothScrollTo: async () => {}, scrollBy: async () => {}, pointAt: log('point'), clickAt: log('click'), typeAt: async (_t, _x, t) => log('type')(_t, t) }, cuer(words[id] || [], id));
    }
    return;
  }

  const login = p.config.login;
  const autoLogin = /\/\/(localhost|127\.0\.0\.1)[:/]?/.test(BASE) && process.env.DEMO_EMAIL && process.env.DEMO_PASSWORD;
  const browser = await launch(true);
  const page = await newPage(browser);
  try {
    if (login && video.login !== false) {
      await page.goto(BASE + login.path);
      if (autoLogin) {
        await page.fill(login.email, process.env.DEMO_EMAIL);
        await page.fill(login.password, process.env.DEMO_PASSWORD);
        await page.click(login.submit);
      } else {
        console.log('Log in yourself in the Chrome window (live site: the script never types a password).');
      }
      await page.waitForURL(new RegExp(login.landed), { timeout: 0 });
    }
    await page.goto(BASE + video.start);
    if (video.ready) await video.ready(page);
    await page.mouse.move(960, 540);

    const total = Object.keys(video.scenes).reduce((s, id) => s + slot[id], 0);
    console.log(`${videoId} (${lang}): ${Object.keys(video.scenes).length} scenes, ${(total / 1000).toFixed(0)} s.`);
    // On-page countdown (the terminal is hidden behind full-screen Chrome); trim it out in the edit.
    // Starts by itself so you only press Record; Space starts early.
    await page.evaluate(
      (secs) =>
        new Promise((resolve) => {
          const b = document.createElement('div');
          b.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;text-align:center;background:#0f172a;color:#fff;font:600 30px system-ui;z-index:2147483647';
          document.documentElement.appendChild(b);
          let left = secs;
          // Removed when the countdown ends: left on, it swallowed every Space typed into the page.
          const onKey = (e) => e.code === 'Space' && (e.preventDefault(), done());
          const done = () => (removeEventListener('keydown', onKey), b.remove(), scrollTo(0, 0), resolve());
          const tick = () => {
            b.innerHTML = `Start your screen recorder now<br><span style="font-size:96px">${left}</span>`;
            if (left-- <= 0) return done();
            setTimeout(tick, 1000);
          };
          addEventListener('keydown', onKey);
          tick();
        }),
      START_IN_S
    );
    await sleep(COUNTDOWN_S * 1000);
    console.log('  recording.');

    const a = actions(page);
    let elapsed = 0;
    let t0 = Date.now();
    const rec0 = t0; // recording clock, for the cut points printed below
    const mmss = (ms) => new Date(ms).toISOString().slice(15, 19);
    for (const [id, run] of Object.entries(video.scenes)) {
      console.log(`  ${mmss(Date.now() - rec0)}  ${id}`);
      a.sceneStart = t0 + elapsed;
      await run(page, a, cuer(words[id] || [], id));
      elapsed += slot[id];
      const late = Date.now() - (t0 + elapsed);
      // An overrun (an AI wait, a slow page) pushes the clock, not the next scene's cues; cut it in the edit.
      if (late > 0) {
        console.warn(`  ! ${id} ran ${(late / 1000).toFixed(1)} s over: cut that much of the wait, ending at ${mmss(Date.now() - rec0)}`);
        t0 += late;
      }
      await sleep(t0 + elapsed - Date.now());
    }
    console.log(`  ${mmss(Date.now() - rec0)}  done: stop the recorder.`);
    await sleep(3000);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
