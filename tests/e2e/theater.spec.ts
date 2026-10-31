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

/** Player document for framed players (doodstream-style embeds): the video lives in another frame. */
const FRAME_PAGE = `<!doctype html><html><head><style>
  body { margin: 0; background: #111; }
  #player { width: 100vw; height: 100vh; position: relative; }
  #v { width: 100%; height: 100%; display: block; }
</style></head>
<body><div id="player"><video id="v"></video></div></body></html>`;

/** Host page that embeds the player in an iframe, with an ancestor that would trap fixed children. */
const TOP_PAGE = `<!doctype html><html><head><style>
  body { margin: 0; background: #ddd; }
  #wrap { padding: 20px; transform: translateZ(0); }
  iframe { width: 640px; height: 360px; border: 0; display: block; }
</style></head>
<body><div id="wrap"><iframe id="player-frame" src="/frame"></iframe></div></body></html>`;

let context: BrowserContext;
let worker: Worker;
let page: Page;
let server: http.Server;
let origin = '';
let stop: () => Promise<void>;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    if (req.url === '/frame') res.end(FRAME_PAGE);
    else if (req.url === '/top') res.end(TOP_PAGE);
    else res.end(PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  origin = `http://127.0.0.1:${port}`;
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
  await page.goto(`${origin}/`);
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

test('the transcript splits the viewport instead of covering the video', async () => {
  const rect = () =>
    page.evaluate(() => {
      const r = document.getElementById('player')!.getBoundingClientRect();
      return {
        player: [r.left, r.top, r.width, r.height],
        style: !!document.getElementById('jp-theater-style'),
      };
    });

  await page.locator('#jp-sub-host .dock button[aria-label="显示完整字幕流"]').click();
  await page.waitForTimeout(300);
  const split = await rect();
  // The player keeps the left strip; the transcript takes the right one.
  expect(split.style).toBe(true);
  expect(split.player).toEqual([0, 0, 900, 720]);
  const panel = page.locator('#jp-sub-host .transcript');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box?.x).toBeCloseTo(900, 0);
  expect(box?.width).toBeCloseTo(380, 0);

  await page.locator('#jp-sub-host .transcript button[aria-label="关闭字幕流"]').click();
  await page.waitForTimeout(300);
  const restored = await rect();
  // The split entered theater on its own, so closing it must hand the page back.
  expect(restored.style).toBe(false);
  expect(restored.player).toEqual([40, 40, 640, 360]);
});

test('the bottom split shortens the player instead of covering it', async () => {
  const rect = () =>
    page.evaluate(() => {
      const r = document.getElementById('player')!.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height];
    });

  await page.locator('#jp-sub-host .dock button[aria-label="显示完整字幕流"]').click();
  await page.waitForTimeout(300);
  // All three layouts are offered at once, with the current one pressed.
  const modes = page.locator('#jp-sub-host .transcript .tx-mode');
  await expect(modes).toHaveCount(3);
  await expect(page.locator('#jp-sub-host .transcript button[aria-label="右侧分栏"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('#jp-sub-host .transcript button[aria-label="下方分栏"]').click();
  await page.waitForTimeout(300);

  expect(await rect()).toEqual([0, 0, 1280, 446]);
  const box = await page.locator('#jp-sub-host .transcript').boundingBox();
  expect(box?.y).toBeCloseTo(446, 0);
  expect(box?.height).toBeCloseTo(274, 0);
  await expect(page.locator('#jp-sub-host .transcript button[aria-label="下方分栏"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Floating keeps the pin: the drawer covers the lifted player instead of handing the page back.
  await page.locator('#jp-sub-host .transcript button[aria-label="悬浮显示"]').click();
  await page.waitForTimeout(300);
  expect(await rect()).toEqual([0, 0, 1280, 720]);
  expect(await page.evaluate(() => !!document.getElementById('jp-theater-style'))).toBe(true);
  const floating = await page.locator('#jp-sub-host .transcript').boundingBox();
  expect(floating?.x).toBeCloseTo(912, 0);
  expect(floating?.width).toBeCloseTo(360, 0);

  await page.locator('#jp-sub-host .transcript button[aria-label="右侧分栏"]').click();
  await page.waitForTimeout(300);
  expect(await rect()).toEqual([0, 0, 900, 720]);

  await page.locator('#jp-sub-host .transcript button[aria-label="关闭字幕流"]').click();
  await page.waitForTimeout(300);
  expect(await rect()).toEqual([40, 40, 640, 360]);
});

test('a framed player splits inside the lifted frame', async () => {
  const top = await context.newPage();
  await top.goto(`${origin}/top`);
  await top.waitForSelector('#player-frame');
  const child = (await (await top.$('#player-frame'))!.contentFrame())!;
  await child.waitForSelector('#jp-sub-host', { timeout: 10_000 });

  await child.locator('#jp-sub-host .dock button[aria-label="显示完整字幕流"]').click();
  await top.waitForTimeout(600);

  // The host page's transform ancestor must not keep the lifted frame in its old box.
  const frame = await top.evaluate(() => {
    const r = document.getElementById('player-frame')!.getBoundingClientRect();
    return [r.left, r.top, r.width, r.height];
  });
  expect(frame).toEqual([0, 0, 1280, 720]);

  const state = await child.evaluate(() => {
    const p = document.getElementById('player')!.getBoundingClientRect();
    const host = document.querySelector('#jp-sub-host')!.shadowRoot!;
    const t = host.querySelector('.transcript')!.getBoundingClientRect();
    return {
      player: [p.left, p.top, p.width, p.height],
      panel: [t.left, t.top, t.width, t.height],
      viewport: [innerWidth, innerHeight],
    };
  });
  // The frame's viewport is the whole screen after the lift, so the split applies inside it.
  expect(state.viewport).toEqual([1280, 720]);
  expect(state.player).toEqual([0, 0, 900, 720]);
  expect(state.panel[0]).toBeCloseTo(900, 0);
  expect(state.panel[2]).toBeCloseTo(380, 0);

  await child.locator('#jp-sub-host .transcript button[aria-label="关闭字幕流"]').click();
  await top.waitForTimeout(300);
  const restored = await top.evaluate(() => {
    const r = document.getElementById('player-frame')!.getBoundingClientRect();
    return [r.left, r.top, r.width, r.height];
  });
  expect(restored).toEqual([20, 20, 640, 360]);
  await top.close();
});

test('settings panel closes on an outside click', async () => {
  const panel = page.locator('#jp-sub-host #jp-sub-panel');
  await page.locator('#jp-sub-host .dock button[title="字幕设置"]').click();
  await expect(panel).toBeVisible();

  await page.mouse.click(1200, 650);
  await expect(panel).toBeHidden();
});

test('a live language switch relabels the panel in place', async () => {
  const panel = page.locator('#jp-sub-host #jp-sub-panel');
  await page.locator('#jp-sub-host .dock button[title="字幕设置"]').click();
  await expect(panel.locator('h4')).toHaveText('字幕设置');
  const menusBefore = await page.locator('#jp-sub-host .lib-menu').count();

  await worker.evaluate(() => chrome.storage.local.set({ 'ui:language': 'en-GB' }));

  await expect(page.locator('#jp-sub-host #jp-sub-panel h4')).toHaveText('Settings');
  await expect(page.locator('#jp-sub-host #jp-sub-panel')).toHaveCount(1);
  expect(await page.locator('#jp-sub-host .lib-menu').count()).toBe(menusBefore);
  // The host page's own document must stay untouched; only the shadow host is labelled.
  expect(await page.evaluate(() => document.documentElement.getAttribute('lang'))).toBeNull();
  await expect(page.locator('#jp-sub-host')).toHaveAttribute('lang', 'en-GB');
});
