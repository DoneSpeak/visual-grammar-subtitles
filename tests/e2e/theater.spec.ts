import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import http from 'node:http';
import path from 'node:path';

const EXTENSION_PATH = path.resolve('.output/chrome-mv3');

const PAGE = `<!doctype html><html><head><style>
  body { margin: 0; font-family: sans-serif; }
  #page { padding: 40px; height: 900px; background: #ddd; }
  #player { width: 640px; height: 360px; position: relative; background: #111; }
  #v { width: 100%; height: 100%; display: block; }
</style></head>
<body><div id="page"><div id="player"><video id="v"></video><div id="controls" style="position:absolute;bottom:0;left:0;right:0;height:40px;background:#333"></div></div></div></body></html>`;

let context: BrowserContext;
let worker: Worker;
let page: Page;
let server: http.Server;
let stop: () => Promise<void>;

test.beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  stop = () => new Promise((resolve) => server.close(() => resolve()));

  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
  [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  await worker.evaluate(() => chrome.storage.local.set({ 'ui:language': 'zh-CN' }));

  page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector('#jp-sub-host', { timeout: 10_000 });
});

test.afterAll(async () => {
  await context?.close();
  await stop?.();
});

test('theater button pins the player to the viewport', async () => {
  const rect = () =>
    page.evaluate(() => {
      const r = document.getElementById('player')!.getBoundingClientRect();
      const v = document.getElementById('v')!.getBoundingClientRect();
      return {
        player: [r.left, r.top, r.width, r.height],
        video: [v.left, v.top, v.width, v.height],
        inner: [window.innerWidth, window.innerHeight],
        style: !!document.getElementById('jp-theater-style'),
      };
    });

  await page.locator('#jp-sub-host .dock button.theater').click();
  await page.waitForTimeout(300);
  const entered = await rect();
  expect(entered.style).toBe(true);
  expect(entered.player).toEqual([0, 0, 1280, 720]);
  expect(entered.video).toEqual([0, 0, 1280, 720]);

  // The clicked button must not keep focus: Space belongs to the player's play/pause.
  expect(await page.evaluate(() => document.activeElement?.id ?? '')).not.toBe('jp-sub-host');
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  expect((await rect()).style).toBe(true);

  await page.locator('#jp-sub-host .dock button.theater').click();
  await page.waitForTimeout(300);
  const restored = await rect();
  expect(restored.style).toBe(false);
  expect(restored.player).toEqual([40, 40, 640, 360]);
});

test('settings panel closes on an outside click', async () => {
  const panel = page.locator('#jp-sub-host #jp-sub-panel');
  await page.locator('#jp-sub-host .dock button:not(.theater)').click();
  await expect(panel).toBeVisible();

  await page.mouse.click(1200, 650);
  await expect(panel).toBeHidden();
});

test('a live language switch relabels the panel in place', async () => {
  const panel = page.locator('#jp-sub-host #jp-sub-panel');
  await page.locator('#jp-sub-host .dock button:not(.theater)').click();
  await expect(panel.locator('h4')).toHaveText('字幕设置');
  const menusBefore = await page.locator('#jp-sub-host .lib-menu').count();

  await worker.evaluate(() => chrome.storage.local.set({ 'ui:language': 'en-GB' }));

  await expect(page.locator('#jp-sub-host #jp-sub-panel h4')).toHaveText('Subtitle settings');
  await expect(page.locator('#jp-sub-host #jp-sub-panel')).toHaveCount(1);
  expect(await page.locator('#jp-sub-host .lib-menu').count()).toBe(menusBefore);
  // The host page's own document must stay untouched; only the shadow host is labelled.
  expect(await page.evaluate(() => document.documentElement.getAttribute('lang'))).toBeNull();
  await expect(page.locator('#jp-sub-host')).toHaveAttribute('lang', 'en-GB');
});
