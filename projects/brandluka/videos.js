// Brandluka click steps, one entry per video, keyed by the ids in scripts/*.md. Ported from
// digital_marketing/brandluka_tutorial/record.js (A1 so far; the rest of its VIDEOS table moves the same way).
// Video: { start, ready(page), login?: false, slots?: {sceneId: ms}, scenes: { 'A1-S01': (page, a, cue) => ... } }
// Every movement waits for the word that names it; the rest of the slot is held still.
const topLink = (page, name) => page.locator('header nav').getByRole('link', { name, exact: true });
// Match the label span, not the link's name: a new workspace shows a "Needed" badge inside Brand Identity.
const sideLink = (page, name) => page.locator('aside nav a').filter({ has: page.getByText(name, { exact: true }) });

module.exports = () => ({
  A1: {
    start: '/app/dashboard',
    ready: async (page) => {
      await page.waitForFunction(() => !/Loading/.test(document.getElementById('credits-summary')?.textContent || 'Loading'));
      // The workspace list loads separately from the credits; wait for it before counting cards.
      await page.waitForFunction(() => !/Loading/.test(document.getElementById('workspaces-list')?.textContent || 'Loading'));
      if (!(await page.locator('[data-workspace-card]').count())) throw new Error('demo account has no workspace; A1 needs one');
    },
    scenes: {
      // No card is named, so sweep them on the four phrases: team, brand, posts, "show you".
      'A1-S01': async (page, a, cue) => {
        await a.pointAt('#credits-summary', cue('marketing', 'মার্কেটিং'));
        await a.pointAt('#workspaces-summary', cue('brand', 'ব্র্যান্ড'));
        await a.pointAt('#posts-summary', cue('posts', 'পোস্ট'));
        await a.pointAt('#tickets-summary', cue('show', 'দেখাবো'));
      },
      'A1-S02': async (page, a, cue) => {
        for (const name of ['Dashboard', 'Workspaces', 'Ad Campaigns', 'Tutorials', 'Support', 'Billing', 'Settings'])
          await a.pointAt(topLink(page, name), cue(name.split(' ')[0]));
      },
      'A1-S03': async (page, a, cue) => {
        await a.pointAt('#credits-chip', cue('purple', 'বেগুনি'));
        await a.pointAt('#credits-summary', cue('balance', 'ব্যালেন্স'));
      },
      'A1-S04': async (page, a, cue) => {
        await a.smoothScrollTo('#workspaces-list');
        await a.moveTo('[data-workspace-card] span');
        await a.clickAt('[data-workspace-card] span', cue('open', 'খুলে'));
        await page.waitForURL(/\/content-plans/);
      },
      'A1-S05': async (page, a, cue) => {
        await a.pointAt(page.locator('aside nav p', { hasText: /^\s*Brand\s*$/ }), cue('brand'));
        await a.pointAt(sideLink(page, 'Brand Identity'), cue('logo', 'লোগো'));
        await a.pointAt(sideLink(page, 'Brand Intelligence'), cue('report', 'রিপোর্ট'));
        await a.pointAt(sideLink(page, 'Marketing Plan'), cue('marketing', 'মার্কেটিং'));
        await a.pointAt(sideLink(page, 'Products'), cue('products', 'প্রোডাক্ট'));
        await a.pointAt(sideLink(page, 'Social'), cue('facebook'));
      },
      'A1-S06': async (page, a, cue) => {
        await a.pointAt(page.locator('aside nav p', { hasText: /^\s*Library\s*$/ }), cue('library'));
        await a.pointAt(sideLink(page, 'Content Plan'), cue('content'));
        await a.pointAt(sideLink(page, 'Content Calendar'), cue('calendar'));
        await a.pointAt(sideLink(page, 'Static Creatives'), cue('static'));
        await a.pointAt(sideLink(page, 'Video Creatives'), cue('video'));
        await a.pointAt(sideLink(page, 'Carousel Creatives'), cue('carousel'));
        await a.pointAt(sideLink(page, 'Templates'), cue('templates'));
        await a.pointAt(sideLink(page, 'Moodboard'), cue('moodboard'));
      },
      'A1-S07': async (page, a, cue) => {
        await a.clickAt(topLink(page, 'Tutorials'), cue('tutorials'));
        await page.waitForURL(/\/app\/tutorials/);
        await a.moveTo('main', 1200);
      },
    },
  },
});
