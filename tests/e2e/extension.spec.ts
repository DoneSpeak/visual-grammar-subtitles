import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import path from 'node:path';

const EXTENSION_PATH = path.resolve('.output/chrome-mv3');

let context: BrowserContext;
let extensionId: string;
let worker: Worker;
let popup: Page;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });

  [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  extensionId = new URL(worker.url()).host;

  // Pin the stored language before any extension page or content script starts.
  await worker.evaluate(() => chrome.storage.local.set({ 'ui:language': 'zh-CN' }));

  popup = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
});

test('popup renders search, tabs and theme control', async () => {
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(popup.getByRole('searchbox', { name: '搜索字幕' })).toBeVisible();
  await expect(popup.getByRole('tab', { name: '字幕' })).toHaveAttribute('aria-selected', 'true');
  await expect(popup.getByRole('group', { name: '主题' })).toBeVisible();
});

test('switching to dark mode writes data-theme', async () => {
  await popup.getByRole('group', { name: '主题' }).getByRole('button', { name: '深' }).click();
  await expect(popup.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('sites tab lists the built-in site rules', async () => {
  await popup.getByRole('tab', { name: '站点' }).click();
  await expect(popup.getByRole('switch', { name: 'bilibili 番剧 启用' })).toBeVisible();
});

test('options page renders and shares the theme', async () => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(options.getByRole('heading', { level: 1, name: '字幕包' })).toBeVisible();
  await expect(options.getByRole('navigation', { name: '设置页面' })).toBeVisible();

  await options.getByRole('link', { name: '词性配色' }).click();
  await expect(options.getByRole('heading', { level: 1, name: '词性配色' })).toBeVisible();
  await expect(options).toHaveURL(/#colors$/);

  await expect(options.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('options page theme switch updates the attribute', async () => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#dict`);

  await expect(options.getByRole('heading', { level: 1, name: '学习词典' })).toBeVisible();
  await options.getByRole('group', { name: '主题' }).getByRole('button', { name: '浅色' }).click();
  await expect(options.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('language control switches live, persists, and switches back', async () => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#dict`);
  await expect(options.getByRole('heading', { level: 1, name: '学习词典' })).toBeVisible();

  await options.getByRole('group', { name: '语言' }).getByRole('button', { name: 'English' }).click();

  await expect(options.locator('html')).toHaveAttribute('lang', 'en-GB');
  await expect(options.getByRole('heading', { level: 1, name: 'Learning dictionary' })).toBeVisible();
  await expect(options.getByRole('link', { name: 'Part-of-speech colours' })).toBeVisible();
  expect(
    await worker.evaluate(async () => (await chrome.storage.local.get('ui:language'))['ui:language']),
  ).toBe('en-GB');

  await options.reload();
  await expect(options.locator('html')).toHaveAttribute('lang', 'en-GB');
  await expect(options.getByRole('heading', { level: 1, name: 'Learning dictionary' })).toBeVisible();

  await options.getByRole('group', { name: 'Language' }).getByRole('button', { name: '中文' }).click();
  await expect(options.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(options.getByRole('heading', { level: 1, name: '学习词典' })).toBeVisible();
});
