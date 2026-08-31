/**
 * End-to-end proof that the app is genuinely independent of any computer:
 * it installs its service worker, then plays a real game against Stockfish
 * with the network switched off.
 *
 * Usage:
 *   npm run build
 *   npx serve dist -l 8900        (or: cd dist && python3 -m http.server 8900)
 *   npm i -D playwright && npx playwright install chromium
 *   node e2e/offline.mjs
 *
 * Kept out of `npm test` on purpose: it needs a browser download and a built
 * bundle, while `npm test` (vitest) must stay fast and dependency-light.
 */
import { chromium } from 'playwright-core';

const URL = process.env.APP_URL ?? 'http://localhost:8900/';
const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, // phone-sized
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'allow',
});
const page = await context.newPage();
page.on('pageerror', (e) => check('no uncaught page error', false, e.message));

// 1. First visit (online): the service worker must install and precache.
await page.goto(URL);
await page.waitForSelector('button:has-text("Blancs")');
await page.waitForFunction(
  async () => Boolean((await navigator.serviceWorker.getRegistration())?.active),
  { timeout: 30000 },
);
check('service worker installed', true);

await page.waitForTimeout(2500); // let workbox finish writing the precache
const engineCached = await page.evaluate(async () => {
  const found = [];
  for (const name of await caches.keys()) {
    for (const req of await (await caches.open(name)).keys()) {
      if (req.url.includes('/engine/')) found.push(req.url.split('/').pop().split('?')[0]);
    }
  }
  return found;
});
check('engine precached for offline use', engineCached.includes('stockfish.wasm'), engineCached.join(', '));

// 2. Cut the network completely.
await context.setOffline(true);
const netDown = await page.evaluate(async () => {
  try {
    await fetch('https://example.com/probe-' + Date.now(), { mode: 'no-cors' });
    return false;
  } catch {
    return true;
  }
});
check('network really is unreachable (control)', netDown);

// 3. The app must still load from scratch.
await page.reload();
await page.waitForSelector('button:has-text("Blancs")', { timeout: 20000 });
check('app reloads with no network', true);

// 4. Play as black, so the engine has to move first — offline.
await page.tap('button:has-text("Noirs")');
await page.tap('button:has-text("1500")');
await page.tap('button:has-text("Commencer la partie")');
await page.waitForSelector('[data-square="e7"]', { timeout: 20000 });

await page.waitForFunction(() => document.querySelectorAll('.move-list li').length >= 1, {
  timeout: 60000,
});
check('Stockfish moves while offline', true, (await page.$eval('.move-list li', (e) => e.textContent)).trim());

// The opponent panel must name the engine, not the player.
const topPanel = await page.$eval('.player-panel', (el) => el.textContent ?? '');
check('opponent panel identifies the AI', topPanel.includes('Stockfish'), topPanel.trim());

// 5. Answer with a real move and get another engine reply.
await page.tap('[data-square="e7"]');
await page.waitForTimeout(300);
await page.tap('[data-square="e5"]');
await page.waitForFunction(() => document.querySelectorAll('.move-list li').length >= 2, {
  timeout: 60000,
});
check('full move exchange works offline', true);

// 6. Finish the game and confirm it is archived on the device.
await page.tap('button:has-text("Abandonner")');
await page.tap('button:has-text("Oui, abandonner")');
await page.waitForTimeout(500);
const archive = await page.evaluate(() => {
  const games = JSON.parse(localStorage.getItem('coach-echecs.saved-games') ?? '[]');
  return { count: games.length, pgn: games[0]?.pgn ?? '', result: games[0]?.result };
});
check('finished game archived as PGN on the device', archive.count === 1 && archive.pgn.includes('[Result'), archive.result);

await browser.close();

console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll offline checks passed');
process.exit(failures.length ? 1 : 0);
